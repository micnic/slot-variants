import { execFileSync } from 'node:child_process';
import {
	mkdtempSync,
	mkdirSync,
	rmSync,
	writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const temporaryDirectory = mkdtempSync(join(tmpdir(), 'slot-variants-package-'));
const npmCache = join(temporaryDirectory, 'npm-cache');
const environment = { ...process.env, npm_config_cache: npmCache };

const run = (command, args, cwd = root) =>
	execFileSync(command, args, {
		cwd,
		env: environment,
		stdio: 'pipe',
		encoding: 'utf8'
	});

try {
	const packageReport = JSON.parse(
		run('npm', ['pack', '--dry-run', '--json'])
	)[0];
	const publishedFiles = packageReport.files.map(({ path }) => path).sort();
	const expectedFiles = [
		'LICENSE',
		'README.md',
		'SKILL.md',
		'dist/eslint-plugin.cjs',
		'dist/eslint-plugin.d.ts',
		'dist/eslint-plugin.js',
		'dist/index.cjs',
		'dist/index.d.ts',
		'dist/index.js',
		'logo.svg',
		'package.json'
	];

	if (JSON.stringify(publishedFiles) !== JSON.stringify(expectedFiles)) {
		throw new Error(
			`Unexpected package contents:\n${publishedFiles.join('\n')}`
		);
	}

	const packOutput = JSON.parse(
		run('npm', [
			'pack',
			'--json',
			'--pack-destination',
			temporaryDirectory
		])
	)[0];
	const tarball = join(temporaryDirectory, packOutput.filename);
	const consumerDirectory = join(temporaryDirectory, 'consumer');
	mkdirSync(consumerDirectory);

	run('npm', [
		'install',
		'--ignore-scripts',
		'--no-package-lock',
		'--no-save',
		tarball
	], consumerDirectory);

	writeFileSync(
		join(consumerDirectory, 'package.json'),
		JSON.stringify({ private: true, type: 'module' })
	);
	writeFileSync(
		join(consumerDirectory, 'esm.mjs'),
		"import { sv } from 'slot-variants';\nimport plugin from 'slot-variants/eslint-plugin';\nif (sv('a', 'b') !== 'a b' || !plugin.rules['no-conflicting-classes']) process.exit(1);\n"
	);
	writeFileSync(
		join(consumerDirectory, 'commonjs.cjs'),
		"const { sv } = require('slot-variants');\nconst plugin = require('slot-variants/eslint-plugin').default;\nif (sv('a', 'b') !== 'a b' || !plugin.rules['no-conflicting-classes']) process.exit(1);\n"
	);
	writeFileSync(
		join(consumerDirectory, 'consumer.ts'),
		"import { sv, type VariantProps } from 'slot-variants';\nimport plugin from 'slot-variants/eslint-plugin';\nconst button = sv({ slots: { icon: 'icon' }, variants: { size: { sm: 'sm', lg: 'lg' } } });\ntype Props = VariantProps<typeof button>;\nconst props: Props = { size: 'sm' };\nconst result = button(props);\n// @ts-expect-error slot results are readonly\nresult.icon = 'changed';\nvoid plugin.rules;\n"
	);

	run('node', ['esm.mjs'], consumerDirectory);
	run('node', ['commonjs.cjs'], consumerDirectory);
	run(
		join(root, 'node_modules', '.bin', 'tsc'),
		[
			'--noEmit',
			'--strict',
			'--skipLibCheck',
			'--target',
			'ES2022',
			'--module',
			'NodeNext',
			'--moduleResolution',
			'NodeNext',
			'consumer.ts'
		],
		consumerDirectory
	);

	console.log('Packed package passed ESM, CommonJS, plugin, type, and contents checks.');
} finally {
	rmSync(temporaryDirectory, { recursive: true, force: true });
}