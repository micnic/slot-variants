import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import t from 'tap';
import ts from 'typescript';

type DocumentedMember = { name: string; doc: string };

type LspResponse = {
	id?: number;
	method?: string;
	result?: { contents?: { value?: string } } | null;
};

type PendingRequest = {
	resolve: (response: LspResponse) => void;
	reject: (error: Error) => void;
};

type LspClient = {
	request: (method: string, params: object | null) => Promise<LspResponse>;
	notify: (method: string, params: object | null) => void;
};

const root = fileURLToPath(new URL('..', import.meta.url));
const typesPath = join(root, 'src/sv/types.ts');

// Never written to disk: both language services read it from memory.
const fixturePath = join(root, 'test/hover-docs.fixture.ts');
const fixtureHeader = [
	"import { sv } from '../src/index.ts';",
	"const button = sv('btn', { introspection: true, variants: { size: { sm: 'a' } } });"
];
const memberPrefix = 'button.';

const lspHeaderSeparator = '\r\n\r\n';

/**
 * The native TypeScript 7 executable from the platform package that the
 * `typescript7` alias installs. Its `bin/tsc` launcher is a Node script, and
 * tap's spawn hooks would load the TypeScript loader into it.
 */
const getTs7ExePath = () => {
	const ts7Require = createRequire(
		createRequire(import.meta.url).resolve('typescript7/package.json')
	);
	const platformPackage = `@typescript/typescript-${process.platform}-${process.arch}`;
	const packageDir = dirname(
		ts7Require.resolve(`${platformPackage}/package.json`)
	);

	if (process.platform === 'win32') {
		return join(packageDir, 'lib/tsc.exe');
	}

	return join(packageDir, 'lib/tsc');
};

/**
 * Reads the `IntrospectionValues` members and their JSDoc text straight from
 * the source, so a newly added field is checked without updating this test.
 */
const getIntrospectionMembers = (): DocumentedMember[] => {
	const source = ts.createSourceFile(
		typesPath,
		readFileSync(typesPath, 'utf8'),
		ts.ScriptTarget.Latest,
		true
	);
	const members: DocumentedMember[] = [];

	source.forEachChild((node) => {
		if (
			!ts.isTypeAliasDeclaration(node) ||
			node.name.text !== 'IntrospectionValues' ||
			!ts.isTypeLiteralNode(node.type)
		) {
			return;
		}

		for (const member of node.type.members) {
			if (!member.name || !ts.isIdentifier(member.name)) {
				continue;
			}

			let doc = '';

			for (const jsDoc of ts.getJSDocCommentsAndTags(member)) {
				if (ts.isJSDoc(jsDoc)) {
					doc = ts.getTextOfJSDocComment(jsDoc.comment) ?? '';
				}
			}

			members.push({ name: member.name.text, doc });
		}
	});

	return members;
};

const getFixtureSource = (members: readonly DocumentedMember[]) =>
	[
		...fixtureHeader,
		...members.map(({ name }) => `${memberPrefix}${name};`)
	].join('\n');

// Each member access sits on its own line after the header, right after the
// `button.` prefix.
const getMemberPosition = (index: number) => ({
	line: fixtureHeader.length + index,
	character: memberPrefix.length
});

const getTs6Hovers = (
	source: string,
	members: readonly DocumentedMember[]
): string[] => {
	const config = ts.getParsedCommandLineOfConfigFile(
		join(root, 'tsconfig.json'),
		{},
		{ ...ts.sys, onUnRecoverableConfigFileDiagnostic: () => {} }
	);

	if (config === undefined) {
		throw new Error('Cannot read tsconfig.json');
	}

	const fixture = ts.createSourceFile(
		fixturePath,
		source,
		ts.ScriptTarget.Latest
	);

	const service = ts.createLanguageService({
		getScriptFileNames: () => [fixturePath],
		getScriptVersion: () => '1',
		getScriptSnapshot: (fileName) => {
			if (fileName === fixturePath) {
				return ts.ScriptSnapshot.fromString(source);
			}

			if (!ts.sys.fileExists(fileName)) {
				return undefined;
			}

			return ts.ScriptSnapshot.fromString(readFileSync(fileName, 'utf8'));
		},
		getCurrentDirectory: () => root,
		getCompilationSettings: () => config.options,
		getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
		fileExists: ts.sys.fileExists,
		readFile: ts.sys.readFile
	});

	return members.map((_, index) => {
		const { line, character } = getMemberPosition(index);
		const info = service.getQuickInfoAtPosition(
			fixturePath,
			ts.getPositionOfLineAndCharacter(fixture, line, character)
		);

		return ts.displayPartsToString(info?.documentation);
	});
};

/**
 * A minimal JSON-RPC client over the server's stdio, enough to open a document
 * and ask for hovers. Requests the server sends to the client get an empty
 * reply.
 */
const createLspClient = (server: ChildProcessWithoutNullStreams): LspClient => {
	const pending = new Map<number, PendingRequest>();
	let buffer = Buffer.alloc(0);
	let nextId = 0;

	let stderr = '';

	server.stderr.on('data', (chunk: Buffer) => {
		stderr += chunk.toString();
	});

	// Fails every waiting request instead of leaving the test hanging.
	server.on('exit', (code) => {
		for (const { reject } of pending.values()) {
			reject(
				new Error(`TypeScript 7 exited with code ${code}: ${stderr}`)
			);
		}

		pending.clear();
	});

	const send = (message: object) => {
		const body = JSON.stringify({ jsonrpc: '2.0', ...message });

		server.stdin.write(
			`Content-Length: ${Buffer.byteLength(body)}${lspHeaderSeparator}${body}`
		);
	};

	const handle = (response: LspResponse) => {
		if (response.id === undefined) {
			return;
		}

		if (response.method !== undefined) {
			send({ id: response.id, result: null });
			return;
		}

		pending.get(response.id)?.resolve(response);
		pending.delete(response.id);
	};

	server.stdout.on('data', (chunk: Buffer) => {
		buffer = Buffer.concat([buffer, chunk]);

		for (;;) {
			const headerEnd = buffer.indexOf(lspHeaderSeparator);

			if (headerEnd === -1) {
				return;
			}

			const header = buffer.subarray(0, headerEnd).toString();
			const length = Number(/Content-Length: (\d+)/i.exec(header)?.[1]);
			const bodyStart = headerEnd + lspHeaderSeparator.length;

			if (buffer.length < bodyStart + length) {
				return;
			}

			const response: LspResponse = JSON.parse(
				buffer.subarray(bodyStart, bodyStart + length).toString()
			);

			buffer = buffer.subarray(bodyStart + length);
			handle(response);
		}
	});

	return {
		request: (method, params) =>
			new Promise((resolve, reject) => {
				nextId++;
				pending.set(nextId, { resolve, reject });
				send({ id: nextId, method, params });
			}),
		notify: (method, params) => {
			send({ method, params });
		}
	};
};

const getTs7Hovers = async (
	server: ChildProcessWithoutNullStreams,
	source: string,
	members: readonly DocumentedMember[]
): Promise<string[]> => {
	const client = createLspClient(server);
	const uri = pathToFileURL(fixturePath).href;

	await client.request('initialize', {
		processId: process.pid,
		rootUri: pathToFileURL(root).href,
		capabilities: {
			textDocument: { hover: { contentFormat: ['markdown'] } }
		}
	});
	client.notify('initialized', {});
	client.notify('textDocument/didOpen', {
		textDocument: {
			uri,
			languageId: 'typescript',
			version: 1,
			text: source
		}
	});

	const hovers: string[] = [];

	for (const [index] of members.entries()) {
		const response = await client.request('textDocument/hover', {
			textDocument: { uri },
			position: getMemberPosition(index)
		});

		hovers.push(response.result?.contents?.value ?? '');
	}

	await client.request('shutdown', null);
	client.notify('exit', null);

	return hovers;
};

const members = getIntrospectionMembers();
const fixtureSource = getFixtureSource(members);

t.test('every introspection field has a JSDoc comment', (t) => {
	t.ok(members.length > 0, 'IntrospectionValues has members');

	for (const { name, doc } of members) {
		t.not(doc, '', `${name} is documented`);
	}

	t.end();
});

t.test('TypeScript 6 shows introspection JSDoc on hover', (t) => {
	const hovers = getTs6Hovers(fixtureSource, members);

	members.forEach(({ name, doc }, index) => {
		t.match(hovers[index], doc, `${name} hover shows its JSDoc`);
	});

	t.end();
});

t.test('TypeScript 7 shows introspection JSDoc on hover', async (t) => {
	const server = spawn(getTs7ExePath(), ['--lsp', '--stdio'], { cwd: root });

	t.teardown(() => {
		server.kill();
	});

	const hovers = await getTs7Hovers(server, fixtureSource, members);

	members.forEach(({ name, doc }, index) => {
		t.match(hovers[index], doc, `${name} hover shows its JSDoc`);
	});
});