import * as fs from 'node:fs';
import { rmSync, utimesSync } from 'node:fs';
import { join } from 'node:path';
import t from 'tap';
import { ESLint, Linter, RuleTester } from 'eslint';
import { parser as tsParser } from 'typescript-eslint';
import * as vueParser from 'vue-eslint-parser';
import plugin, { rules } from '../../src/eslint-plugin.ts';
import {
	CROSS_FILE_INVALID,
	CROSS_FILE_VALID,
	SVELTE_CROSS_FILE_INVALID,
	SVELTE_CROSS_FILE_VALID,
	TS_CROSS_FILE_INVALID,
	TS_CROSS_FILE_VALID,
	VUE_CROSS_FILE_INVALID,
	VUE_CROSS_FILE_VALID
} from './cross-file.cases.ts';
import { fixtureDir, writeFixture } from './fixtures.ts';
import {
	IMPORT,
	IMPORT_CREATE_SV,
	jsxTester,
	svelteTester,
	vueTester
} from './helpers.ts';
import {
	RESTYLE_INVALID,
	RESTYLE_SVELTE_INVALID,
	RESTYLE_SVELTE_VALID,
	RESTYLE_VALID,
	RESTYLE_VUE_INVALID,
	RESTYLE_VUE_VALID
} from './no-restyle.cases.ts';

t.test('no-restyle', (t) => {
	t.doesNotThrow(() => {
		jsxTester.run('no-restyle', rules['no-restyle'], {
			valid: [
				...RESTYLE_VALID,
				...CROSS_FILE_VALID,
				...TS_CROSS_FILE_VALID
			],
			invalid: [
				...RESTYLE_INVALID,
				...CROSS_FILE_INVALID,
				...TS_CROSS_FILE_INVALID
			]
		});
	}, 'rule tester passes');
	t.end();
});

t.test('no-restyle (svelte)', (t) => {
	t.doesNotThrow(() => {
		svelteTester.run('no-restyle', rules['no-restyle'], {
			valid: [...RESTYLE_SVELTE_VALID, ...SVELTE_CROSS_FILE_VALID],
			invalid: [...RESTYLE_SVELTE_INVALID, ...SVELTE_CROSS_FILE_INVALID]
		});
	}, 'rule tester passes');
	t.end();
});

t.test('no-restyle (vue)', (t) => {
	t.doesNotThrow(() => {
		vueTester.run('no-restyle', rules['no-restyle'], {
			valid: [...RESTYLE_VUE_VALID, ...VUE_CROSS_FILE_VALID],
			invalid: [...RESTYLE_VUE_INVALID, ...VUE_CROSS_FILE_INVALID]
		});
	}, 'rule tester passes');
	t.end();
});

// An imported module is parsed with its importer's parser, so a page whose
// parser can't read the module must not leave a cached failure behind for a
// page whose parser can.
t.test('no-restyle reparses a module for a different parser', (t) => {
	writeFixture(
		'ui/Shared.vue',
		`<script setup>
		${IMPORT}const shared = sv({ base: 'p-2', variants: {} });
		const props = defineProps({ class: String });
		</script>
		<template><b :class="shared({ class: props.class })">x</b></template>`
	);

	const linter = new Linter({ cwd: fixtureDir });
	const restyleRule: Linter.RulesRecord = { 'slot-variants/no-restyle': 2 };
	const jsxMessages = linter.verify(
		`import Shared from './ui/Shared.vue';\n<Shared className="p-4" />;`,
		{
			files: ['**/*.jsx'],
			plugins: { 'slot-variants': plugin },
			rules: restyleRule,
			languageOptions: {
				parserOptions: { ecmaFeatures: { jsx: true } }
			}
		},
		{ filename: join(fixtureDir, 'page.jsx') }
	);
	const vueMessages = linter.verify(
		`<script setup>import Shared from './ui/Shared.vue';</script>\n<template><Shared class="p-4" /></template>`,
		{
			files: ['**/*.vue'],
			plugins: { 'slot-variants': plugin },
			rules: restyleRule,
			languageOptions: { parser: vueParser }
		},
		{ filename: join(fixtureDir, 'page.vue') }
	);

	t.same(jsxMessages, [], 'the JSX page cannot read the Vue module');
	t.match(
		vueMessages,
		[{ ruleId: 'slot-variants/no-restyle', messageId: 'conflict' }],
		'the Vue page still reads it'
	);
	t.end();
});

// A type-based `defineProps<…>()` casts a `boolean` prop an element leaves
// out to `false`, like a runtime `Boolean` one: read from an inline object
// type, or a same-file interface or alias of one, under `withDefaults()` too.
t.test('no-restyle reads type-based Vue Boolean props', (t) => {
	const component = (name: string, script: string, props = 'props') => {
		writeFixture(
			`typed-props/${name}.vue`,
			`<script setup lang="ts">
			${IMPORT}const flat = sv({ base: 'p-2', variants: { flat: { true: 'shadow-none', false: 'shadow' } } });
			${script}
			</script>
			<template><b :class="flat({ flat: ${props}.flat, class: ${props}.class })">x</b></template>`
		);
	};

	component(
		'Inline',
		'const props = defineProps<{ class?: string; flat?: boolean }>();'
	);
	component(
		'Interface',
		`export interface Props { class?: string; flat?: boolean | string; [k: string]: unknown; 'x-y'?: boolean; 1?: boolean; [key]?: boolean; m(): void; n; }
		const props = defineProps<Props>();`
	);
	component(
		'Alias',
		`type Props = { class?: string; flat?: boolean };
		const props = withDefaults(defineProps<Props>(), {});`
	);
	component(
		'Defaulted',
		`type Props = { class?: string; flat?: boolean };
		const props = withDefaults(defineProps<Props>(), { flat: true });`
	);
	component('Qualified', 'const props = defineProps<NS.Props>();');
	component(
		'Composed',
		`type Base = { class?: string };
		type Props = Base & { flat?: boolean };
		const props = defineProps<Props>();`
	);
	component(
		'Intersection',
		'const props = defineProps<{ class?: string } & { flat?: boolean }>();'
	);
	component(
		'Stringly',
		'const props = defineProps<{ class?: string; flat?: string }>();'
	);
	component('Bare', 'const props = withDefaults();');
	component(
		'Wrapped',
		`const base = defineProps<{ class?: string; flat?: boolean }>();
		const props = withDefaults(base, {});`
	);

	const names = [
		'Inline',
		'Interface',
		'Alias',
		'Defaulted',
		'Qualified',
		'Composed',
		'Intersection',
		'Stringly',
		'Bare',
		'Wrapped'
	];
	const linter = new Linter({ cwd: fixtureDir });
	const imports = names
		.map((name) => `import ${name} from './typed-props/${name}.vue';`)
		.join('\n');
	const elements = names
		.map((name) => `<${name} class="shadow-lg" />`)
		.join('');
	const messages = linter.verify(
		`<script setup lang="ts">${imports}</script>\n<template>${elements}</template>`,
		{
			files: ['**/*.vue'],
			plugins: { 'slot-variants': plugin },
			rules: { 'slot-variants/no-restyle': 2 },
			languageOptions: {
				parser: vueParser,
				parserOptions: { parser: tsParser }
			}
		},
		{ filename: join(fixtureDir, 'page.vue') }
	);

	t.same(
		messages.map(({ message }) => message),
		[
			'Class "shadow-lg" conflicts with "shadow" applied to the "base" slot.',
			'Class "shadow-lg" conflicts with "shadow" applied to the "base" slot.',
			'Class "shadow-lg" conflicts with "shadow" applied to the "base" slot.',
			'Class "shadow-lg" conflicts with "shadow-none" applied to the "base" slot.'
		],
		'Inline, Interface, Alias and Defaulted cast flat; the rest leave it unset'
	);
	t.end();
});

// The same parser reads a module differently under other parser options, so a
// failure cached under one set of them isn't handed to another.
t.test('no-restyle reparses a module for other parser options', (t) => {
	writeFixture(
		'ui/Typed.vue',
		`<script setup lang="ts">
		${IMPORT}const typed = sv({ base: 'p-2', variants: {} });
		const props: { class?: string } = defineProps({ class: String });
		</script>
		<template><b :class="typed({ class: props.class })">x</b></template>`
	);

	const linter = new Linter({ cwd: fixtureDir });
	const page = `<script setup>import Typed from './ui/Typed.vue';</script>\n<template><Typed class="p-4" /></template>`;
	const lintPage = (languageOptions: Linter.LanguageOptions) =>
		linter.verify(
			page,
			{
				files: ['**/*.vue'],
				plugins: { 'slot-variants': plugin },
				rules: { 'slot-variants/no-restyle': 2 },
				languageOptions
			},
			{ filename: join(fixtureDir, 'page.vue') }
		);

	t.same(
		lintPage({ parser: vueParser }),
		[],
		'without a TypeScript parser the module cannot be read'
	);
	t.match(
		lintPage({ parser: vueParser, parserOptions: { parser: tsParser } }),
		[{ ruleId: 'slot-variants/no-restyle', messageId: 'conflict' }],
		'with one it is read'
	);
	t.end();
});

// Refreshing a stale module overwrites its own cache entry, so a full cache
// keeps every other module instead of evicting the oldest one.
t.test('no-restyle refreshes a stale module without evicting', async (t) => {
	// The loader's cache limit, filled exactly
	const moduleCount = 200;
	const reads = new Map<string, number>();
	const fresh = await t.mockImport<
		typeof import('../../src/eslint-plugin.ts')
	>('../../src/eslint-plugin.ts', {
		'node:fs': {
			...fs,
			readFileSync: new Proxy(fs.readFileSync, {
				apply: (target, thisArg, args) => {
					const path = `${args[0]}`;

					reads.set(path, (reads.get(path) ?? 0) + 1);

					return Reflect.apply(target, thisArg, args);
				}
			})
		}
	});
	const paths = Array.from({ length: moduleCount }, (_value, index) =>
		writeFixture(
			`evict/mod${index}.tsx`,
			`${IMPORT}const mod = sv({ base: 'p-2', variants: {} });

			export function Mod${index}({ className }) {
				return <i className={mod({ class: className })} />;
			}
			`
		)
	);
	// One ESLint instance keeps one config, as a real run does, so the
	// parser options the cache is keyed by stay the same between files
	const eslint = new ESLint({
		cwd: fixtureDir,
		overrideConfigFile: true,
		overrideConfig: {
			files: ['**/*.tsx'],
			plugins: { 'slot-variants': fresh.default },
			rules: { 'slot-variants/no-restyle': 2 },
			languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } }
		}
	});
	const lintUsages = async (indexes: readonly number[]) => {
		const imports = indexes.map(
			(index) => `import { Mod${index} } from './evict/mod${index}.tsx';`
		);
		const usages = indexes.map(
			(index) => `<Mod${index} className="p-4" />;`
		);

		await eslint.lintText(`${imports.join('\n')}\n${usages.join('\n')}`, {
			filePath: join(fixtureDir, 'page.tsx')
		});
	};
	const [oldest] = paths;
	const newest = paths.at(-1);

	if (oldest === undefined || newest === undefined) {
		throw new Error('No modules were written');
	}

	await lintUsages(paths.map((_path, index) => index));
	await lintUsages([0]);
	t.equal(reads.get(oldest), 1, 'a full cache still hands out the oldest');

	const later = new Date(Date.now() + 60_000);

	utimesSync(newest, later, later);
	await lintUsages([moduleCount - 1]);
	t.equal(reads.get(newest), 2, 'the stale module is read again');

	await lintUsages([0]);
	t.equal(reads.get(oldest), 1, 'the oldest module is still cached');
});

// Config blocks with different language options keep their own cache entry
// for a module they share, rather than evicting each other's.
t.test('no-restyle caches a module per set of language options', async (t) => {
	const reads = new Map<string, number>();
	const fresh = await t.mockImport<
		typeof import('../../src/eslint-plugin.ts')
	>('../../src/eslint-plugin.ts', {
		'node:fs': {
			...fs,
			readFileSync: new Proxy(fs.readFileSync, {
				apply: (target, thisArg, args) => {
					const path = `${args[0]}`;

					reads.set(path, (reads.get(path) ?? 0) + 1);

					return Reflect.apply(target, thisArg, args);
				}
			})
		}
	});
	const shared = writeFixture(
		'per-options/shared.jsx',
		`${IMPORT}const shared = sv({ base: 'p-2', variants: {} });

		export function Shared({ className }) {
			return <i className={shared({ class: className })} />;
		}
		`
	);
	const eslint = new ESLint({
		cwd: fixtureDir,
		overrideConfigFile: true,
		overrideConfig: [
			{
				files: ['**/*.jsx'],
				plugins: { 'slot-variants': fresh.default },
				rules: { 'slot-variants/no-restyle': 2 },
				languageOptions: {
					parserOptions: { ecmaFeatures: { jsx: true } }
				}
			},
			{
				files: ['**/legacy/*.jsx'],
				languageOptions: { ecmaVersion: 2022 }
			}
		]
	});
	const lint = async (filePath: string) => {
		const [result] = await eslint.lintText(
			'import { Shared } from \'../per-options/shared.jsx\';\n<Shared className="p-4" />;',
			{ filePath: join(fixtureDir, filePath) }
		);

		return result?.messages.length;
	};

	for (const page of ['modern/a.jsx', 'legacy/a.jsx', 'modern/b.jsx']) {
		t.equal(await lint(page), 1, `${page} reports the restyle`);
	}

	t.equal(await lint('legacy/b.jsx'), 1, 'legacy/b.jsx reports it');
	t.equal(reads.get(shared), 2, 'each config block reads the module once');
});

// An imported module is only read for its syntax, so a type-aware parser
// setup on the importer must not stop it from parsing: here the module is
// reached through an alias the tsconfig doesn't know, which leaves it outside
// the TypeScript project the page is linted with.
t.test('no-restyle reads a module outside the typed project', (t) => {
	writeFixture(
		'typed/tsconfig.json',
		JSON.stringify({
			compilerOptions: { jsx: 'preserve' },
			include: ['page.tsx']
		})
	);
	writeFixture(
		'typed/ui/button.tsx',
		`${IMPORT}const button = sv({ base: 'p-2', variants: {} });

		export function Button({ className }) {
			return <button className={button({ class: className })} />;
		}
		`
	);

	const code = `import { Button } from '@/ui/button.tsx';\n<Button className="p-4" />;`;
	const page = writeFixture('typed/page.tsx', code);
	const typedDir = join(fixtureDir, 'typed');
	const messages = new Linter({ cwd: typedDir }).verify(
		code,
		{
			files: ['**/*.tsx'],
			plugins: { 'slot-variants': plugin },
			rules: {
				'slot-variants/no-restyle': [2, { alias: { '@/': typedDir } }]
			},
			languageOptions: {
				parser: tsParser,
				parserOptions: {
					ecmaFeatures: { jsx: true },
					project: './tsconfig.json',
					tsconfigRootDir: typedDir
				}
			}
		},
		{ filename: page }
	);

	t.match(
		messages,
		[{ ruleId: 'slot-variants/no-restyle', messageId: 'conflict' }],
		'the imported button is still read'
	);
	t.end();
});
// A module linted earlier in the run is read from the scan its own lint made,
// rather than parsed again for the file importing it — but only when that
// scan is of the text the file holds on disk.
t.test('no-restyle reuses the scan of a module linted earlier', async (t) => {
	const reads = new Map<string, number>();
	const fresh = await t.mockImport<
		typeof import('../../src/eslint-plugin.ts')
	>('../../src/eslint-plugin.ts', {
		'node:fs': {
			...fs,
			readFileSync: new Proxy(fs.readFileSync, {
				apply: (target, thisArg, args) => {
					const path = `${args[0]}`;

					reads.set(path, (reads.get(path) ?? 0) + 1);

					return Reflect.apply(target, thisArg, args);
				}
			})
		}
	});
	const component = (name: string) =>
		`${IMPORT}const styles = sv({ base: 'p-2', variants: {} });

		export function ${name}({ className }) {
			return <i className={styles({ class: className })} />;
		}
		`;
	const seeded = writeFixture('seed/seeded.tsx', component('Seeded'));
	const barrel = writeFixture(
		'seed/index.ts',
		"export * from './other.tsx';\n"
	);
	const edited = writeFixture('seed/edited.tsx', component('Edited'));
	const single = writeFixture(
		'seed/Single.vue',
		`<script setup>
		${IMPORT}const single = sv({ base: 'p-2', variants: {} });
		const props = defineProps({ class: String });
		</script>
		<template><b :class="single({ class: props.class })">x</b></template>`
	);

	writeFixture('seed/other.tsx', component('Other'));

	const plugins = { 'slot-variants': fresh.default };
	const rules: Linter.RulesRecord = { 'slot-variants/no-restyle': 2 };
	// One ESLint instance keeps one config, as a real run does, so a module
	// and the page importing it share the language options the cache is
	// keyed by
	const eslint = new ESLint({
		cwd: fixtureDir,
		overrideConfigFile: true,
		overrideConfig: [
			{
				files: ['**/*.ts', '**/*.tsx'],
				plugins,
				rules,
				languageOptions: {
					parserOptions: { ecmaFeatures: { jsx: true } }
				}
			},
			{
				files: ['**/*.vue'],
				plugins,
				rules,
				languageOptions: { parser: vueParser }
			}
		]
	});
	const lintPage = async (code: string, page = 'page.tsx') => {
		const [result] = await eslint.lintText(code, {
			filePath: join(fixtureDir, page)
		});

		return result?.messages;
	};
	const conflict = [
		{ ruleId: 'slot-variants/no-restyle', messageId: 'conflict' }
	];

	await eslint.lintFiles([seeded, barrel, single]);
	t.equal(reads.get(seeded), 1, 'a forwarding component is read once');
	t.equal(reads.get(barrel), 1, 'a barrel is read once');
	t.equal(reads.get(single), 1, 'a single-file component is read once');

	t.match(
		await lintPage(
			`import { Seeded } from './seed/seeded.tsx';\nimport { Other } from './seed/index.ts';\n<Seeded className="p-4" />;\n<Other className="p-4" />;`
		),
		[conflict[0], conflict[0]],
		'both imports are resolved'
	);
	t.equal(reads.get(seeded), 1, 'the component is not parsed again');
	t.equal(reads.get(barrel), 1, 'the barrel is not parsed again');
	t.match(
		await lintPage(
			`<script setup>import Single from './seed/Single.vue';</script>\n<template><Single class="p-4" /></template>`,
			'page.vue'
		),
		conflict,
		'the single-file component is resolved'
	);
	t.equal(
		reads.get(single),
		1,
		'the single-file component is not parsed again'
	);

	// An unsaved editor buffer isn't what an importer reads from disk
	await eslint.lintText(`${component('Edited')}// unsaved\n`, {
		filePath: edited
	});
	t.equal(reads.get(edited), 1, 'the buffer is compared to the file');
	t.match(
		await lintPage(
			`import { Edited } from './seed/edited.tsx';\n<Edited className="p-4" />;`
		),
		conflict,
		'the edited component is resolved'
	);
	t.equal(reads.get(edited), 2, 'the edited component is parsed from disk');

	// A file that isn't on disk is never cached
	t.same(
		await lintPage(component('Ghost'), 'seed/ghost.tsx'),
		[],
		'a file missing from disk lints without errors'
	);
});
// A type, an overload signature or a namespace sharing a name declares no
// other value, so the name still resolves to its one value definition.
t.test('no-restyle reads a name a type also declares', (t) => {
	const tsxTester = new RuleTester({
		languageOptions: {
			parser: tsParser,
			parserOptions: { ecmaFeatures: { jsx: true } }
		}
	});
	const button = "const button = sv({ base: 'p-2', variants: {} });\n";
	const forward =
		'({ className }: Props) => <b className={button({ class: className })} />';
	const conflict = { messageId: 'conflict' };

	t.doesNotThrow(() => {
		tsxTester.run('no-restyle', rules['no-restyle'], {
			valid: [],
			invalid: [
				{
					code: `${IMPORT}${button}type button = ReturnType<typeof button>;\nbutton({ class: 'p-4' });`,
					filename: 'test.tsx',
					errors: [conflict]
				},
				{
					code: `${IMPORT}${button}const C = ${forward};\ntype C = typeof C;\n<C className="p-4" />;`,
					filename: 'test.tsx',
					errors: [conflict]
				},
				{
					code: `${IMPORT}${button}function Over(props: Other): null;\nfunction Over({ className }: Props) { return <b className={button({ class: className })} />; }\n<Over className="p-4" />;`,
					filename: 'test.tsx',
					errors: [conflict]
				},
				{
					code: `${IMPORT}${button}function Merged({ className }: Props) { return <b className={button({ class: className })} />; }\nnamespace Merged { export type Size = string; }\n<Merged className="p-4" />;`,
					filename: 'test.tsx',
					errors: [conflict]
				}
			]
		});
	}, 'rule tester passes');
	t.end();
});

// A callee in a type-only wrapper is read through it, like any other value.
t.test('no-restyle reads callees through type-only wrappers', (t) => {
	const tsTester = new RuleTester({ languageOptions: { parser: tsParser } });
	const button = "const b = sv({ base: 'p-2', variants: {} });\n";
	const list =
		"const list = sv({ slots: { item: 'px-2' }, multiSlots: ['item'] });\nconst classes = list();\n";

	t.doesNotThrow(() => {
		tsTester.run('no-restyle', rules['no-restyle'], {
			valid: [],
			invalid: [
				{
					code: IMPORT + button + "b!({ class: 'p-4' });",
					filename: 'test.ts',
					errors: [{ messageId: 'conflict' }]
				},
				{
					code: IMPORT + button + "(b as Fn)({ class: 'p-4' });",
					filename: 'test.ts',
					errors: [{ messageId: 'conflict' }]
				},
				{
					// Type arguments given without a call name the same `sv`.
					code:
						IMPORT +
						"const typed = sv<any>;\nconst b = typed({ base: 'p-2', variants: {} });\nb({ class: 'p-4' });",
					filename: 'test.ts',
					errors: [{ messageId: 'conflict' }]
				},
				{
					code: IMPORT + list + "classes.item!({ class: 'px-4' });",
					filename: 'test.ts',
					errors: [{ messageId: 'conflict' }]
				}
			]
		});
	}, 'rule tester passes');
	t.end();
});

const BUTTON_BODY = `const button = mk({ base: 'p-2', variants: {} });

export function Button({ className }) {
	return <i className={button({ class: className })} />;
}
`;

const createJsxLinter = (rules: Linter.RulesRecord) =>
	new ESLint({
		cwd: fixtureDir,
		overrideConfigFile: true,
		overrideConfig: {
			files: ['**/*.jsx'],
			plugins: { 'slot-variants': plugin },
			rules,
			languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } }
		}
	});

const lintJsxPage = async (eslint: ESLint, code: string) => {
	const results = await eslint.lintText(code, {
		filePath: join(fixtureDir, 'page.jsx')
	});

	return results.flatMap((result) =>
		result.messages.map((message) => message.ruleId)
	);
};

// A cached module holds what its own imports led to, so it's read again when
// one of them changes or goes away.
t.test('no-restyle reads a module again when its imports change', async (t) => {
	const factory = writeFixture(
		'stale/sv.js',
		'export const mk = notAFactory();\n'
	);

	writeFixture(
		'stale/button.jsx',
		`import { mk } from './sv.js';\n${BUTTON_BODY}`
	);

	const eslint = createJsxLinter({ 'slot-variants/no-restyle': 2 });
	const lintPage = () =>
		lintJsxPage(
			eslint,
			'import { Button } from \'./stale/button.jsx\';\n<Button className="p-4" />;'
		);

	t.same(await lintPage(), [], 'the import is no factory');

	const later = new Date(Date.now() + 60_000);

	writeFixture(
		'stale/sv.js',
		`${IMPORT_CREATE_SV}export const mk = createSV();\n`
	);
	utimesSync(factory, later, later);
	t.same(
		await lintPage(),
		['slot-variants/no-restyle'],
		'the import became a factory'
	);

	rmSync(factory);
	t.same(await lintPage(), [], 'the import is gone');
});

// A module is cached per set of aliases, so a rule resolving without the
// `alias` option of another doesn't hand it a module read without them.
t.test('no-restyle keeps a module read with its own aliases', async (t) => {
	writeFixture(
		'aliased/sv.js',
		`${IMPORT_CREATE_SV}export const mk = createSV();\n`
	);
	writeFixture(
		'aliased/button.jsx',
		`import { mk } from '@a/sv.js';\nexport { mk };\n${BUTTON_BODY}`
	);

	const eslint = createJsxLinter({
		'slot-variants/no-conflicting-classes': 2,
		'slot-variants/no-restyle': [
			2,
			{ alias: { '@a/': join(fixtureDir, 'aliased') } }
		]
	});

	t.same(
		await lintJsxPage(
			eslint,
			"import { Button, mk } from './aliased/button.jsx';\nconst x = mk({ base: 'm-1', variants: {} });\n<Button className=\"p-4\" />;"
		),
		['slot-variants/no-restyle']
	);
});

// Modules importing each other are read from wherever the cycle is entered,
// so neither is left with what the other could give it while under way.
t.test('no-restyle reads modules importing each other whole', async (t) => {
	const component = (name: string, factory: string, base: string) =>
		`const styles = ${factory}({ base: '${base}', variants: {} });

		export function ${name}({ className }) {
			return <i className={styles({ class: className })} />;
		}
		`;

	writeFixture(
		'mutual/a.jsx',
		`${IMPORT_CREATE_SV}import { svB } from './b.jsx';
		export const svA = createSV();
		${component('A', 'svB', 'm-2')}`
	);
	writeFixture(
		'mutual/b.jsx',
		`${IMPORT_CREATE_SV}import { svA } from './a.jsx';
		export const svB = createSV();
		${component('B', 'svA', 'p-2')}`
	);

	const eslint = createJsxLinter({ 'slot-variants/no-restyle': 2 });
	const lintA = () =>
		lintJsxPage(
			eslint,
			'import { A } from \'./mutual/a.jsx\';\n<A className="m-4" />;'
		);
	const lintB = () =>
		lintJsxPage(
			eslint,
			'import { B } from \'./mutual/b.jsx\';\n<B className="p-4" />;'
		);

	t.same(await lintA(), ['slot-variants/no-restyle'], 'entered at a');
	t.same(await lintB(), ['slot-variants/no-restyle'], 'entered at b');
	t.same(await lintA(), ['slot-variants/no-restyle'], 'entered at a again');
});