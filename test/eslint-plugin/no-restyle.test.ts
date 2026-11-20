import * as fs from 'node:fs';
import { utimesSync } from 'node:fs';
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
import { IMPORT, jsxTester, svelteTester, vueTester } from './helpers.ts';
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
					code: IMPORT + list + "classes.item!({ class: 'px-4' });",
					filename: 'test.ts',
					errors: [{ messageId: 'conflict' }]
				}
			]
		});
	}, 'rule tester passes');
	t.end();
});