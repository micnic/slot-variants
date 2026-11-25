import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import t from 'tap';
import { Linter } from 'eslint';
import * as svelteParser from 'svelte-eslint-parser';
import { parser as tsParser } from 'typescript-eslint';
import * as vueParser from 'vue-eslint-parser';
import pkg from '../../package.json' with { type: 'json' };
import plugin, { rules } from '../../src/eslint-plugin.ts';
import { IMPORT, IMPORT_CN, IMPORT_SV_CN, repeat } from './helpers.ts';

t.test('shared plugin run reuses cached property analysis', (t) => {
	const linter = new Linter();
	const code = `${IMPORT}const rest = { body: 'ignored' };
		sv({ ...rest, base: 'flex' });
		sv({
			base: [''],
			variants: {
				size: {
					sm: 'rounded rounded',
					lg: 'rounded rounded'
				}
			},
			defaultVariants: { size: 'sm' }
		});`;
	const config: Linter.Config[] = [
		{
			files: ['**/*.ts'],
			plugins: { 'slot-variants': plugin },
			rules: {
				'slot-variants/no-empty-classes': 2,
				'slot-variants/no-conflicting-classes': 2,
				'slot-variants/no-shared-tokens': 2
			},
			languageOptions: {
				ecmaVersion: 'latest',
				sourceType: 'module'
			}
		}
	];
	const summarizeByRuleId = (
		messages: Array<{ ruleId: string | null }>
	): Record<string, number> => {
		const counts: Record<string, number> = {};

		for (const message of messages) {
			if (!message.ruleId) {
				continue;
			}

			counts[message.ruleId] = (counts[message.ruleId] ?? 0) + 1;
		}

		return counts;
	};
	const firstMessages = linter.verify(code, config, { filename: 'test.ts' });
	const secondMessages = linter.verify(linter.getSourceCode(), config, {
		filename: 'test.ts'
	});

	t.equal(
		firstMessages.length,
		9,
		'first pass reports expected number of violations'
	);
	t.equal(
		secondMessages.length,
		9,
		'second pass reports expected number of violations'
	);
	t.same(
		summarizeByRuleId(secondMessages),
		{
			'slot-variants/no-empty-classes': 1,
			'slot-variants/no-conflicting-classes': 4,
			'slot-variants/no-shared-tokens': 4
		},
		'second pass keeps the expected rule counts while exercising cached valid and invalid object analysis'
	);
	t.same(
		summarizeByRuleId(secondMessages),
		summarizeByRuleId(firstMessages),
		'cached pass reports the same rule distribution as the initial pass'
	);
	t.end();
});

t.test('TypeScript wrappers are read through to the value they wrap', (t) => {
	const linter = new Linter();
	const config: Linter.Config[] = [
		{
			files: ['**/*.ts', '**/*.tsx'],
			plugins: { 'slot-variants': plugin },
			rules: Object.fromEntries(
				Object.keys(rules).map((name) => [`slot-variants/${name}`, 2])
			),
			languageOptions: {
				parser: tsParser,
				parserOptions: { ecmaFeatures: { jsx: true } }
			}
		}
	];
	const lint = (code: string, filename: string) =>
		linter
			.verify(`${IMPORT_SV_CN}${code}`, config, { filename })
			.map(({ ruleId, messageId }) => `${ruleId}:${messageId}`);
	const forwardRefButton = (cast: string) =>
		`const button = sv({ base: 'p-2', variants: {} });\nconst Button = forwardRef(({ className }, ref) => <button ref={ref} className={button({ class: className })} />)${cast};\n<Button className="p-4" />;`;
	const cases = [
		[
			"sv({ base: 'p-2 p-4', variants: {} });",
			"sv({ base: 'p-2 p-4', variants: {} } as const);",
			'test.tsx'
		],
		[
			"const base = 'p-2 p-4';\nsv({ base, variants: {} });",
			"const base = 'p-2 p-4' as const;\nsv({ base, variants: {} });",
			'test.tsx'
		],
		[
			"const config = { base: 'p-2 p-4', variants: {} };\nsv(config);",
			"const config = { base: 'p-2 p-4', variants: {} } satisfies Record<string, string>;\nsv(config);",
			'test.tsx'
		],
		[
			"const card = sv({ slots: { header: 'p-2' } });\nconst classes = card();\ncn(classes.header, 'p-4');",
			"const card = sv({ slots: { header: 'p-2' } });\nconst classes = card();\ncn(classes?.header, 'p-4');",
			'test.tsx'
		],
		[
			"const button = sv({ base: 'p-2', variants: {} });\ncn(button(), 'p-4');",
			"const button = sv({ base: 'p-2', variants: {} });\ncn(button()!, 'p-4');",
			'test.tsx'
		],
		[
			"const button = sv({ base: 'p-2', variants: {} });\n<div className={button({ class: 'p-4' })} />;",
			"const button = sv({ base: 'p-2', variants: {} }) satisfies object;\n<div className={button({ class: 'p-4' })} />;",
			'test.tsx'
		],
		[forwardRefButton(''), forwardRefButton(' as typeof Impl'), 'test.tsx'],
		[
			"sv({ base: 'p-2 p-4', variants: {} });",
			"sv({ base: <string>'p-2 p-4', variants: {} });",
			'test.ts'
		]
	] as const;

	for (const [plain, wrapped, filename] of cases) {
		const expected = lint(plain, filename);

		t.not(expected.length, 0, `reports the plain form: ${plain}`);
		t.strictSame(lint(wrapped, filename), expected, wrapped);
	}

	t.end();
});

// A `declare const` has no initializer, so its value is unknown, like any
// other value that can't be read statically.
t.test('an ambient `declare const` is not read through', (t) => {
	const linter = new Linter();
	const messages = linter.verify(
		`${IMPORT}declare const base: string;\nsv({ base, variants: {} });`,
		{
			files: ['**/*.ts'],
			plugins: { 'slot-variants': plugin },
			rules: { 'slot-variants/no-dynamic-classes': 2 },
			languageOptions: { parser: tsParser }
		},
		{ filename: 'test.ts' }
	);

	t.match(messages, [
		{
			ruleId: 'slot-variants/no-dynamic-classes',
			messageId: 'dynamic',
			line: 3,
			column: 6
		}
	]);
	t.equal(messages.length, 1);
	t.end();
});

t.test('const containers are read like inline ones', (t) => {
	const linter = new Linter();
	const config: Linter.Config[] = [
		{
			files: ['**/*.jsx'],
			plugins: { 'slot-variants': plugin },
			rules: Object.fromEntries(
				Object.keys(rules).map((name) => [`slot-variants/${name}`, 2])
			),
			languageOptions: {
				ecmaVersion: 'latest',
				sourceType: 'module',
				parserOptions: { ecmaFeatures: { jsx: true } }
			}
		}
	];
	// Sorted: a hoisted container sits above the call, so its findings come
	// first in source order.
	const lint = (code: string) =>
		linter
			.verify(`${IMPORT_SV_CN}${code}`, config, { filename: 'test.jsx' })
			.map(({ ruleId, messageId }) => `${ruleId}:${messageId}`)
			.sort();
	const sizes = "{ sm: 'p-1 p-2', lg: 'p-1  p-3' }";
	const cases = [
		// A variant's value record.
		[
			`sv({ variants: { size: ${sizes} } });`,
			`const sizes = ${sizes};\nsv({ variants: { size: sizes } });`
		],
		// The whole `variants` object.
		[
			`sv({ variants: { size: ${sizes} } });`,
			`const variants = { size: ${sizes} };\nsv({ variants });`
		],
		// `slots`.
		[
			"sv({ slots: { header: 'p-1 p-2' } });",
			"const slots = { header: 'p-1 p-2' };\nsv({ slots });"
		],
		// A slot-keyed variant value.
		[
			"sv({ slots: { icon: 'h-2' }, variants: { size: { sm: { base: 'p-1 p-2', icon: 'w-2' } } } });",
			"const sm = { base: 'p-1 p-2', icon: 'w-2' };\nsv({ slots: { icon: 'h-2' }, variants: { size: { sm } } });"
		],
		// A `compoundVariants` array, and one entry of it.
		[
			"sv({ variants: { size: { sm: 'w-1' } }, compoundVariants: [{ size: 'sm', class: 'w-2' }] });",
			"const compounds = [{ size: 'sm', class: 'w-2' }];\nsv({ variants: { size: { sm: 'w-1' } }, compoundVariants: compounds });"
		],
		[
			"sv({ variants: { size: { sm: 'w-1' } }, compoundVariants: [{ size: 'sm', class: 'w-2' }] });",
			"const entry = { size: 'sm', class: 'w-2' };\nsv({ variants: { size: { sm: 'w-1' } }, compoundVariants: [entry] });"
		],
		// A `compoundSlots` entry's `slots` array.
		[
			"sv({ slots: { icon: 'w-1' }, variants: { size: { sm: 'p-1' } }, compoundSlots: [{ slots: ['icon'], size: 'sm', class: 'w-2' }] });",
			"const targets = ['icon'];\nsv({ slots: { icon: 'w-1' }, variants: { size: { sm: 'p-1' } }, compoundSlots: [{ slots: targets, size: 'sm', class: 'w-2' }] });"
		],
		// An empty class array inside a hoisted record.
		[
			'sv({ variants: { size: { sm: [] } } });',
			'const sizes = { sm: [] };\nsv({ variants: { size: sizes } });'
		],
		// `defaultVariants` and `requiredVariants` make a variant exhaustive.
		[
			"sv({ variants: { size: { sm: 'rounded a', lg: 'rounded b' } }, defaultVariants: { size: 'sm' } });",
			"const defaults = { size: 'sm' };\nsv({ variants: { size: { sm: 'rounded a', lg: 'rounded b' } }, defaultVariants: defaults });"
		],
		[
			"sv({ variants: { size: { sm: 'rounded a', lg: 'rounded b' } }, requiredVariants: ['size'] });",
			"const required = ['size'];\nsv({ variants: { size: { sm: 'rounded a', lg: 'rounded b' } }, requiredVariants: required });"
		],
		// A restyle of classes a hoisted `variants` applies.
		[
			"const button = sv({ variants: { size: { sm: 'p-2' } }, defaultVariants: { size: 'sm' } });\n<div className={button({ class: 'p-4' })} />;",
			"const variants = { size: { sm: 'p-2' } };\nconst button = sv({ variants, defaultVariants: { size: 'sm' } });\n<div className={button({ class: 'p-4' })} />;"
		],
		// A dynamic value inside a hoisted record is still reported.
		[
			'sv({ variants: { size: { sm: dynamic } } });',
			'const sizes = { sm: dynamic };\nsv({ variants: { size: sizes } });'
		]
	] as const;

	for (const [inline, hoisted] of cases) {
		const expected = lint(inline);

		t.not(expected.length, 0, `reports the inline form: ${inline}`);
		t.strictSame(lint(hoisted), expected, hoisted);
	}

	t.end();
});

t.test('Svelte and Vue templates are checked like script code', (t) => {
	const linter = new Linter();
	const allRules: Linter.RulesRecord = Object.fromEntries(
		Object.keys(rules).map((name) => [`slot-variants/${name}`, 2])
	);
	const config: Linter.Config[] = [
		{
			files: ['**/*.svelte'],
			plugins: { 'slot-variants': plugin },
			rules: allRules,
			languageOptions: { parser: svelteParser }
		},
		{
			files: ['**/*.vue'],
			plugins: { 'slot-variants': plugin },
			rules: allRules,
			languageOptions: {
				parser: vueParser,
				ecmaVersion: 'latest',
				sourceType: 'module'
			}
		}
	];
	const lint = (code: string, filename: string) =>
		linter
			.verify(code, config, { filename })
			.map(({ ruleId, messageId }) => `${ruleId}:${messageId}`)
			.sort();
	const script = (body: string) =>
		`<script setup>\nimport { cn, sv } from 'slot-variants';\n${body}\n</script>\n`;
	// A config compiled once in a plain `<script>`, read by `<script setup>`.
	const scripts = (body: string) =>
		`<script>\nimport { cn, sv } from 'slot-variants';\nconst card = sv({ base: 'p-2', variants: {} });\n</script>\n<script setup>\n${body}\n</script>\n`;
	const cases = [
		[
			'Svelte markup written before its <script>',
			"<div class={cn('p-2 p-4')}></div>\n<script>import { cn } from 'slot-variants';</script>",
			'a.svelte',
			repeat('slot-variants/no-conflicting-classes:conflictCn', 2)
		],
		[
			'a cn() call in a Vue template',
			`${script('')}<template><div :class="cn('p-2 p-4')" /></template>`,
			'a.vue',
			repeat('slot-variants/no-conflicting-classes:conflictCn', 2)
		],
		[
			'a <script> const read in a Vue template',
			`${script("const extra = 'flex';")}<template><div :class="cn(extra, 'p-4')" /></template>`,
			'a.vue',
			[]
		],
		[
			'a v-for local is no <script> binding, and no static value',
			`${scripts('const cls = card();')}<template><div v-for="cls in list" :class="cn(cls, 'p-4')" /></template>`,
			'a.vue',
			['slot-variants/no-dynamic-classes:dynamic']
		],
		[
			'a v-slot local is no <script> binding either',
			`${scripts('const cls = card();')}<template><Comp v-slot="{ cls }"><div :class="[cls, 'p-4']" /></Comp></template>`,
			'a.vue',
			[]
		],
		[
			'a v-for local named like the cn import is no cn() call',
			`${script('')}<template><div v-for="cn in list" :class="cn('p-2 p-4')" /></template>`,
			'a.vue',
			[]
		]
	] as const;

	for (const [label, code, filename, expected] of cases) {
		t.strictSame(lint(code, filename), expected, label);
	}

	t.end();
});

t.test('call cycles through const bindings terminate', (t) => {
	const linter = new Linter();
	const config: Linter.Config[] = [
		{
			files: ['**/*.jsx'],
			plugins: { 'slot-variants': plugin },
			rules: Object.fromEntries(
				Object.keys(rules).map((name) => [`slot-variants/${name}`, 2])
			),
			languageOptions: {
				ecmaVersion: 'latest',
				sourceType: 'module',
				parserOptions: { ecmaFeatures: { jsx: true } }
			}
		}
	];
	const cases = [
		// A callee bound to its own call, as when typing `const f = f(…)`.
		'const f = f();',
		// Two callees bound to each other's calls.
		'const a = b();\nconst b = a();',
		// A slot read off its own call result, in a cn() list and in markup.
		"const x = x.item();\ncn(x, 'p-2');\n<div className={x.item()} />;"
	];

	for (const code of cases) {
		t.doesNotThrow(
			() =>
				linter.verify(`${IMPORT_CN}${IMPORT}${code}`, config, {
					filename: 'test.jsx'
				}),
			code
		);
	}

	t.end();
});

t.test('plugin shape (ESLint + oxlint compat)', (t) => {
	t.ok(plugin.meta, 'meta is present');
	t.equal(plugin.meta.name, 'slot-variants', 'meta.name is set');
	t.equal(
		plugin.meta.version,
		pkg.version,
		'meta.version matches package.json'
	);
	t.ok(plugin.rules, 'rules object present');

	// One structural assertion per rule rather than a field-by-field chain: the
	// optional-chain guards that walking `meta` by hand needs can never fire on
	// a well-formed rule, so they only added unreachable branches.
	const ruleShape = {
		meta: {
			type: /^(problem|suggestion|layout)$/,
			schema: Array,
			messages: Object,
			docs: {
				description: String,
				url: /^https:\/\//
			}
		},
		create: Function
	};

	// GitHub anchors a `slot-variants/<rule>` heading as `slot-variants<rule>`,
	// dropping the backticks and the slash.
	const readme = readFileSync(
		join(import.meta.dirname, '../../README.md'),
		'utf8'
	);

	for (const [name, r] of Object.entries(plugin.rules)) {
		t.match(r, ruleShape, `${name}: has the required rule shape`);
		t.equal(
			r.meta?.docs?.url,
			`https://github.com/micnic/slot-variants#slot-variants${name}`,
			`${name}: docs url points at its own README section`
		);
		t.ok(
			readme.includes(`\n#### \`slot-variants/${name}\`\n`),
			`${name}: README has the section its docs url points at`
		);
	}

	// `eslint --fix-type` picks fixes by rule type, so each type is pinned:
	// `problem` for output that is wrong or wasteful, `suggestion` for a
	// better way to write the same output, `layout` for whitespace alone.
	const ruleTypes: Record<string, string> = {
		'no-conflicting-classes': 'problem',
		'no-dynamic-classes': 'problem',
		'no-empty-classes': 'problem',
		'no-redundant-spaces': 'layout',
		'no-restyle': 'problem',
		'no-shared-tokens': 'suggestion',
		'require-top-level-config': 'problem',
		'sv-config-style': 'suggestion'
	};

	t.same(
		Object.fromEntries(
			Object.entries(plugin.rules).map(([name, r]) => [
				name,
				r.meta?.type
			])
		),
		ruleTypes,
		'every rule has its intended type'
	);
	t.end();
});

t.test('configs.recommended preset', (t) => {
	const { recommended } = plugin.configs;

	t.ok(recommended, 'recommended preset is exposed');
	t.equal(
		recommended.plugins['slot-variants'],
		plugin,
		'preset references the plugin under its name'
	);

	// sv-config-style is a pure style/consistency check with no runtime
	// correctness impact, so it opts out of the recommended preset.
	const NOT_RECOMMENDED = new Set(['sv-config-style']);

	const ruleNames = Object.keys(plugin.rules);
	const recommendedRuleNames = ruleNames.filter(
		(ruleName) => !NOT_RECOMMENDED.has(ruleName)
	);
	const recommendedKeys = Object.keys(recommended.rules);

	t.equal(
		recommendedKeys.length,
		recommendedRuleNames.length,
		'preset enables every shipped rule except the opted-out ones'
	);

	for (const ruleName of recommendedRuleNames) {
		t.equal(
			recommended.rules[`slot-variants/${ruleName}`],
			'error',
			`preset enables ${ruleName} at error`
		);
	}

	for (const ruleName of NOT_RECOMMENDED) {
		t.equal(
			recommended.rules[`slot-variants/${ruleName}`],
			undefined,
			`preset does not enable ${ruleName}`
		);
	}

	const linter = new Linter();
	const messages = linter.verify(
		`${IMPORT}sv({ base: 'flex  flex', variants: {} });`,
		[
			recommended,
			{
				files: ['**/*.ts'],
				languageOptions: { ecmaVersion: 'latest', sourceType: 'module' }
			}
		],
		{ filename: 'test.ts' }
	);
	const ruleIds = new Set(messages.map((m) => m.ruleId).filter(Boolean));

	t.ok(
		ruleIds.has('slot-variants/no-redundant-spaces'),
		'preset wires no-redundant-spaces into the linter'
	);
	t.ok(
		ruleIds.has('slot-variants/no-conflicting-classes'),
		'preset wires no-conflicting-classes into the linter'
	);
	t.end();
});