import t from 'tap';
import { Linter, RuleTester } from 'eslint';
import plugin, { rules } from '../src/eslint-plugin.ts';

const tester = new RuleTester({
	languageOptions: {
		ecmaVersion: 'latest',
		sourceType: 'module'
	}
});

const rule = rules['no-conflicting-classes'];
const IMPORT = "import { sv } from 'slot-variants';\n";
const IMPORT_CN = "import { cn } from 'slot-variants';\n";

// RuleTester fires one report per offending token, so the multi-token
// fixtures below expect the same messageId/data several times over. `repeat`
// clones a descriptor `count` times, and the per-rule builders below keep the
// expectations on a single line while still asserting the reported data.
const err = (messageId: string, data: Record<string, string>) => ({
	messageId,
	data
});

const repeat = <T>(value: T, count: number): T[] =>
	Array.from({ length: count }, () => value);

const shared = (token: string, variant: string, slot = 'base') =>
	err('shared', { token, variant, slot });

const dup = (token: string, slot = 'base') => err('duplicate', { token, slot });

const dupCn = (token: string) => err('duplicateCn', { token });

const conflict = (tokens: string, slot = 'base') =>
	err('conflict', { tokens, slot });

const conflictCn = (tokens: string) => err('conflictCn', { tokens });

const NO_REDUNDANT_SPACES_VALID = [
	// Single token, no whitespace.
	IMPORT + "sv({ base: 'flex' });",
	// Multiple tokens separated by single spaces.
	IMPORT + "sv({ base: 'flex items-center gap-2' });",
	// Empty string is allowed (no-op).
	IMPORT + "sv({ base: '' });",
	// Static template literal without expressions.
	IMPORT + 'sv({ base: `flex items-center` });',
	// Array of clean strings.
	IMPORT + "sv({ base: ['flex', 'items-center'] });",
	// Sparse hole in array - skipped.
	IMPORT + "sv({ base: ['flex', , 'gap-2'] });",
	// Spread element inside a class array - bailed out.
	IMPORT + "sv({ base: ['flex', ...rest] });",
	// Slots and variants with clean strings.
	IMPORT +
		`sv({
			slots: { body: 'p-4', header: 'font-bold' },
			variants: { size: { sm: 'text-sm', lg: 'text-lg' } }
		});`,
	// Boolean shorthand variant with a clean class value.
	IMPORT + "sv({ variants: { disabled: 'opacity-50' } });",
	// compoundVariants and compoundSlots with clean values.
	IMPORT +
		`sv({
			slots: { body: 'p-4' },
			variants: { size: { sm: 'text-sm', lg: 'text-lg' } },
			compoundVariants: [
				{ size: 'lg', class: 'font-bold' },
				{ size: 'sm', className: 'font-light' }
			],
			compoundSlots: [{ slots: ['body'], class: 'font-bold' }]
		});`,
	// Non-class-bearing keys are not walked — odd whitespace in matcher
	// values, requiredVariants entries, etc. is ignored.
	IMPORT +
		`sv({
			base: 'flex',
			defaultVariants: { size: 'sm', intent: 'primary  danger' },
			requiredVariants: ['  intent  '],
			presets: { cta: { size: 'lg' } },
			cacheSize: 256,
			introspection: true
		});`,
	// Call inside a nested function scope - still resolved to the import.
	IMPORT + "function f() { return sv({ base: 'flex items-center' }); }",
	// A local binding shadowing the cn import is not analyzed.
	IMPORT_CN + "function f(cn) { return cn('a  b'); }",
	// Dynamic identifier - walker skips silently.
	IMPORT + 'sv({ base: dynamic });',
	// Class-bearing keys with dynamic values - skipped.
	IMPORT + 'sv({ slots: dynamic, variants: dynamic });',
	// Non-string literal - walker skips.
	IMPORT + 'sv({ base: 42 });',
	// Template with expression - walker skips.
	IMPORT + 'sv({ base: `flex ${dynamic}` });',
	// Spread inside the config object - that property skipped, others walked.
	IMPORT + "sv({ ...rest, base: 'flex' });",
	// Computed key - that property skipped, others walked.
	IMPORT + "sv({ [k]: 'x', base: 'flex' });",
	// Non-string literal as cn() argument - skipped.
	IMPORT_CN + "cn(42, 'flex');",
	// Spread argument to cn() - skipped.
	IMPORT_CN + "cn(...rest, 'flex');",
	// Spread argument to sv() - skipped.
	IMPORT + "sv(...rest, 'flex');",
	// Zero-arg calls.
	IMPORT + 'sv();',
	IMPORT_CN + 'cn();',
	// Without import - silent.
	"sv({ base: ' flex  ' });",
	// Default-imported sv is not tracked.
	"import sv from 'slot-variants'; sv({ base: ' flex  ' });",
	// Namespace-imported sv is not tracked.
	"import * as mod from 'slot-variants'; mod.sv({ base: ' flex  ' });",
	// Side-effect import - no specifiers tracked.
	"import 'slot-variants'; sv({ base: ' flex  ' });",
	// Other named import is ignored.
	"import { VariantProps } from 'slot-variants'; sv({ base: ' flex  ' });",
	// Import from a different module is ignored.
	"import { sv } from 'other'; sv({ base: ' flex  ' });",
	// Member-expression callee is not tracked.
	IMPORT + "obj.sv({ base: ' flex  ' });",
	// Unrelated function call mixed with valid sv call.
	IMPORT + "console.log(' x  '); sv('flex');",
	// Bare identifier call that isn't sv or cn.
	IMPORT + "foo(' x  '); sv('flex');",
	// Both sv and cn in one import.
	"import { sv, cn } from 'slot-variants'; sv('flex'); cn('items-center');"
];

const NO_REDUNDANT_SPACES_INVALID = [
	{
		// Leading whitespace.
		code: IMPORT + "sv({ base: ' flex' });",
		output: IMPORT + "sv({ base: 'flex' });",
		errors: 1
	},
	{
		// Redundant spaces in a hoisted `const` string are fixed at the const.
		code: IMPORT_CN + "const base = 'flex  gap-2';\ncn(base);",
		output: IMPORT_CN + "const base = 'flex gap-2';\ncn(base);",
		errors: 1
	},
	{
		// Trailing whitespace.
		code: IMPORT + "sv({ base: 'flex ' });",
		output: IMPORT + "sv({ base: 'flex' });",
		errors: 1
	},
	{
		// Multiple consecutive spaces.
		code: IMPORT + "sv({ base: 'flex  items-center' });",
		output: IMPORT + "sv({ base: 'flex items-center' });",
		errors: 1
	},
	{
		// Tab character between tokens.
		code: IMPORT + "sv({ base: 'flex\\titems-center' });",
		output: IMPORT + "sv({ base: 'flex items-center' });",
		errors: 1
	},
	{
		// Newline whitespace inside template literal.
		code: IMPORT + 'sv({ base: `flex\nitems-center` });',
		output: IMPORT + 'sv({ base: `flex items-center` });',
		errors: 1
	},
	{
		// Leading + middle + trailing - single report on the literal.
		code: IMPORT + "sv({ base: ' flex  items ' });",
		output: IMPORT + "sv({ base: 'flex items' });",
		errors: 1
	},
	{
		// Redundant whitespace inside an array element.
		code: IMPORT + "sv({ base: ['flex ', 'gap-2'] });",
		output: IMPORT + "sv({ base: ['flex', 'gap-2'] });",
		errors: 1
	},
	{
		// Redundant whitespace inside a static template literal.
		code: IMPORT + 'sv({ base: `flex  items-center` });',
		output: IMPORT + 'sv({ base: `flex items-center` });',
		errors: 1
	},
	{
		// Redundant whitespace in a slots value.
		code: IMPORT + "sv({ slots: { body: 'p-4 ', header: 'font-bold' } });",
		output: IMPORT + "sv({ slots: { body: 'p-4', header: 'font-bold' } });",
		errors: 1
	},
	{
		// Redundant whitespace in a variant record value.
		code:
			IMPORT +
			"sv({ variants: { size: { sm: ' text-sm', lg: 'text-lg' } } });",
		output:
			IMPORT +
			"sv({ variants: { size: { sm: 'text-sm', lg: 'text-lg' } } });",
		errors: 1
	},
	{
		// Redundant whitespace in a boolean-shorthand variant value.
		code:
			IMPORT +
			"sv({ variants: { disabled: 'opacity-50  cursor-not-allowed' } });",
		output:
			IMPORT +
			"sv({ variants: { disabled: 'opacity-50 cursor-not-allowed' } });",
		errors: 1
	},
	{
		// Redundant whitespace in a compoundVariants class.
		code:
			IMPORT +
			`sv({
				variants: { size: { sm: 'text-sm', lg: 'text-lg' } },
				compoundVariants: [{ size: 'lg', class: 'font-bold ' }]
			});`,
		output:
			IMPORT +
			`sv({
				variants: { size: { sm: 'text-sm', lg: 'text-lg' } },
				compoundVariants: [{ size: 'lg', class: 'font-bold' }]
			});`,
		errors: 1
	},
	{
		// Redundant whitespace in a compoundVariants className.
		code:
			IMPORT +
			`sv({
				variants: { size: { sm: 'text-sm', lg: 'text-lg' } },
				compoundVariants: [{ size: 'lg', className: ' font-bold' }]
			});`,
		output:
			IMPORT +
			`sv({
				variants: { size: { sm: 'text-sm', lg: 'text-lg' } },
				compoundVariants: [{ size: 'lg', className: 'font-bold' }]
			});`,
		errors: 1
	},
	{
		// Redundant whitespace in a compoundSlots class.
		code:
			IMPORT +
			`sv({
				slots: { body: 'p-4' },
				compoundSlots: [{ slots: ['body'], class: 'font-bold  uppercase' }]
			});`,
		output:
			IMPORT +
			`sv({
				slots: { body: 'p-4' },
				compoundSlots: [{ slots: ['body'], class: 'font-bold uppercase' }]
			});`,
		errors: 1
	},
	{
		// cn() positional with trailing whitespace.
		code: IMPORT_CN + "cn('flex ', 'items-center');",
		output: IMPORT_CN + "cn('flex', 'items-center');",
		errors: 1
	},
	{
		// cn() with redundant whitespace inside template literal.
		code: IMPORT_CN + 'cn(`flex  items-center`);',
		output: IMPORT_CN + 'cn(`flex items-center`);',
		errors: 1
	},
	{
		// cn() with redundant whitespace inside an array argument.
		code: IMPORT_CN + "cn(['flex  items-center']);",
		output: IMPORT_CN + "cn(['flex items-center']);",
		errors: 1
	},
	{
		// sv() called cn-style with redundant whitespace.
		code: IMPORT + "sv('flex  items-center');",
		output: IMPORT + "sv('flex items-center');",
		errors: 1
	}
];

t.test('shared plugin run reuses cached property analysis', (t) => {
	const linter = new Linter({ configType: 'flat' });
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

t.test('plugin shape (ESLint + oxlint compat)', (t) => {
	t.ok(plugin.meta, 'meta is present');
	t.equal(plugin.meta.name, 'slot-variants', 'meta.name is set');
	t.ok(plugin.rules, 'rules object present');
	for (const [name, r] of Object.entries(plugin.rules)) {
		t.ok(r.meta, `${name}: has meta`);
		t.ok(r.meta?.messages, `${name}: has messages`);
		t.ok(r.meta?.schema !== undefined, `${name}: has schema`);

		const type = r.meta?.type;

		t.ok(
			type === 'problem' || type === 'suggestion' || type === 'layout',
			`${name}: has a valid meta.type`
		);

		const description = r.meta?.docs?.description;

		t.equal(
			typeof description,
			'string',
			`${name}: has a docs.description`
		);

		const url = r.meta?.docs?.url;

		t.ok(
			typeof url === 'string' && url.startsWith('https://'),
			`${name}: has a docs.url`
		);
		t.equal(typeof r.create, 'function', `${name}: has create()`);
	}
	t.end();
});

t.test('configs.recommended preset', (t) => {
	const recommended = plugin.configs.recommended as {
		plugins: Record<string, unknown>;
		rules: Record<string, string>;
	};

	t.ok(recommended, 'recommended preset is exposed');
	t.equal(
		recommended.plugins['slot-variants'],
		plugin,
		'preset references the plugin under its name'
	);

	const ruleNames = Object.keys(plugin.rules);
	const recommendedKeys = Object.keys(recommended.rules);

	t.equal(
		recommendedKeys.length,
		ruleNames.length,
		'preset enables every shipped rule'
	);

	for (const ruleName of ruleNames) {
		t.equal(
			recommended.rules[`slot-variants/${ruleName}`],
			'error',
			`preset enables ${ruleName} at error`
		);
	}

	const linter = new Linter({ configType: 'flat' });
	const messages = linter.verify(
		`${IMPORT}sv({ base: 'flex  flex' });`,
		[
			recommended as unknown as Linter.Config,
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

t.test('no-redundant-spaces', (t) => {
	const spacesRule = rules['no-redundant-spaces'];

	t.doesNotThrow(() => {
		tester.run('no-redundant-spaces', spacesRule, {
			valid: NO_REDUNDANT_SPACES_VALID,
			invalid: NO_REDUNDANT_SPACES_INVALID
		});
	}, 'rule tester passes');
	t.end();
});

const NO_DYNAMIC_CLASSES_VALID = [
	// Static class strings in cn-style call.
	IMPORT + "sv('flex', 'items-center');",
	// Static base in config.
	IMPORT + "sv({ base: 'flex' });",
	// Array of static class values.
	IMPORT + "sv({ base: ['flex', 'gap-2'] });",
	// Explicit undefined is an allowed no-op config class value.
	IMPORT +
		`sv({
			base: undefined,
			slots: { body: undefined },
			variants: {
				size: {
					sm: undefined,
					lg: { base: undefined, body: undefined }
				}
			},
			compoundVariants: [{ size: 'sm', class: undefined }],
			compoundSlots: [{ slots: ['body'], size: 'lg', className: undefined }]
		});`,
	// Sparse hole in array — allowed.
	IMPORT + "sv({ base: ['flex', , 'gap-2'] });",
	// Template literal without expressions.
	IMPORT + 'sv({ base: `flex gap-2` });',
	// Static slots record.
	IMPORT + "sv({ slots: { body: 'p-4', header: 'font-bold' } });",
	// Static value-keyed variants.
	IMPORT + "sv({ variants: { size: { sm: 'text-sm', lg: 'text-lg' } } });",
	// Slot-keyed variant branches.
	IMPORT +
		`sv({
			slots: { body: 'p-4', icon: 'size-4' },
			variants: {
				size: {
					sm: { base: 'text-sm', body: 'gap-1', icon: 'size-3' },
					lg: { base: 'text-lg', body: 'gap-2', icon: 'size-5' }
				}
			}
		});`,
	// Slot-keyed boolean shorthand variant.
	IMPORT +
		`sv({
			slots: { body: 'p-4' },
			variants: { disabled: { base: 'opacity-50', body: 'cursor-not-allowed' } }
		});`,
	// Boolean shorthand variant — value is a class value.
	IMPORT + "sv({ variants: { disabled: 'opacity-50' } });",
	// Variant value is an array.
	IMPORT +
		"sv({ variants: { disabled: ['opacity-50', 'cursor-not-allowed'] } });",
	// String-literal property keys throughout.
	IMPORT +
		"sv({ 'base': 'flex', 'variants': { 'size': { 'sm': 'text-sm' } } });",
	// Numeric variant value keys.
	IMPORT + "sv({ variants: { size: { 1: 'text-sm' } } });",
	// compoundVariants with static class.
	IMPORT +
		`sv({
			variants: { size: { sm: 'text-sm', lg: 'text-lg' } },
			compoundVariants: [{ size: 'lg', class: 'font-bold' }]
		});`,
	// compoundVariants entry with className instead of class.
	IMPORT +
		`sv({
			variants: { size: { sm: 'text-sm', lg: 'text-lg' } },
			compoundVariants: [{ size: 'lg', className: 'font-bold' }]
		});`,
	// compoundVariants slots matcher is ignored outside compoundSlots.
	IMPORT +
		`sv({
			variants: { size: { sm: 'text-sm', lg: 'text-lg' } },
			compoundVariants: [{ slots: dynamic, class: 'font-bold' }]
		});`,
	// compoundVariants entry without class/className.
	IMPORT +
		`sv({
			variants: { size: { sm: 'text-sm', lg: 'text-lg' } },
			compoundVariants: [{ size: 'lg' }]
		});`,
	// Sparse hole in compoundVariants array.
	IMPORT +
		`sv({
			variants: { size: { sm: 'text-sm', lg: 'text-lg' } },
			compoundVariants: [, { size: 'lg', class: 'font-bold' }]
		});`,
	// compoundSlots with static slots and class.
	IMPORT +
		`sv({
			slots: { body: 'p-4' },
			compoundSlots: [{ slots: ['body'], class: 'font-bold' }]
		});`,
	// compoundSlots with sparse hole inside slots array.
	IMPORT +
		`sv({
			slots: { body: 'p-4' },
			compoundSlots: [{ slots: [, 'body'], class: 'font-bold' }]
		});`,
	// Non-class config keys with dynamic values are not validated.
	IMPORT +
		`sv({
			base: 'flex',
			defaultVariants: dynamic,
			cacheSize: someNumber,
			postProcess: twMerge,
			introspection: flag,
			requiredVariants: keys,
			presets: anything
		});`,
	// Zero-arg sv() call.
	IMPORT + 'sv();',
	// Zero-arg cn() call.
	IMPORT_CN + 'cn();',
	// Static cn arguments.
	IMPORT_CN + "cn('flex', 'items-center');",
	IMPORT_CN + "cn(['flex', 'items-center']);",
	IMPORT_CN + 'cn(`flex`);',
	// Logical-AND conditional ending in a static string — the only
	// class it can contribute is statically known.
	IMPORT_CN + "cn('flex', isActive && 'px-4');",
	// Logical-AND ending in an expression-free template literal.
	IMPORT_CN + 'cn(isActive && `px-4`);',
	// Chained conditions still end in a static string.
	IMPORT_CN + "cn(isActive && isLarge && 'px-4');",
	// Conditional inside a cn array argument.
	IMPORT_CN + "cn(['flex', isActive && 'px-4']);",
	// Ternary whose branches are both static strings.
	IMPORT_CN + "cn(isActive ? 'px-4' : 'px-2');",
	// Ternary branches may be expression-free template literals.
	IMPORT_CN + 'cn(isActive ? `px-4` : `px-2`);',
	// Ternary nested inside a cn array argument.
	IMPORT_CN + "cn(['flex', isActive ? 'px-4' : 'px-2']);",
	// Ternary in an sv() cn-style leading argument.
	IMPORT + "sv(isActive ? 'px-4' : 'px-2', { base: 'flex' });",
	// Ternary substitution inside a template literal — whitespace-isolated.
	IMPORT_CN + "cn(`items-center ${col ? 'flex-col' : 'flex-row'}`);",
	// Ternary substitution at the start of a template literal.
	IMPORT_CN + "cn(`${col ? 'flex-col' : 'flex-row'} items-center`);",
	// Multiple ternary substitutions in one template literal.
	IMPORT_CN +
		"cn(`${a ? 'flex-col' : 'flex-row'} ${b ? 'gap-2' : 'gap-4'}`);",
	// Template-literal ternary nested inside a cn array argument.
	IMPORT_CN + "cn(['flex', `items-center ${col ? 'flex-col' : 'flex-row'}`]);",
	// Ternary branch may itself be an expression-free template literal.
	IMPORT_CN + 'cn(`gap-2 ${col ? `flex-col` : `flex-row`}`);',
	// Chained ternary — every branch is a static string.
	IMPORT_CN + "cn(size === 'lg' ? 'text-lg' : size === 'sm' ? 'text-sm' : 'text-base');",
	// Ternary branch may itself be an array of static values.
	IMPORT_CN + "cn(cond ? ['flex', 'flex-col'] : 'block');",
	// Ternary branch may itself be a logical-AND.
	IMPORT_CN + "cn(cond ? (compact && 'gap-1') : 'gap-4');",
	// Logical-AND whose right operand is an array.
	IMPORT_CN + "cn(cond && ['flex', 'items-center']);",
	// Logical-AND whose right operand is a clsx-style record.
	IMPORT_CN + "cn(cond && { 'text-red-500': hasError });",
	// Nested static-string ternary inside a template substitution.
	IMPORT_CN + "cn(`flex ${a ? 'flex-col' : b ? 'flex-row' : 'grid'}`);",
	// clsx-style record: keys are class names, values are runtime conditions.
	IMPORT_CN + "cn({ 'text-red-500': hasError });",
	// Record mixed with other static cn arguments.
	IMPORT_CN + "cn('px-2 py-1', isActive && 'px-4', { 'text-red-500': hasError });",
	// Record nested inside a cn array argument.
	IMPORT_CN + "cn(['flex', { active: isActive }]);",
	// Record as an sv() cn-style leading argument.
	IMPORT + "sv({ active: isActive }, { base: 'flex' });",
	// Conditional in an sv() cn-style leading argument.
	IMPORT + "sv(isActive && 'px-4', { base: 'flex' });",
	// Without an import, the rule is silent.
	'sv({ base: dynamic });',
	// Default-imported sv is not tracked.
	"import sv from 'slot-variants'; sv(dynamic);",
	// Namespace-imported sv is not tracked.
	"import * as mod from 'slot-variants'; mod.sv(dynamic);",
	// Side-effect import — no specifiers tracked.
	"import 'slot-variants'; sv(dynamic);",
	// Named import that is neither sv nor cn is ignored.
	"import { VariantProps } from 'slot-variants'; sv(dynamic);",
	// Import from a different module is ignored.
	"import { sv } from 'other'; sv(dynamic);",
	// String-literal import specifier for a different export is ignored.
	"import { 'not-sv' as sv } from 'slot-variants'; sv(dynamic);",
	// Non-string literal import specifier is ignored.
	"import { null as sv } from 'slot-variants'; sv(dynamic);",
	// Importing both sv and cn.
	"import { sv, cn } from 'slot-variants'; sv('a'); cn('b');",
	// Member-expression callee is not tracked.
	IMPORT + 'obj.sv(dynamic);',
	// Unrelated function call when imports are tracked.
	IMPORT + "console.log('hi'); sv('flex');",
	// A hoisted `const` class string is read through to its value.
	IMPORT_CN + "const BASE = 'flex-1 gap-2';\ncn(BASE);",
	// A `const` class array is read through too.
	IMPORT_CN + "const BASE = ['flex-1', 'gap-2'];\ncn(BASE);",
	// A chain of `const` bindings is followed to the value.
	IMPORT_CN + "const A = 'flex';\nconst B = A;\ncn(B);",
	// A `const` reference inside an sv() config value is resolved.
	IMPORT + "const SM = 'text-sm';\nsv({ variants: { size: { sm: SM } } });",
	// A `const` reference nested inside a ternary branch is resolved.
	IMPORT_CN + "const X = 'px-4';\ncn(cond ? X : 'px-2');"
];

const NO_DYNAMIC_CLASSES_INVALID = [
	{
		// Identifier as cn-style argument.
		code: IMPORT + 'sv(dynamic);',
		errors: 1
	},
	{
		// String-literal import specifier for sv is tracked.
		code: "import { 'sv' as sv } from 'slot-variants';\nsv(dynamic);",
		errors: 1
	},
	{
		// Spread argument in cn-style call.
		code: IMPORT + "sv(...rest, 'flex');",
		errors: 1
	},
	{
		// Non-string literal as cn-style argument.
		code: IMPORT + 'sv(42);',
		errors: 1
	},
	{
		// Template with expression as cn-style argument.
		code: IMPORT + 'sv(`flex ${x}`);',
		errors: 1
	},
	{
		// Spread inside array argument.
		code: IMPORT + "sv(['flex', ...rest]);",
		errors: 1
	},
	{
		// Identifier as base value.
		code: IMPORT + 'sv({ base: dynamic });',
		errors: 1
	},
	{
		// Non-string literal as base.
		code: IMPORT + 'sv({ base: 42 });',
		errors: 1
	},
	{
		// Template literal with expression as base.
		code: IMPORT + 'sv({ base: `flex ${x}` });',
		errors: 1
	},
	{
		// Identifier element inside base array.
		code: IMPORT + "sv({ base: ['flex', dynamic] });",
		errors: 1
	},
	{
		// Undefined is only allowed as the whole config class value,
		// not as an array element.
		code: IMPORT + "sv({ base: ['flex', undefined] });",
		errors: 1
	},
	{
		// Config class arrays must be flat string arrays.
		code: IMPORT + "sv({ base: ['flex', ['gap-2']] });",
		errors: 1
	},
	{
		// Slot class arrays must also be flat.
		code: IMPORT + "sv({ slots: { body: [['p-4']] } });",
		errors: 1
	},
	{
		// Variant class arrays must also be flat.
		code: IMPORT + "sv({ variants: { size: { sm: [['text-sm']] } } });",
		errors: 1
	},
	{
		// Spread element inside base array.
		code: IMPORT + "sv({ base: ['flex', ...rest] });",
		errors: 1
	},
	{
		// Spread at the top of the config object.
		code: IMPORT + "sv({ ...rest, base: 'flex' });",
		errors: 1
	},
	{
		// Computed key in the config object.
		code: IMPORT + "sv({ [k]: 'flex' });",
		errors: 1
	},
	{
		// slots is not an object.
		code: IMPORT + "sv({ base: 'flex', slots: dynamic });",
		errors: 1
	},
	{
		// Spread inside slots.
		code: IMPORT + "sv({ slots: { ...rest, body: 'p-4' } });",
		errors: 1
	},
	{
		// Computed key inside slots.
		code: IMPORT + "sv({ slots: { [k]: 'p-4' } });",
		errors: 1
	},
	{
		// Dynamic slot value.
		code: IMPORT + 'sv({ slots: { body: dynamic } });',
		errors: 1
	},
	{
		// variants is not an object.
		code: IMPORT + 'sv({ variants: dynamic });',
		errors: 1
	},
	{
		// Spread inside variants.
		code:
			IMPORT + "sv({ variants: { ...rest, size: { sm: 'text-sm' } } });",
		errors: 1
	},
	{
		// Computed key inside variants.
		code: IMPORT + "sv({ variants: { [k]: { sm: 'text-sm' } } });",
		errors: 1
	},
	{
		// Dynamic variant shorthand value.
		code: IMPORT + 'sv({ variants: { disabled: dynamic } });',
		errors: 1
	},
	{
		// Spread inside a variant value record.
		code:
			IMPORT + "sv({ variants: { size: { ...rest, sm: 'text-sm' } } });",
		errors: 1
	},
	{
		// Computed key inside a variant value record.
		code: IMPORT + "sv({ variants: { size: { [v]: 'text-sm' } } });",
		errors: 1
	},
	{
		// Dynamic value inside a variant value record.
		code: IMPORT + 'sv({ variants: { size: { sm: dynamic } } });',
		errors: 1
	},
	{
		// Dynamic value inside a slot-keyed variant branch.
		code:
			IMPORT +
			`sv({
				slots: { body: 'p-4' },
				variants: { size: { sm: { body: dynamic } } }
			});`,
		errors: 1
	},
	{
		// Unknown slot key inside a slot-keyed variant branch.
		code:
			IMPORT +
			`sv({
				slots: { body: 'p-4' },
				variants: { size: { sm: { footer: 'p-2' } } }
			});`,
		errors: 1
	},
	{
		// compoundVariants is not an array.
		code:
			IMPORT +
			"sv({ variants: { size: { sm: 'text-sm' } }, compoundVariants: dynamic });",
		errors: 1
	},
	{
		// Non-object element inside compoundVariants.
		code:
			IMPORT +
			"sv({ variants: { size: { sm: 'text-sm' } }, compoundVariants: [42] });",
		errors: 1
	},
	{
		// Spread element inside compoundVariants.
		code:
			IMPORT +
			"sv({ variants: { size: { sm: 'text-sm' } }, compoundVariants: [...rest] });",
		errors: 1
	},
	{
		// Spread inside a compoundVariants entry.
		code:
			IMPORT +
			`sv({
				variants: { size: { sm: 'text-sm' } },
				compoundVariants: [{ ...rest, class: 'font-bold' }]
			});`,
		errors: 1
	},
	{
		// Computed key inside a compoundVariants entry.
		code:
			IMPORT +
			`sv({
				variants: { size: { sm: 'text-sm' } },
				compoundVariants: [{ [k]: 'lg', class: 'font-bold' }]
			});`,
		errors: 1
	},
	{
		// Dynamic class in a compoundVariants entry.
		code:
			IMPORT +
			`sv({
				variants: { size: { sm: 'text-sm' } },
				compoundVariants: [{ size: 'sm', class: dynamic }]
			});`,
		errors: 1
	},
	{
		// Dynamic className in a compoundVariants entry.
		code:
			IMPORT +
			`sv({
				variants: { size: { sm: 'text-sm' } },
				compoundVariants: [{ size: 'sm', className: dynamic }]
			});`,
		errors: 1
	},
	{
		// compoundSlots slots field is not an array.
		code:
			IMPORT +
			`sv({
				slots: { body: 'p-4' },
				compoundSlots: [{ slots: dynamic, class: 'font-bold' }]
			});`,
		errors: 1
	},
	{
		// Non-string element inside compoundSlots slots array.
		code:
			IMPORT +
			`sv({
				slots: { body: 'p-4' },
				compoundSlots: [{ slots: [42], class: 'font-bold' }]
			});`,
		errors: 1
	},
	{
		// Identifier inside compoundSlots slots array.
		code:
			IMPORT +
			`sv({
				slots: { body: 'p-4' },
				compoundSlots: [{ slots: [body], class: 'font-bold' }]
			});`,
		errors: 1
	},
	{
		// Dynamic class in a compoundSlots entry.
		code:
			IMPORT +
			`sv({
				slots: { body: 'p-4' },
				compoundSlots: [{ slots: ['body'], class: dynamic }]
			});`,
		errors: 1
	},
	{
		// cn() with a dynamic identifier.
		code: IMPORT_CN + 'cn(dynamic);',
		errors: 1
	},
	{
		// cn() with a spread argument.
		code: IMPORT_CN + "cn(...rest, 'flex');",
		errors: 1
	},
	{
		// cn() object record with a computed key — the class name is dynamic.
		code: IMPORT_CN + 'cn({ [k]: true });',
		errors: 1
	},
	{
		// cn() object record with a spread — the keys aren't statically known.
		code: IMPORT_CN + 'cn({ ...rest, foo: true });',
		errors: 1
	},
	{
		// Computed key in an object record nested inside a cn array argument.
		code: IMPORT_CN + 'cn(["flex", { [k]: cond }]);',
		errors: 1
	},
	{
		// cn() with a template literal containing an expression.
		code: IMPORT_CN + 'cn(`flex ${x}`);',
		errors: 1
	},
	{
		// Logical-OR can render its left operand, which is dynamic.
		code: IMPORT_CN + "cn(variant || 'px-4');",
		errors: 1
	},
	{
		// Logical-AND not ending in a static string.
		code: IMPORT_CN + 'cn(cond && other);',
		errors: 1
	},
	{
		// Logical-AND ending in a template literal with an expression.
		code: IMPORT_CN + 'cn(cond && `px-${x}`);',
		errors: 1
	},
	{
		// Conditional class values are a cn-style affordance only —
		// an sv() config object stays disallowed.
		code: IMPORT + "sv({ base: isActive && 'px-4' });",
		errors: 1
	},
	{
		// Ternary with a dynamic branch — the class isn't fully known.
		code: IMPORT_CN + "cn(isActive ? 'px-4' : other);",
		errors: 1
	},
	{
		// Ternary with a dynamic consequent branch.
		code: IMPORT_CN + "cn(isActive ? other : 'px-2');",
		errors: 1
	},
	{
		// Ternary is a cn-style affordance only — disallowed in an sv() config.
		code: IMPORT + "sv({ base: isActive ? 'px-4' : 'px-2' });",
		errors: 1
	},
	{
		// Template ternary whose substitution isn't whitespace-isolated — a
		// token would straddle the boundary, so it stays dynamic.
		code: IMPORT_CN + "cn(`p-${x ? '2' : '4'}`);",
		errors: 1
	},
	{
		// Template with a ternary that has a dynamic branch.
		code: IMPORT_CN + "cn(`flex ${x ? 'a' : other}`);",
		errors: 1
	},
	{
		// Template ternary whose trailing quasi isn't whitespace-separated — a
		// token straddles the boundary after the substitution.
		code: IMPORT_CN + "cn(`${x ? 'a' : 'b'}-tail`);",
		errors: 1
	},
	{
		// Template ternary is a cn-style affordance — disallowed in a config.
		code: IMPORT + "sv({ base: `flex ${c ? 'a' : 'b'}` });",
		errors: 1
	},
	{
		// Chained ternary with a dynamic leaf branch — the leaf is reported.
		code: IMPORT_CN + "cn(a ? 'x-1' : b ? 'y-1' : dyn);",
		errors: 1
	},
	{
		// Logical-AND whose right array has a dynamic element.
		code: IMPORT_CN + "cn(cond && ['a-1', dyn]);",
		errors: 1
	},
	{
		// A logical-AND is unsafe as a template substitution (it stringifies to
		// "false" when skipped), so the template stays dynamic.
		code: IMPORT_CN + "cn(`flex ${x && 'a'}`);",
		errors: 1
	},
	{
		// `let` can be reassigned, so its binding isn't read through.
		code: IMPORT_CN + "let base = 'flex';\ncn(base);",
		errors: 1
	},
	{
		// A redeclared `var` has multiple definitions — not a safe single value.
		code: IMPORT_CN + "var base = 'a';\nvar base = 'b';\ncn(base);",
		errors: 1
	},
	{
		// An imported binding lives in another module — its value is unknown.
		code: "import { cn } from 'slot-variants';\nimport { base } from 'x';\ncn(base);",
		errors: 1
	},
	{
		// A destructuring binding isn't a plain `const name = value`.
		code: IMPORT_CN + "const { base } = obj;\ncn(base);",
		errors: 1
	},
	{
		// A `const` whose initializer is dynamic is reported at the initializer.
		code: IMPORT_CN + "const base = make();\ncn(base);",
		errors: 1
	},
	{
		// A reference cycle terminates and is reported as dynamic.
		code: IMPORT_CN + "const a = b;\nconst b = a;\ncn(a);",
		errors: 1
	}
];

t.test('no-dynamic-classes', (t) => {
	const dynamicRule = rules['no-dynamic-classes'];

	t.doesNotThrow(() => {
		tester.run('no-dynamic-classes', dynamicRule, {
			valid: NO_DYNAMIC_CLASSES_VALID,
			invalid: NO_DYNAMIC_CLASSES_INVALID
		});
	}, 'rule tester passes');
	t.end();
});

const NO_EMPTY_CLASSES_VALID = [
	// Non-empty cn-style call.
	IMPORT + "sv('flex', 'items-center');",
	// Non-empty config.
	IMPORT + "sv({ base: 'flex' });",
	// Non-empty array, no empty elements.
	IMPORT + "sv({ base: ['flex', 'gap-2'] });",
	// Sparse hole in array — skipped.
	IMPORT + "sv({ base: ['flex', , 'gap-2'] });",
	// Spread element inside array — skipped.
	IMPORT + "sv({ base: ['flex', ...rest] });",
	// Non-empty template literal.
	IMPORT + 'sv({ base: `flex` });',
	// Empty string as a direct slot value — allowed.
	IMPORT + "sv({ slots: { body: '' } });",
	// Empty template literal as a direct slot value — allowed.
	IMPORT + 'sv({ slots: { body: `` } });',
	// Mix of empty and non-empty slot values — both allowed.
	IMPORT + "sv({ slots: { body: '', header: 'font-bold' } });",
	// Spread in slots — bailed.
	IMPORT + "sv({ slots: { ...rest, body: 'p-4' } });",
	// Computed key in slots — bailed.
	IMPORT + "sv({ slots: { [k]: '' } });",
	// Slots with non-object value — not analyzed.
	IMPORT + "sv({ base: 'flex', slots: dynamic });",
	// Variants with non-object value — not analyzed.
	IMPORT + 'sv({ variants: dynamic });',
	// Compounds with non-array value — not analyzed.
	IMPORT + 'sv({ compoundVariants: dynamic });',
	// Non-empty variants record.
	IMPORT + "sv({ variants: { size: { sm: 'text-sm', lg: 'text-lg' } } });",
	// Boolean shorthand variant with non-empty class.
	IMPORT + "sv({ variants: { disabled: 'opacity-50' } });",
	// Slot-keyed boolean shorthand variant with non-empty class.
	IMPORT +
		"sv({ slots: { body: 'p-4' }, variants: { disabled: { body: 'opacity-50' } } });",
	// compoundVariants with non-empty class.
	IMPORT +
		`sv({
			variants: { size: { sm: 'text-sm', lg: 'text-lg' } },
			compoundVariants: [{ size: 'lg', class: 'font-bold' }]
		});`,
	// compoundVariants entry without class — not flagged.
	IMPORT +
		`sv({
			variants: { size: { sm: 'text-sm' } },
			compoundVariants: [{ size: 'sm' }]
		});`,
	// compoundSlots with non-empty class.
	IMPORT +
		`sv({
			slots: { body: 'p-4' },
			compoundSlots: [{ slots: ['body'], class: 'font-bold' }]
		});`,
	// cn-style record with non-empty keys.
	IMPORT_CN + 'cn({ foo: true, bar: false });',
	// Non-string literal as cn argument — not an empty class.
	IMPORT_CN + 'cn(0, false, null, undefined);',
	// Non-empty values in nested arrays.
	IMPORT_CN + "cn([['flex', 'gap-2']]);",
	// Template literal with an interpolation — not empty, skipped.
	IMPORT_CN + 'cn(`flex ${x}`);',
	// Spread argument — skipped.
	IMPORT_CN + "cn(...rest, 'flex');",
	// Without an import, the rule is silent (import tracking and callee
	// resolution are covered exhaustively by the no-dynamic-classes suite).
	'sv();',
	'cn();',
	"sv('');",
	'cn({});',
	// Non-class config keys — not validated.
	IMPORT +
		`sv({
			base: 'flex',
			defaultVariants: {},
			requiredVariants: [],
			presets: {},
			postProcess: noop
		});`,
	// Spread inside variants — that property is bailed.
	IMPORT + "sv({ variants: { ...rest, size: { sm: 'text-sm' } } });",
	// Computed key inside variants — that property is bailed.
	IMPORT + "sv({ variants: { [k]: { sm: 'text-sm' } } });",
	// Spread inside a variant value record — that property is bailed.
	IMPORT + "sv({ variants: { size: { ...rest, sm: 'text-sm' } } });",
	// Computed key inside a variant value record — that property is bailed.
	IMPORT + "sv({ variants: { size: { [v]: 'text-sm' } } });",
	// Sparse hole inside compoundVariants — skipped.
	IMPORT +
		`sv({
			variants: { size: { sm: 'text-sm', lg: 'text-lg' } },
			compoundVariants: [, { size: 'lg', class: 'font-bold' }]
		});`,
	// Non-object compoundVariants element — skipped.
	IMPORT +
		`sv({
			variants: { size: { sm: 'text-sm' } },
			compoundVariants: [42, { size: 'sm', class: 'font-bold' }]
		});`,
	// Spread inside a compoundVariants entry — that property is bailed.
	IMPORT +
		`sv({
			variants: { size: { sm: 'text-sm' } },
			compoundVariants: [{ ...rest, class: 'font-bold' }]
		});`,
	// Computed key inside a compoundVariants entry — that property is bailed.
	IMPORT +
		`sv({
			variants: { size: { sm: 'text-sm' } },
			compoundVariants: [{ [k]: 'lg', class: 'font-bold' }]
		});`,
	// String-literal property keys throughout.
	IMPORT + "sv({ 'base': 'flex', 'slots': { 'body': 'p-4' } });"
];

const NO_EMPTY_CLASSES_INVALID = [
	{
		// Empty string as cn-style sv argument.
		code: IMPORT + "sv('');",
		errors: [{ messageId: 'emptyString' }]
	},
	{
		// Empty array as cn-style sv argument.
		code: IMPORT + 'sv([]);',
		errors: [{ messageId: 'emptyArray' }]
	},
	{
		// Empty object as cn-style sv argument.
		code: IMPORT + 'sv({});',
		errors: [{ messageId: 'emptyObject' }]
	},
	{
		// Empty template literal as cn-style sv argument.
		code: IMPORT + 'sv(``);',
		errors: [{ messageId: 'emptyString' }]
	},
	{
		// Empty string inside an array argument.
		code: IMPORT + "sv(['', 'flex']);",
		output: IMPORT + "sv([ 'flex']);",
		errors: [{ messageId: 'emptyString' }]
	},
	{
		// Nested empty array.
		code: IMPORT + 'sv([[]]);',
		errors: [{ messageId: 'emptyArray' }]
	},
	{
		// Empty string inside a nested array.
		code: IMPORT + "sv([['', 'flex']]);",
		output: IMPORT + "sv([[ 'flex']]);",
		errors: [{ messageId: 'emptyString' }]
	},
	{
		// Empty string as base.
		code: IMPORT + "sv({ base: '' });",
		errors: [{ messageId: 'emptyString' }]
	},
	{
		// Empty array as base.
		code: IMPORT + 'sv({ base: [] });',
		errors: [{ messageId: 'emptyArray' }]
	},
	{
		// Empty object as base.
		code: IMPORT + 'sv({ base: {} });',
		errors: [{ messageId: 'emptyObject' }]
	},
	{
		// Empty string inside a base array.
		code: IMPORT + "sv({ base: ['', 'flex'] });",
		output: IMPORT + "sv({ base: [ 'flex'] });",
		errors: [{ messageId: 'emptyString' }]
	},
	{
		// Empty slots object — the whole property is removed.
		code: IMPORT + "sv({ base: 'flex', slots: {} });",
		output: IMPORT + "sv({ base: 'flex' });",
		errors: [{ messageId: 'emptyObject' }]
	},
	{
		// Empty base alongside other keys — the property is dropped.
		code: IMPORT + "sv({ base: '', variants: { size: { sm: 'a' } } });",
		output: IMPORT + "sv({  variants: { size: { sm: 'a' } } });",
		errors: [{ messageId: 'emptyString' }]
	},
	{
		// Empty array as slot value — empty-string exception
		// applies only to a direct empty string.
		code: IMPORT + 'sv({ slots: { body: [] } });',
		errors: [{ messageId: 'emptyArray' }]
	},
	{
		// Empty object as slot value.
		code: IMPORT + 'sv({ slots: { body: {} } });',
		errors: [{ messageId: 'emptyObject' }]
	},
	{
		// Empty string inside a slot-value array — exception
		// only covers the top-level slot value.
		code: IMPORT + "sv({ slots: { body: [''] } });",
		errors: [{ messageId: 'emptyString' }]
	},
	{
		// Empty variants object.
		code: IMPORT + 'sv({ variants: {} });',
		errors: [{ messageId: 'emptyObject' }]
	},
	{
		// Empty boolean-shorthand variant value.
		code: IMPORT + "sv({ variants: { disabled: '' } });",
		errors: [{ messageId: 'emptyString' }]
	},
	{
		// Empty variant value record.
		code: IMPORT + 'sv({ variants: { size: {} } });',
		errors: [{ messageId: 'emptyObject' }]
	},
	{
		// Empty string inside a variant value record.
		code: IMPORT + "sv({ variants: { size: { sm: '' } } });",
		errors: [{ messageId: 'emptyString' }]
	},
	{
		// Empty string inside a slot-keyed variant branch.
		code:
			IMPORT +
			`sv({
				slots: { body: 'p-4' },
				variants: { size: { sm: { body: '' } } }
			});`,
		errors: [{ messageId: 'emptyString' }]
	},
	{
		// Empty array inside a variant value record.
		code: IMPORT + 'sv({ variants: { size: { sm: [] } } });',
		errors: [{ messageId: 'emptyArray' }]
	},
	{
		// Empty array inside a slot-keyed variant branch.
		code:
			IMPORT +
			`sv({
				slots: { body: 'p-4' },
				variants: { size: { sm: { body: [] } } }
			});`,
		errors: [{ messageId: 'emptyArray' }]
	},
	{
		// Empty array as compoundVariants.
		code:
			IMPORT +
			"sv({ variants: { size: { sm: 'text-sm' } }, compoundVariants: [] });",
		output: IMPORT + "sv({ variants: { size: { sm: 'text-sm' } } });",
		errors: [{ messageId: 'emptyArray' }]
	},
	{
		// Empty class in a compoundVariants entry.
		code:
			IMPORT +
			`sv({
				variants: { size: { sm: 'text-sm', lg: 'text-lg' } },
				compoundVariants: [{ size: 'lg', class: '' }]
			});`,
		errors: [{ messageId: 'emptyString' }]
	},
	{
		// Empty className in a compoundVariants entry.
		code:
			IMPORT +
			`sv({
				variants: { size: { sm: 'text-sm', lg: 'text-lg' } },
				compoundVariants: [{ size: 'lg', className: '' }]
			});`,
		errors: [{ messageId: 'emptyString' }]
	},
	{
		// Empty array as compoundSlots.
		code: IMPORT + "sv({ slots: { body: 'p-4' }, compoundSlots: [] });",
		output: IMPORT + "sv({ slots: { body: 'p-4' } });",
		errors: [{ messageId: 'emptyArray' }]
	},
	{
		// Empty class in a compoundSlots entry.
		code:
			IMPORT +
			`sv({
				slots: { body: 'p-4' },
				compoundSlots: [{ slots: ['body'], class: '' }]
			});`,
		errors: [{ messageId: 'emptyString' }]
	},
	{
		// cn() with empty string.
		code: IMPORT_CN + "cn('');",
		errors: [{ messageId: 'emptyString' }]
	},
	{
		// cn() with empty array.
		code: IMPORT_CN + 'cn([]);',
		errors: [{ messageId: 'emptyArray' }]
	},
	{
		// cn() with empty object.
		code: IMPORT_CN + 'cn({});',
		errors: [{ messageId: 'emptyObject' }]
	},
	{
		// cn() with empty string mixed with non-empty.
		code: IMPORT_CN + "cn('flex', '');",
		output: IMPORT_CN + "cn('flex');",
		errors: [{ messageId: 'emptyString' }]
	},
	{
		// Multiple empties reported in a single call.
		code: IMPORT_CN + "cn('', [], {});",
		output: IMPORT_CN + 'cn(  {});',
		errors: [
			{ messageId: 'emptyString' },
			{ messageId: 'emptyArray' },
			{ messageId: 'emptyObject' }
		]
	},
	{
		// Empty string as a base arg with config.
		code: IMPORT + "sv('', { base: 'flex' });",
		output: IMPORT + "sv( { base: 'flex' });",
		errors: [{ messageId: 'emptyString' }]
	},
	{
		// Zero-arg sv() — produces an empty class string.
		code: IMPORT + 'sv();',
		errors: [{ messageId: 'emptyCall' }]
	},
	{
		// Zero-arg cn() — produces an empty class string.
		code: IMPORT_CN + 'cn();',
		errors: [{ messageId: 'emptyCall' }]
	}
];

t.test('no-empty-classes', (t) => {
	const emptyRule = rules['no-empty-classes'];

	t.doesNotThrow(() => {
		tester.run('no-empty-classes', emptyRule, {
			valid: NO_EMPTY_CLASSES_VALID,
			invalid: NO_EMPTY_CLASSES_INVALID
		});
	}, 'rule tester passes');
	t.end();
});

const NO_CONFLICTING_DUP_VALID = [
	IMPORT +
		"sv({ base: 'flex items-center', variants: { size: { sm: 'text-sm', lg: 'text-lg' } } });",
	IMPORT +
		"sv({ variants: { size: { sm: 'text-sm', lg: 'text-lg' }, intent: { primary: 'bg-blue-500', danger: 'bg-red-500' } } });",
	IMPORT + "sv('flex', 'items-center');",
	IMPORT + 'sv({});',
	// Same token across values of the same variant — mutually exclusive.
	IMPORT +
		"sv({ variants: { state: { on: 'highlight', off: 'highlight' } } });",
	// Same token across a ternary's branches — only one branch renders.
	IMPORT_CN + "cn(isActive ? 'flex' : 'flex');",
	// Ternary branches with conflicting namespaces are mutually exclusive.
	IMPORT_CN + "cn(isActive ? 'w-100' : 'w-200');",
	// Ternary in an sv() cn-style leading argument — branches are exclusive.
	IMPORT + "sv(isActive ? 'w-100' : 'w-200', { base: 'flex' });",
	// Template ternary — branch namespaces are mutually exclusive, quasi
	// token appears once.
	IMPORT_CN + "cn(`items-center ${col ? 'w-100' : 'w-200'}`);",
	// Chained ternary — all leaves are mutually exclusive, so conflicting
	// namespaces across leaves don't clash.
	IMPORT_CN + "cn(a ? 'w-100' : b ? 'w-200' : 'w-300');",
	// Same token across chained-ternary leaves — only one leaf renders.
	IMPORT_CN + "cn(a ? 'flex' : b ? 'flex' : 'block');",
	// A hoisted `const` contributes its tokens without self-conflict.
	IMPORT_CN + "const BASE = 'flex gap-2';\ncn(BASE, 'items-center');",
	// Dynamic base — can't analyze, don't false-flag.
	IMPORT + "sv({ base: dynamic, variants: { size: { sm: 'text-sm' } } });",
	// Without the import the rule stays quiet.
	"sv({ base: 'flex flex' });",
	// Boolean shorthand distinct from base.
	IMPORT + "sv({ base: 'btn', variants: { disabled: 'opacity-50' } });",
	// Spread in a variant record — can't fully enumerate keys.
	IMPORT + "sv({ variants: { size: { ...extra, sm: 'text-sm' } } });",
	// Spread inside a variant value when slots are present — the
	// shorthand check bails on the spread, so it's analyzed as
	// value-keyed (with the spread skipped).
	IMPORT +
		"sv({ slots: { body: 'p-4' }, variants: { size: { ...extra, sm: 'text-sm' } } });",
	// Computed key in a variant record — key is dynamic.
	IMPORT + "sv({ variants: { size: { [dyn]: 'x', sm: 'text-sm' } } });",
	// Variant value is a slot-keyed object (boolean shorthand w/ slots).
	IMPORT +
		`sv({
			slots: { body: 'p-4' },
			variants: { disabled: { body: 'opacity-50' } }
		});`,
	// compoundSlots adds distinct classes — no dup.
	IMPORT +
		`sv({
			slots: { body: 'p-4' },
			variants: { size: { sm: 'text-sm', lg: 'text-lg' } },
			compoundSlots: [
				{ slots: ['body'], size: 'lg', class: 'font-bold' }
			]
		});`,
	// compoundSlots with non-analyzable or incomplete entries.
	IMPORT +
		`sv({
			slots: { body: 'p-4' },
			compoundSlots: [
				42,
				{ slots: ['body'] },
				{ class: 'x' },
				{ slots: 'body', class: 'x' },
				{ slots: [dyn, 42, 'body'], className: 'font-bold' }
			]
		});`,
	// compoundVariants with non-object entries — skipped.
	IMPORT +
		`sv({
			variants: { size: { sm: 'text-sm', lg: 'text-lg' } },
			compoundVariants: [42, { size: 'lg', class: 'font-bold' }]
		});`,
	// Non-sv call after the import still has to be visited.
	IMPORT + "console.log('hi'); foo(); sv({ base: 'btn' });",
	// Non-string literal and dynamic inputs are safely ignored.
	IMPORT + 'sv({ base: 42, variants: { size: 123 } });',
	// Spread arg in a plain call — analyzer skips it.
	IMPORT + "sv(...extra, { base: 'flex' });",
	// Non-object elements inside a base array are skipped.
	IMPORT + "sv({ base: ['flex', ...extra, 'gap-2'] });",
	// String-literal property keys — config, variant keys, value keys.
	IMPORT +
		"sv({ 'base': 'flex items-center', 'variants': { 'size': { 'sm': 'text-sm', 'lg': 'text-lg' } } });",
	// Numeric-literal variant value keys.
	IMPORT + "sv({ variants: { size: { 1: 'text-sm', 2: 'text-lg' } } });",
	// Zero-arg sv() call.
	IMPORT + 'sv();',
	// Non-object `slots` value.
	IMPORT + "sv({ base: 'flex', slots: 42 });",
	// Spread in the config argument — not analyzable.
	IMPORT + "sv({ ...rest, base: 'flex flex' });",
	// Computed top-level config key — not analyzable.
	IMPORT + "sv({ [key]: 'x', base: 'flex flex' });",
	// Unknown top-level key — not treated as config.
	IMPORT + "sv({ unknown: 'x', base: 'flex flex' });",
	// Empty object as base (cn-style record) with no slots.
	IMPORT + 'sv({ base: {} });',
	// Empty object as base with slots — still opaque.
	IMPORT + "sv({ slots: { body: 'x' }, base: {} });",
	// cn-style record as base, no slots — not analyzed.
	IMPORT + "sv({ base: { 'some-class': true } });",
	// cn-style record with a non-slot key — bails out.
	IMPORT + "sv({ slots: { body: 'x' }, base: { foo: true } });",
	// Slot-keyed object as base with a spread — bails out.
	IMPORT + "sv({ slots: { body: 'p-4' }, base: { ...rest, body: 'z' } });",
	// Slot-keyed object as base with a computed key — bails out.
	IMPORT + "sv({ slots: { body: 'p-4' }, base: { [k]: 'z' } });",
	// Template literal with an interpolation — skipped.
	IMPORT + 'sv({ base: `foo ${dynamic} bar` });',
	// Import tracking and callee resolution (default/namespace/side-effect
	// imports, foreign modules, member-expression callees) are covered
	// exhaustively by the no-dynamic-classes suite.
	// cn with no duplicates.
	IMPORT_CN + "cn('flex', 'items-center');",
	// cn with only an array — no duplicates.
	IMPORT_CN + "cn(['flex', 'items-center']);",
	// Zero-arg cn() call.
	IMPORT_CN + 'cn();',
	// cn with a dynamic identifier argument — skipped.
	IMPORT_CN + "cn(dynamic, 'flex');",
	// cn with a spread argument — skipped.
	IMPORT_CN + "cn(...extra, 'flex');",
	// cn with a number literal — non-string literal ignored.
	IMPORT_CN + "cn(42, 'flex');",
	// cn-style record keys become tokens, but `foo` and `bar` are unrelated
	// single-word utilities — no namespace, nothing to conflict with.
	IMPORT_CN + "cn({ foo: true }, 'bar');",
	// Logical-AND and record-key tokens that don't collide with the statics.
	IMPORT_CN + "cn('flex', isActive && 'px-4', { 'text-red-500': hasError });",
	// Record key inside a cn array — distinct namespace from the array string.
	IMPORT_CN + "cn(['mt-2', { 'gap-4': cond }]);",
	// cn with a template literal containing an expression — skipped.
	IMPORT_CN + 'cn(`flex ${x}`, `items-center`);',
	// Unrelated call under a cn-only import is a no-op.
	IMPORT_CN + "foo(); cn('flex');",
	// Importing both sv and cn together works.
	"import { sv, cn } from 'slot-variants'; sv('a'); cn('b');",
	// Sparse null element in compoundVariants.
	IMPORT +
		`sv({
			variants: { size: { sm: 'text-sm', lg: 'text-lg' } },
			compoundVariants: [, { size: 'lg', class: 'font-bold' }]
		});`,
	// Spread in the slots object — iteration continues past it.
	IMPORT + "sv({ slots: { ...rest, body: 'p-4' } });",
	// compoundVariants entry with `className` and one with neither.
	IMPORT +
		`sv({
			variants: { size: { sm: 'text-sm', lg: 'text-lg' } },
			compoundVariants: [
				{ size: 'lg' },
				{ size: 'lg', className: 'font-bold' }
			]
		});`
];

const NO_CONFLICTING_DUP_INVALID = [
	{
		code:
			IMPORT +
			`sv({
				base: 'flex items-center',
				variants: {
					size: { sm: 'text-sm', lg: 'text-lg' },
					orientation: {
						row: ['flex', 'flex-row'],
						col: ['flex', 'flex-col']
					}
				},
				defaultVariants: { orientation: 'row' }
			});`,
		errors: repeat(dup('flex'), 3)
	},
	{
		// Duplicate within a single literal — each occurrence
		// gets its own report pointing at the token.
		code: IMPORT + "sv({ base: 'flex flex' });",
		errors: 2
	},
	{
		// Duplicate within one ternary branch — that branch renders both.
		code: IMPORT_CN + "cn(isActive ? 'flex flex' : 'block');",
		errors: 2
	},
	{
		// Duplicate between a static string and a ternary branch — when the
		// branch renders, the token appears twice.
		code: IMPORT_CN + "cn('flex', isActive ? 'flex' : 'block');",
		errors: 2
	},
	{
		// Duplicate between a template quasi (always present) and a ternary
		// branch of that same template.
		code: IMPORT_CN + "cn(`flex ${c ? 'flex' : 'block'}`);",
		errors: 2
	},
	{
		// Duplicate within a single ternary branch array — that branch renders
		// both tokens together.
		code: IMPORT_CN + "cn(cond ? ['flex', 'flex'] : 'block');",
		errors: 2
	},
	{
		// Duplicate between a hoisted `const` token and a literal argument.
		code: IMPORT_CN + "const BASE = 'flex';\ncn(BASE, 'flex');",
		errors: 2
	},
	{
		// Duplicate between a static string and a logical-AND array element —
		// when the condition holds, the token appears twice.
		code: IMPORT_CN + "cn('flex', cond && ['flex', 'gap-2']);",
		errors: 2
	},
	{
		// Duplicate across different variant keys.
		code:
			IMPORT +
			"sv({ variants: { size: { sm: 'p-2' }, intent: { primary: 'p-2' } } });",
		errors: 2
	},
	{
		// Duplicate between base and a variant value.
		code:
			IMPORT + "sv({ base: 'p-2', variants: { size: { sm: 'p-2' } } });",
		errors: 2
	},
	{
		// Duplicate between base and a compound variant.
		code:
			IMPORT +
			`sv({
				base: 'font-bold',
				variants: { size: { sm: 'text-sm', lg: 'text-lg' } },
				compoundVariants: [{ size: 'lg', class: 'font-bold' }]
			});`,
		errors: 2
	},
	{
		// Boolean shorthand with a token already in base.
		code:
			IMPORT +
			"sv({ base: 'opacity-50', variants: { disabled: 'opacity-50' } });",
		errors: 2
	},
	{
		// Slot-keyed variant value duplicates the slot's base class.
		code:
			IMPORT +
			`sv({
				slots: { body: 'flex' },
				variants: { disabled: { body: 'flex' } }
			});`,
		errors: repeat(dup('flex', 'body'), 2)
	},
	{
		// compoundSlots duplicates a class that's already on the slot.
		code:
			IMPORT +
			`sv({
				slots: { body: 'font-bold' },
				variants: { size: { sm: 'text-sm', lg: 'text-lg' } },
				compoundSlots: [
					{ slots: ['body'], size: 'lg', class: 'font-bold' }
				]
			});`,
		errors: 2
	},
	{
		// Template literal tokens participate in duplicate detection.
		code:
			IMPORT +
			'sv({ base: `flex items-center`, variants: { size: { sm: `flex` } } });',
		errors: 2
	},
	{
		// Same token emitted twice within a single compound entry.
		code:
			IMPORT +
			`sv({
				variants: { size: { sm: 'text-sm', lg: 'text-lg' } },
				compoundVariants: [
					{ size: 'lg', class: 'font-bold font-bold' }
				]
			});`,
		errors: 2
	},
	{
		// Token shared across two distinct compound entries.
		code:
			IMPORT +
			`sv({
				variants: {
					size: { sm: 'text-sm', lg: 'text-lg' },
					intent: { primary: 'p', danger: 'd' }
				},
				compoundVariants: [
					{ size: 'lg', class: 'font-bold' },
					{ intent: 'primary', class: 'font-bold' }
				]
			});`,
		errors: 2
	},
	{
		// Same variant value literal contains a token twice.
		code: IMPORT + "sv({ variants: { size: { sm: 'flex flex' } } });",
		errors: 2
	},
	{
		// sv without config, duplicate across args.
		code: IMPORT + "sv('flex', 'flex');",
		errors: repeat(dupCn('flex'), 2)
	},
	{
		// cn() duplicate across args.
		code: IMPORT_CN + "cn('flex', 'flex');",
		errors: repeat(dupCn('flex'), 2)
	},
	{
		// String-literal import specifier for cn is tracked.
		code: "import { 'cn' as cn } from 'slot-variants';\ncn('flex', 'flex');",
		errors: 2
	},
	{
		// cn() duplicate within a single literal.
		code: IMPORT_CN + "cn('flex flex');",
		errors: repeat(dupCn('flex'), 2)
	},
	{
		// cn() duplicate inside an array.
		code: IMPORT_CN + "cn(['flex', 'flex']);",
		errors: 2
	},
	{
		// cn() duplicate across an array and a string arg.
		code: IMPORT_CN + "cn(['flex'], 'flex');",
		errors: 2
	},
	{
		// cn() duplicate across template and string.
		code: IMPORT_CN + "cn(`flex`, 'flex');",
		errors: 2
	},
	{
		// cn() with a dup plus a non-dup token.
		code: IMPORT_CN + "cn('flex', 'flex', 'items-center');",
		errors: 2
	},
	{
		// Both sv and cn imported — cn call flagged independently.
		code: "import { sv, cn } from 'slot-variants'; sv('a'); cn('b', 'b');",
		errors: 2
	},
	{
		// cn() duplicate across a static string and a logical-AND string.
		code: IMPORT_CN + "cn('flex', isActive && 'flex');",
		errors: repeat(dupCn('flex'), 2)
	},
	{
		// cn() duplicate across a static string and a clsx record key.
		code: IMPORT_CN + "cn('flex', { flex: cond });",
		errors: repeat(dupCn('flex'), 2)
	},
	{
		// cn() duplicate within a multi-token record key.
		code: IMPORT_CN + "cn({ 'flex flex': cond });",
		errors: repeat(dupCn('flex'), 2)
	}
];

t.test('no-conflicting-classes (duplicate detection)', (t) => {
	t.doesNotThrow(() => {
		tester.run('no-conflicting-classes', rule, {
			valid: NO_CONFLICTING_DUP_VALID,
			invalid: NO_CONFLICTING_DUP_INVALID
		});
	}, 'rule tester passes');
	t.end();
});

const NO_CONFLICTING_NS_VALID = [
	// Single namespaced utility — nothing to conflict with.
	IMPORT + "sv({ base: 'w-100' });",
	// Single-word utilities have no namespace and are skipped.
	IMPORT + "sv({ base: 'flex block' });",
	// Different variant prefixes — not a conflict.
	IMPORT + "sv({ base: 'w-100 hover:w-200' });",
	// Same namespace across mutually-exclusive variant values.
	IMPORT + "sv({ variants: { size: { sm: 'w-100', lg: 'w-200' } } });",
	// Without the import the rule stays quiet.
	"sv({ base: 'w-100 w-200' });",
	// cn() with a dynamic arg — no static entries, exercises the empty-tokenMap branch.
	IMPORT_CN + 'cn(dynamic);',
	// Different namespace prefixes don't conflict.
	IMPORT + "sv({ base: 'w-100 h-200' });",
	// A color utility and a same-prefixed size utility target different CSS
	// properties, so they don't conflict.
	IMPORT + "sv({ base: 'text-sm text-red-500' });",
	// Border width and border color don't conflict.
	IMPORT + "sv({ base: 'border-2 border-red-500' });",
	// A single-segment color keyword is still recognized as a color, so it
	// doesn't conflict with a same-prefixed non-color utility.
	IMPORT + "sv({ base: 'bg-cover bg-white' });",
	// With grouping on, a grouped utility still doesn't conflict with an
	// unrelated namespaced utility.
	{
		code: IMPORT_CN + "cn('flex', 'w-100');",
		options: [{ exclusiveGroups: true }]
	},
	// With grouping on, the same group across different variant prefixes is not
	// a conflict.
	{
		code: IMPORT_CN + "cn('hover:flex', 'block');",
		options: [{ exclusiveGroups: true }]
	},
	// A single grouped utility on its own has nothing to conflict with.
	{
		code: IMPORT_CN + "cn('flex');",
		options: [{ exclusiveGroups: true }]
	},
	// Custom groups replace the built-ins, so built-in members aren't grouped.
	{
		code: IMPORT_CN + "cn('flex', 'block');",
		options: [{ exclusiveGroups: [['on', 'off']] }]
	},
	// The option can be explicitly disabled.
	{
		code: IMPORT_CN + "cn('flex', 'block');",
		options: [{ exclusiveGroups: false }]
	},
	// Zero-arg call.
	IMPORT + 'sv();'
];

const NO_CONFLICTING_NS_INVALID = [
	{
		// Basic conflict in base.
		code: IMPORT + "sv({ base: 'w-100 w-200' });",
		errors: repeat(conflict('w-100, w-200'), 2)
	},
	{
		// Important suffix is ignored when computing the conflict key.
		code: IMPORT + "sv({ base: 'w-100 w-200!' });",
		errors: 2
	},
	{
		// Leading `!` important marker (Tailwind v3) is ignored too.
		code: IMPORT + "sv({ base: '!w-100 w-200' });",
		errors: 2
	},
	{
		// Leading `!` on a variant-prefixed, negative utility.
		code: IMPORT + "sv({ base: 'hover:!-mt-2 hover:mt-4' });",
		errors: 2
	},
	{
		// Same variant prefix — still a conflict.
		code: IMPORT + "sv({ base: 'hover:w-100 hover:w-200' });",
		errors: 2
	},
	{
		// Multi-segment namespace conflict (bg-red-500 vs bg-blue-500).
		code: IMPORT + "sv({ base: 'bg-red-500 bg-blue-500' });",
		errors: 2
	},
	{
		// A named color keyword and a shaded color are both colors — they still
		// conflict.
		code: IMPORT + "sv({ base: 'bg-white bg-red-500' });",
		errors: 2
	},
	{
		// Two text-color utilities conflict (same color property).
		code: IMPORT_CN + "cn('text-red-500', 'text-blue-500');",
		errors: repeat(conflictCn('text-blue-500, text-red-500'), 2)
	},
	{
		// Opt-in: two single-word display utilities are mutually exclusive.
		code: IMPORT_CN + "cn('flex', 'block');",
		options: [{ exclusiveGroups: true }],
		errors: repeat(conflictCn('block, flex'), 2)
	},
	{
		// Opt-in: single-word position utilities.
		code: IMPORT_CN + "cn('absolute', 'relative');",
		options: [{ exclusiveGroups: true }],
		errors: repeat(conflictCn('absolute, relative'), 2)
	},
	{
		// Opt-in: a hyphenated display utility conflicts with a single-word one
		// even though they share no dash-namespace.
		code: IMPORT_CN + "cn('flex', 'inline-block');",
		options: [{ exclusiveGroups: true }],
		errors: repeat(conflictCn('flex, inline-block'), 2)
	},
	{
		// Opt-in grouping is respected inside an sv() config too, per slot.
		code: IMPORT + "sv({ base: 'absolute fixed' });",
		options: [{ exclusiveGroups: true }],
		errors: repeat(conflict('absolute, fixed'), 2)
	},
	{
		// Custom groups flag project-specific mutually-exclusive utilities.
		code: IMPORT_CN + "cn('on', 'off');",
		options: [{ exclusiveGroups: [['on', 'off', 'auto']] }],
		errors: repeat(conflictCn('off, on'), 2)
	},
	{
		// Negative utility shares namespace with positive sibling.
		code: IMPORT + "sv({ base: '-mt-2 mt-4' });",
		errors: 2
	},
	{
		// Conflict spans base and a variant value (different variant
		// keys means not mutually exclusive).
		code:
			IMPORT +
			"sv({ base: 'w-100', variants: { size: { sm: 'w-200' } } });",
		errors: 2
	},
	{
		// Slot-scoped conflict — namespace duplicated within a slot.
		code: IMPORT + "sv({ slots: { body: 'w-100 w-200' } });",
		errors: repeat(conflict('w-100, w-200', 'body'), 2)
	},
	{
		// sv used as cn (no config) — uses the cn message.
		code: IMPORT + "sv('w-100', 'w-200');",
		errors: repeat(conflictCn('w-100, w-200'), 2)
	},
	{
		// cn() conflict across args.
		code: IMPORT_CN + "cn('w-100', 'w-200');",
		errors: 2
	},
	{
		// cn() conflict between a static string and a logical-AND string.
		code: IMPORT_CN + "cn('px-2 py-1', isActive && 'px-4', { 'text-red-500': hasError });",
		errors: repeat(conflictCn('px-2, px-4'), 2)
	},
	{
		// cn() conflict between two clsx-style record keys.
		code: IMPORT_CN + "cn({ 'w-100': a, 'w-200': b });",
		errors: repeat(conflictCn('w-100, w-200'), 2)
	},
	{
		// cn() conflict between a record key and a static string.
		code: IMPORT_CN + "cn('w-100', { 'w-200': cond });",
		errors: 2
	},
	{
		// Multi-token record key contributes each token to conflict detection.
		code: IMPORT_CN + "cn('w-100', { 'shrink-0 w-200': cond });",
		errors: 2
	},
	{
		// Logical-AND string conflict in an sv() cn-style leading argument —
		// reported against the base slot since the call carries a config.
		code: IMPORT + "sv('w-100', isLarge && 'w-200', { base: 'flex' });",
		errors: repeat(conflict('w-100, w-200'), 2)
	},
	{
		// Two independent ternaries can both render, so a conflict across
		// their branches is flagged.
		code: IMPORT_CN + "cn(a ? 'w-100' : 'block', b ? 'w-200' : 'flex');",
		errors: repeat(conflictCn('w-100, w-200'), 2)
	},
	{
		// Conflict between a static string and a ternary branch.
		code: IMPORT_CN + "cn('w-100', cond ? 'w-200' : 'block');",
		errors: 2
	},
	{
		// Conflict between a template quasi and a ternary branch of the same
		// template — the quasi always renders.
		code: IMPORT_CN + "cn(`w-100 ${cond ? 'w-200' : 'block'}`);",
		errors: 2
	},
	{
		// Conflict within a single ternary branch array — both render together.
		code: IMPORT_CN + "cn(cond ? ['w-100', 'w-200'] : 'block');",
		errors: 2
	},
	{
		// Conflict between an always-present token and a chained-ternary leaf.
		code: IMPORT_CN + "cn('w-100', a ? 'w-200' : 'block');",
		errors: 2
	}
];

t.test('no-conflicting-classes (namespace conflicts)', (t) => {
	const conflictRule = rules['no-conflicting-classes'];

	t.doesNotThrow(() => {
		tester.run('no-conflicting-classes', conflictRule, {
			valid: NO_CONFLICTING_NS_VALID,
			invalid: NO_CONFLICTING_NS_INVALID
		});
	}, 'rule tester passes');
	t.end();
});

const NO_SHARED_TOKENS_VALID = [
	// Non-object variants field bails out immediately.
	IMPORT + 'sv({ variants: dynamic });',
	// No defaultVariants and no requiredVariants — variant prop
	// can be undefined at runtime, no value branch is guaranteed.
	IMPORT +
		"sv({ variants: { size: { sm: 'rounded text-sm', lg: 'rounded text-lg' } } });",
	// defaultVariants targets a different variant — `size` still
	// not exhaustive.
	IMPORT +
		`sv({
			variants: {
				size: { sm: 'rounded text-sm', lg: 'rounded text-lg' },
				intent: { primary: 'bg-blue-500', danger: 'bg-red-500' }
			},
			defaultVariants: { intent: 'primary' }
		});`,
	// Explicit undefined default does not make a variant exhaustive.
	IMPORT +
		`sv({
			variants: {
				size: { sm: 'rounded text-sm', lg: 'rounded text-lg' }
			},
			defaultVariants: { size: undefined }
		});`,
	// Dynamic/function defaults may return undefined, so they do
	// not prove a value branch always renders.
	IMPORT +
		`sv({
			variants: {
				size: { sm: 'rounded text-sm', lg: 'rounded text-lg' },
				intent: { primary: 'font-bold text-blue', danger: 'font-bold text-red' }
			},
			defaultVariants: {
				size: getDefaultSize(),
				intent: () => 'primary'
			}
		});`,
	// Single-value variant — nothing to compare against.
	IMPORT +
		`sv({
			variants: { size: { sm: 'rounded text-sm' } },
			defaultVariants: { size: 'sm' }
		});`,
	// Token in only some values, not all.
	IMPORT +
		`sv({
			variants: {
				size: {
					sm: 'rounded text-sm',
					md: 'text-md',
					lg: 'rounded text-lg'
				}
			},
			defaultVariants: { size: 'md' }
		});`,
	// Boolean shorthand — only one branch fires.
	IMPORT +
		`sv({
			variants: { disabled: 'opacity-50 cursor-not-allowed' },
			defaultVariants: { disabled: false }
		});`,
	// Slot-keyed boolean shorthand — also a single branch.
	IMPORT +
		`sv({
			slots: { body: 'p-4' },
			variants: { disabled: { body: 'opacity-50' } },
			defaultVariants: { disabled: false }
		});`,
	// Spread inside variant value record — can't enumerate values.
	IMPORT +
		`sv({
			variants: {
				size: { ...extra, sm: 'rounded text-sm', lg: 'rounded text-lg' }
			},
			defaultVariants: { size: 'sm' }
		});`,
	// Computed key inside variant value record — same reason.
	IMPORT +
		`sv({
			variants: {
				size: { [k]: 'x', sm: 'rounded text-sm', lg: 'rounded text-lg' }
			},
			defaultVariants: { size: 'sm' }
		});`,
	// Spread in defaultVariants is ignored while static keys still
	// make the variant exhaustive.
	IMPORT +
		`sv({
			variants: {
				size: { sm: 'rounded text-sm', lg: 'text-lg' }
			},
			defaultVariants: { ...defaults, size: 'sm' }
		});`,
	// Non-string requiredVariants entries are ignored, and computed
	// top-level variant keys are skipped before analysis continues.
	IMPORT +
		`sv({
			variants: {
				[k]: { sm: 'rounded text-sm', lg: 'rounded text-lg' },
				size: { sm: 'text-sm', lg: 'text-lg' }
			},
			requiredVariants: [42, 'size']
		});`,
	// Shared token only in one slot for one value, missing in another.
	IMPORT +
		`sv({
			slots: { root: 'flex', body: 'p-4' },
			variants: {
				size: {
					sm: { root: 'rounded text-sm', body: 'p-1' },
					lg: { root: 'text-lg', body: 'rounded p-2' }
				}
			},
			defaultVariants: { size: 'sm' }
		});`,
	// Token in every value but in different slots — not shared
	// per-slot.
	IMPORT +
		`sv({
			slots: { root: 'flex', body: 'p-4' },
			variants: {
				size: {
					sm: { root: 'rounded' },
					lg: { body: 'rounded' }
				}
			},
			defaultVariants: { size: 'sm' }
		});`,
	// cn() call — never analyzed.
	IMPORT_CN + "cn('flex', 'flex-row');",
	// sv() with no config — never analyzed.
	IMPORT + "sv('flex', 'rounded');",
	// Without the import the rule stays quiet.
	"sv({ variants: { size: { sm: 'rounded', lg: 'rounded' } }, defaultVariants: { size: 'sm' } });",
	// Dynamic variant value — opaque, no tokens collected.
	IMPORT +
		`sv({
			variants: { size: { sm: dynamic, lg: 'rounded' } },
			defaultVariants: { size: 'sm' }
		});`,
	// Empty config — no variants.
	IMPORT + 'sv({});',
	// `requiredVariants: false` marks nothing required — without a
	// default the variant is not exhaustive, so the shared token
	// is not flagged.
	IMPORT +
		`sv({
			variants: {
				size: { sm: 'rounded text-sm', lg: 'rounded text-lg' }
			},
			requiredVariants: false
		});`
];

const NO_SHARED_TOKENS_INVALID = [
	{
		// Token shared across all values of an exhaustive variant
		// (via defaultVariants) — flag every occurrence.
		code:
			IMPORT +
			`sv({
				variants: {
					size: {
						sm: 'rounded text-sm',
						md: 'rounded text-md',
						lg: 'rounded text-lg'
					}
				},
				defaultVariants: { size: 'md' }
			});`,
		errors: repeat(shared('rounded', 'size'), 3)
	},
	{
		// Two-value variant, exhaustive via requiredVariants —
		// entry given as a static template literal.
		code:
			IMPORT +
			`sv({
				variants: {
					intent: {
						primary: 'rounded font-bold bg-blue-500',
						danger: 'rounded font-bold bg-red-500'
					}
				},
				requiredVariants: [\`intent\`]
			});`,
		errors: [
			shared('rounded', 'intent'),
			shared('font-bold', 'intent'),
			shared('rounded', 'intent'),
			shared('font-bold', 'intent')
		]
	},
	{
		// Every variant required via `requiredVariants: true` —
		// the shared token is flagged just like an array-listed
		// required variant.
		code:
			IMPORT +
			`sv({
				variants: {
					size: {
						sm: 'rounded text-sm',
						lg: 'rounded text-lg'
					}
				},
				requiredVariants: true
			});`,
		errors: repeat(shared('rounded', 'size'), 2)
	},
	{
		// Shared token in a non-base slot — must be flagged for
		// the actual slot, not base.
		code:
			IMPORT +
			`sv({
				slots: { root: 'flex', body: 'p-4' },
				variants: {
					size: {
						sm: { root: 'rounded text-sm', body: 'p-1' },
						lg: { root: 'rounded text-lg', body: 'p-2' }
					}
				},
				defaultVariants: { size: 'sm' }
			});`,
		errors: repeat(shared('rounded', 'size', 'root'), 2)
	},
	{
		// Variant value as an array of strings — extractor walks
		// the array; the shared token is still detected.
		code:
			IMPORT +
			`sv({
				variants: {
					size: {
						sm: ['rounded', 'text-sm'],
						lg: ['rounded', 'text-lg']
					}
				},
				defaultVariants: { size: 'sm' }
			});`,
		errors: repeat(shared('rounded', 'size'), 2)
	},
	{
		// Boolean record (true/false keys) with a shared token,
		// exhaustive via defaultVariants.
		code:
			IMPORT +
			`sv({
				variants: {
					on: {
						true: 'highlight bg-blue-500',
						false: 'highlight bg-gray-200'
					}
				},
				defaultVariants: { on: false }
			});`,
		errors: repeat(shared('highlight', 'on'), 2)
	},
	{
		// Numeric variant value keys are parsed as literal property keys
		// and should still participate in shared-token detection.
		code:
			IMPORT +
			`sv({
				variants: {
					size: {
						1: 'rounded text-sm',
						2: 'rounded text-lg'
					}
				},
				defaultVariants: { size: 1 }
			});`,
		errors: repeat(shared('rounded', 'size'), 2)
	}
];

t.test('no-shared-tokens', (t) => {
	const sharedRule = rules['no-shared-tokens'];

	t.doesNotThrow(() => {
		tester.run('no-shared-tokens', sharedRule, {
			valid: NO_SHARED_TOKENS_VALID,
			invalid: NO_SHARED_TOKENS_INVALID
		});
	}, 'rule tester passes');
	t.end();
});

const REQUIRE_TOP_LEVEL_CONFIG_VALID = [
	// Config call at the module top level.
	IMPORT + "sv({ base: 'flex' });",
	// Config call assigned to a top-level binding.
	IMPORT + "const button = sv({ base: 'flex' });",
	// Config call exported from the top level.
	IMPORT + "export const button = sv({ base: 'flex' });",
	// Inside a top-level block — still runs once at module load.
	IMPORT + "{ const b = sv({ base: 'flex' }); }",
	// Inside a top-level conditional — runs at most once at load.
	IMPORT + "if (x) { sv({ base: 'flex' }); }",
	// cn-style sv() (no config) nested in a function is fine.
	IMPORT + "function f() { return sv('flex', 'items-center'); }",
	// Zero-arg sv() nested in a function carries no config.
	IMPORT + 'function f() { return sv(); }',
	// cn() nested in a function never carries a config.
	IMPORT_CN + "function f() { return cn('flex'); }",
	// Config-shaped last arg in a cn-style call still counts as config,
	// but here it's at the top level.
	IMPORT + "sv('flex', { base: 'items-center' });",
	// Without an import, the rule stays quiet even when nested.
	"function f() { return sv({ base: 'flex' }); }",
	// Default-imported sv is not tracked.
	"import sv from 'slot-variants'; function f() { sv({ base: 'flex' }); }",
	// Member-expression callee is not tracked.
	IMPORT + "function f() { return obj.sv({ base: 'flex' }); }"
];

const REQUIRE_TOP_LEVEL_CONFIG_INVALID = [
	{
		// Config call inside a function declaration.
		code: IMPORT + "function f() { return sv({ base: 'flex' }); }",
		errors: [{ messageId: 'nested' }]
	},
	{
		// Config call inside an arrow function body.
		code: IMPORT + "const make = () => sv({ base: 'flex' });",
		errors: [{ messageId: 'nested' }]
	},
	{
		// Config call nested in a block inside a function.
		code: IMPORT + "function f() { { const b = sv({ base: 'flex' }); } }",
		errors: [{ messageId: 'nested' }]
	},
	{
		// Config call inside an object method.
		code: IMPORT + "const o = { make() { return sv({ base: 'flex' }); } };",
		errors: [{ messageId: 'nested' }]
	},
	{
		// Config call inside a component function body.
		code:
			IMPORT +
			"function Button() { const c = sv({ base: 'flex' }); return c; }",
		errors: [{ messageId: 'nested' }]
	},
	{
		// cn-style sv() whose last arg is config-shaped, nested.
		code:
			IMPORT +
			"function f() { return sv('flex', { base: 'items-center' }); }",
		errors: [{ messageId: 'nested' }]
	}
];

t.test('require-top-level-config', (t) => {
	const topLevelRule = rules['require-top-level-config'];

	t.doesNotThrow(() => {
		tester.run('require-top-level-config', topLevelRule, {
			valid: REQUIRE_TOP_LEVEL_CONFIG_VALID,
			invalid: REQUIRE_TOP_LEVEL_CONFIG_INVALID
		});
	}, 'rule tester passes');
	t.end();
});