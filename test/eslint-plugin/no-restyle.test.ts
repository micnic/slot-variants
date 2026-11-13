import * as fs from 'node:fs';
import { utimesSync } from 'node:fs';
import { join } from 'node:path';
import t from 'tap';
import { ESLint, Linter } from 'eslint';
import { parser as tsParser } from 'typescript-eslint';
import * as vueParser from 'vue-eslint-parser';
import plugin, { rules } from '../../src/eslint-plugin.ts';
import {
	CROSS_FILE_INVALID,
	CROSS_FILE_VALID,
	SVELTE_CROSS_FILE_INVALID,
	SVELTE_CROSS_FILE_VALID,
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
			valid: [...RESTYLE_VALID, ...CROSS_FILE_VALID],
			invalid: [...RESTYLE_INVALID, ...CROSS_FILE_INVALID]
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
		${IMPORT}const shared = sv({ base: 'p-2' });
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
		${IMPORT}const typed = sv({ base: 'p-2' });
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
			`${IMPORT}const mod = sv({ base: 'p-2' });

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
		`${IMPORT}const button = sv({ base: 'p-2' });

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