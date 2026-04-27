import t from 'tap';
import { RuleTester } from 'eslint';
import plugin, { rules } from '../src/eslint-plugin.ts';

const tester = new RuleTester({
	languageOptions: {
		ecmaVersion: 'latest',
		sourceType: 'module'
	}
});

const rule = rules['no-duplicate-classes'];
const IMPORT = "import { sv } from 'slot-variants';\n";
const IMPORT_CN = "import { cn } from 'slot-variants';\n";

t.test('plugin shape (ESLint + oxlint compat)', (t) => {
	t.equal(plugin.meta.name, 'slot-variants', 'meta.name is set');
	t.ok(plugin.rules, 'rules object present');
	for (const [name, r] of Object.entries(plugin.rules)) {
		t.ok(r.meta, `${name}: has meta`);
		t.ok(r.meta?.messages, `${name}: has messages`);
		t.ok(r.meta?.schema !== undefined, `${name}: has schema`);
		t.equal(typeof r.create, 'function', `${name}: has create()`);
	}
	t.end();
});

t.test('no-redundant-spaces', (t) => {
	const spacesRule = rules['no-redundant-spaces'];

	t.doesNotThrow(() => {
		tester.run('no-redundant-spaces', spacesRule, {
			valid: [
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
				// Sparse hole in array — skipped.
				IMPORT + "sv({ base: ['flex', , 'gap-2'] });",
				// Spread element inside a class array — bailed out.
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
				// Non-class-bearing keys are walked but contain no offending strings.
				IMPORT +
					`sv({
						base: 'flex',
						defaultVariants: { size: 'sm' },
						requiredVariants: ['intent'],
						presets: { cta: { size: 'lg' } },
						cacheSize: 256,
						introspection: true
					});`,
				// Dynamic identifier — walker skips silently.
				IMPORT + 'sv({ base: dynamic });',
				// Non-string literal — walker skips.
				IMPORT + 'sv({ base: 42 });',
				// Template with expression — walker skips.
				IMPORT + 'sv({ base: `flex ${dynamic}` });',
				// Spread inside the config object — that property skipped, others walked.
				IMPORT + "sv({ ...rest, base: 'flex' });",
				// Computed key — that property skipped, others walked.
				IMPORT + "sv({ [k]: 'x', base: 'flex' });",
				// Non-string literal as cn() argument — skipped.
				IMPORT_CN + "cn(42, 'flex');",
				// Spread argument to cn() — skipped.
				IMPORT_CN + "cn(...rest, 'flex');",
				// Spread argument to sv() — skipped.
				IMPORT + "sv(...rest, 'flex');",
				// Zero-arg calls.
				IMPORT + 'sv();',
				IMPORT_CN + 'cn();',
				// Without import — silent.
				"sv({ base: ' flex  ' });",
				// Default-imported sv is not tracked.
				"import sv from 'slot-variants'; sv({ base: ' flex  ' });",
				// Namespace-imported sv is not tracked.
				"import * as mod from 'slot-variants'; mod.sv({ base: ' flex  ' });",
				// Side-effect import — no specifiers tracked.
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
			],
			invalid: [
				{
					// Leading whitespace.
					code: IMPORT + "sv({ base: ' flex' });",
					errors: 1
				},
				{
					// Trailing whitespace.
					code: IMPORT + "sv({ base: 'flex ' });",
					errors: 1
				},
				{
					// Multiple consecutive spaces.
					code: IMPORT + "sv({ base: 'flex  items-center' });",
					errors: 1
				},
				{
					// Tab character between tokens.
					code: IMPORT + "sv({ base: 'flex\\titems-center' });",
					errors: 1
				},
				{
					// Newline whitespace inside template literal.
					code: IMPORT + 'sv({ base: `flex\nitems-center` });',
					errors: 1
				},
				{
					// Leading + middle + trailing — single report on the literal.
					code: IMPORT + "sv({ base: ' flex  items ' });",
					errors: 1
				},
				{
					// Redundant whitespace inside an array element.
					code: IMPORT + "sv({ base: ['flex ', 'gap-2'] });",
					errors: 1
				},
				{
					// Redundant whitespace inside a static template literal.
					code: IMPORT + 'sv({ base: `flex  items-center` });',
					errors: 1
				},
				{
					// Redundant whitespace in a slots value.
					code:
						IMPORT +
						"sv({ slots: { body: 'p-4 ', header: 'font-bold' } });",
					errors: 1
				},
				{
					// Redundant whitespace in a variant record value.
					code:
						IMPORT +
						"sv({ variants: { size: { sm: ' text-sm', lg: 'text-lg' } } });",
					errors: 1
				},
				{
					// Redundant whitespace in a boolean-shorthand variant value.
					code:
						IMPORT +
						"sv({ variants: { disabled: 'opacity-50  cursor-not-allowed' } });",
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
					errors: 1
				},
				{
					// cn() positional with trailing whitespace.
					code: IMPORT_CN + "cn('flex ', 'items-center');",
					errors: 1
				},
				{
					// cn() with redundant whitespace inside template literal.
					code: IMPORT_CN + 'cn(`flex  items-center`);',
					errors: 1
				},
				{
					// cn() with redundant whitespace inside an array argument.
					code: IMPORT_CN + "cn(['flex  items-center']);",
					errors: 1
				},
				{
					// sv() called cn-style with redundant whitespace.
					code: IMPORT + "sv('flex  items-center');",
					errors: 1
				}
			]
		});
	}, 'rule tester passes');
	t.end();
});

t.test('no-dynamic-classes', (t) => {
	const dynamicRule = rules['no-dynamic-classes'];

	t.doesNotThrow(() => {
		tester.run('no-dynamic-classes', dynamicRule, {
			valid: [
				// Static class strings in cn-style call.
				IMPORT + "sv('flex', 'items-center');",
				// Static base in config.
				IMPORT + "sv({ base: 'flex' });",
				// Array of static class values.
				IMPORT + "sv({ base: ['flex', 'gap-2'] });",
				// Sparse hole in array — allowed.
				IMPORT + "sv({ base: ['flex', , 'gap-2'] });",
				// Template literal without expressions.
				IMPORT + 'sv({ base: `flex gap-2` });',
				// Static slots record.
				IMPORT + "sv({ slots: { body: 'p-4', header: 'font-bold' } });",
				// Static value-keyed variants.
				IMPORT +
					"sv({ variants: { size: { sm: 'text-sm', lg: 'text-lg' } } });",
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
				// Without an import, the rule is silent.
				"sv({ base: dynamic });",
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
				// Importing both sv and cn.
				"import { sv, cn } from 'slot-variants'; sv('a'); cn('b');",
				// Member-expression callee is not tracked.
				IMPORT + "obj.sv(dynamic);",
				// Unrelated function call when imports are tracked.
				IMPORT + "console.log('hi'); sv('flex');"
			],
			invalid: [
				{
					// Identifier as cn-style argument.
					code: IMPORT + 'sv(dynamic);',
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
						IMPORT +
						"sv({ variants: { ...rest, size: { sm: 'text-sm' } } });",
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
						IMPORT +
						"sv({ variants: { size: { ...rest, sm: 'text-sm' } } });",
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
					// cn() with an object record (not statically inferrable).
					code: IMPORT_CN + "cn({ foo: true });",
					errors: 1
				},
				{
					// cn() with a template literal containing an expression.
					code: IMPORT_CN + 'cn(`flex ${x}`);',
					errors: 1
				}
			]
		});
	}, 'rule tester passes');
	t.end();
});

t.test('no-empty-classes', (t) => {
	const emptyRule = rules['no-empty-classes'];

	t.doesNotThrow(() => {
		tester.run('no-empty-classes', emptyRule, {
			valid: [
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
				IMPORT +
					"sv({ slots: { body: '', header: 'font-bold' } });",
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
				IMPORT +
					"sv({ variants: { size: { sm: 'text-sm', lg: 'text-lg' } } });",
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
				IMPORT_CN + "cn({ foo: true, bar: false });",
				// Non-string literal as cn argument — not an empty class.
				IMPORT_CN + "cn(0, false, null, undefined);",
				// Non-empty values in nested arrays.
				IMPORT_CN + "cn([['flex', 'gap-2']]);",
				// Template literal with an interpolation — not empty, skipped.
				IMPORT_CN + 'cn(`flex ${x}`);',
				// Spread argument — skipped.
				IMPORT_CN + "cn(...rest, 'flex');",
				// Without an import, the rule is silent.
				"sv();",
				"cn();",
				"sv('');",
				"cn({});",
				// Default-imported sv is not tracked.
				"import sv from 'slot-variants'; sv('');",
				// Namespace-imported sv is not tracked.
				"import * as mod from 'slot-variants'; mod.sv('');",
				// Side-effect import — no specifiers tracked.
				"import 'slot-variants'; sv('');",
				// Named import that is neither sv nor cn is ignored.
				"import { VariantProps } from 'slot-variants'; sv('');",
				// Import from a different module is ignored.
				"import { sv } from 'other'; sv('');",
				// Member-expression callee is not tracked.
				IMPORT + "obj.sv('');",
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
				IMPORT +
					"sv({ variants: { ...rest, size: { sm: 'text-sm' } } });",
				// Computed key inside variants — that property is bailed.
				IMPORT + "sv({ variants: { [k]: { sm: 'text-sm' } } });",
				// Spread inside a variant value record — that property is bailed.
				IMPORT +
					"sv({ variants: { size: { ...rest, sm: 'text-sm' } } });",
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
				IMPORT +
					"sv({ 'base': 'flex', 'slots': { 'body': 'p-4' } });"
			],
			invalid: [
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
					errors: [{ messageId: 'emptyString' }]
				},
				{
					// Empty slots object.
					code: IMPORT + "sv({ base: 'flex', slots: {} });",
					errors: [{ messageId: 'emptyObject' }]
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
					// Empty array inside a variant value record.
					code: IMPORT + 'sv({ variants: { size: { sm: [] } } });',
					errors: [{ messageId: 'emptyArray' }]
				},
				{
					// Empty array as compoundVariants.
					code:
						IMPORT +
						"sv({ variants: { size: { sm: 'text-sm' } }, compoundVariants: [] });",
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
					code:
						IMPORT +
						"sv({ slots: { body: 'p-4' }, compoundSlots: [] });",
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
					errors: [{ messageId: 'emptyString' }]
				},
				{
					// Multiple empties reported in a single call.
					code: IMPORT_CN + "cn('', [], {});",
					errors: [
						{ messageId: 'emptyString' },
						{ messageId: 'emptyArray' },
						{ messageId: 'emptyObject' }
					]
				},
				{
					// Empty string as a base arg with config.
					code: IMPORT + "sv('', { base: 'flex' });",
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
			]
		});
	}, 'rule tester passes');
	t.end();
});

t.test('no-duplicate-classes', (t) => {
	t.doesNotThrow(() => {
		tester.run('no-duplicate-classes', rule, {
			valid: [
				IMPORT +
					"sv({ base: 'flex items-center', variants: { size: { sm: 'text-sm', lg: 'text-lg' } } });",
				IMPORT +
					"sv({ variants: { size: { sm: 'text-sm', lg: 'text-lg' }, intent: { primary: 'bg-blue-500', danger: 'bg-red-500' } } });",
				IMPORT + "sv('flex', 'items-center');",
				IMPORT + 'sv({});',
				// Same token across values of the same variant — mutually exclusive.
				IMPORT +
					"sv({ variants: { state: { on: 'highlight', off: 'highlight' } } });",
				// Dynamic base — can't analyze, don't false-flag.
				IMPORT +
					"sv({ base: dynamic, variants: { size: { sm: 'text-sm' } } });",
				// Without the import the rule stays quiet.
				"sv({ base: 'flex flex' });",
				// Boolean shorthand distinct from base.
				IMPORT +
					"sv({ base: 'btn', variants: { disabled: 'opacity-50' } });",
				// Spread in a variant record — can't fully enumerate keys.
				IMPORT +
					"sv({ variants: { size: { ...extra, sm: 'text-sm' } } });",
				// Spread inside a variant value when slots are present — the
				// shorthand check bails on the spread, so it's analyzed as
				// value-keyed (with the spread skipped).
				IMPORT +
					"sv({ slots: { body: 'p-4' }, variants: { size: { ...extra, sm: 'text-sm' } } });",
				// Computed key in a variant record — key is dynamic.
				IMPORT +
					"sv({ variants: { size: { [dyn]: 'x', sm: 'text-sm' } } });",
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
				IMPORT +
					"sv({ variants: { size: { 1: 'text-sm', 2: 'text-lg' } } });",
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
				IMPORT +
					"sv({ slots: { body: 'x' }, base: { foo: true } });",
				// Slot-keyed object as base with a spread — bails out.
				IMPORT +
					"sv({ slots: { body: 'p-4' }, base: { ...rest, body: 'z' } });",
				// Slot-keyed object as base with a computed key — bails out.
				IMPORT +
					"sv({ slots: { body: 'p-4' }, base: { [k]: 'z' } });",
				// Template literal with an interpolation — skipped.
				IMPORT + 'sv({ base: `foo ${dynamic} bar` });',
				// Import from a different module is ignored by the rule.
				IMPORT +
					"import path from 'node:path'; sv({ base: 'flex' });",
				// Default and namespace imports aren't tracked as `sv`.
				"import sv from 'slot-variants'; sv({ base: 'flex flex' });",
				"import * as mod from 'slot-variants'; mod.sv({ base: 'flex flex' });",
				// Side-effect import of slot-variants — no specifiers.
				"import 'slot-variants'; sv({ base: 'flex flex' });",
				// Named import that is neither `sv` nor `cn` is ignored.
				"import { VariantProps } from 'slot-variants'; sv('flex flex');",
				// cn from a different module is ignored.
				"import { cn } from 'other'; cn('flex', 'flex');",
				// Default-imported cn is not tracked.
				"import cn from 'slot-variants'; cn('flex', 'flex');",
				// Namespace-imported cn is not tracked.
				"import * as mod from 'slot-variants'; mod.cn('flex', 'flex');",
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
				// cn with a cn-style record — opaque, skipped.
				IMPORT_CN + "cn({ foo: true }, 'bar');",
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
				IMPORT +
					"sv({ slots: { ...rest, body: 'p-4' } });",
				// compoundVariants entry with `className` and one with neither.
				IMPORT +
					`sv({
						variants: { size: { sm: 'text-sm', lg: 'text-lg' } },
						compoundVariants: [
							{ size: 'lg' },
							{ size: 'lg', className: 'font-bold' }
						]
					});`
			],
			invalid: [
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
					errors: [
						{
							messageId: 'duplicate',
							data: { token: 'flex', slot: 'base' }
						},
						{
							messageId: 'duplicate',
							data: { token: 'flex', slot: 'base' }
						},
						{
							messageId: 'duplicate',
							data: { token: 'flex', slot: 'base' }
						}
					]
				},
				{
					// Duplicate within a single literal — each occurrence
					// gets its own report pointing at the token.
					code: IMPORT + "sv({ base: 'flex flex' });",
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
						IMPORT +
						"sv({ base: 'p-2', variants: { size: { sm: 'p-2' } } });",
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
					errors: [
						{
							messageId: 'duplicate',
							data: { token: 'flex', slot: 'body' }
						},
						{
							messageId: 'duplicate',
							data: { token: 'flex', slot: 'body' }
						}
					]
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
					code:
						IMPORT +
						"sv({ variants: { size: { sm: 'flex flex' } } });",
					errors: 2
				},
				{
					// sv without config, duplicate across args.
					code: IMPORT + "sv('flex', 'flex');",
					errors: [
						{
							messageId: 'duplicateCn',
							data: { token: 'flex' }
						},
						{
							messageId: 'duplicateCn',
							data: { token: 'flex' }
						}
					]
				},
				{
					// cn() duplicate across args.
					code: IMPORT_CN + "cn('flex', 'flex');",
					errors: [
						{
							messageId: 'duplicateCn',
							data: { token: 'flex' }
						},
						{
							messageId: 'duplicateCn',
							data: { token: 'flex' }
						}
					]
				},
				{
					// cn() duplicate within a single literal.
					code: IMPORT_CN + "cn('flex flex');",
					errors: [
						{
							messageId: 'duplicateCn',
							data: { token: 'flex' }
						},
						{
							messageId: 'duplicateCn',
							data: { token: 'flex' }
						}
					]
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
					code:
						"import { sv, cn } from 'slot-variants'; sv('a'); cn('b', 'b');",
					errors: 2
				}
			]
		});
	}, 'rule tester passes');
	t.end();
});

t.test('no-shared-tokens', (t) => {
	const sharedRule = rules['no-shared-tokens'];

	t.doesNotThrow(() => {
		tester.run('no-shared-tokens', sharedRule, {
			valid: [
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
				IMPORT + 'sv({});'
			],
			invalid: [
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
					errors: [
						{
							messageId: 'shared',
							data: {
								token: 'rounded',
								variant: 'size',
								slot: 'base'
							}
						},
						{
							messageId: 'shared',
							data: {
								token: 'rounded',
								variant: 'size',
								slot: 'base'
							}
						},
						{
							messageId: 'shared',
							data: {
								token: 'rounded',
								variant: 'size',
								slot: 'base'
							}
						}
					]
				},
				{
					// Two-value variant, exhaustive via requiredVariants.
					code:
						IMPORT +
						`sv({
							variants: {
								intent: {
									primary: 'rounded font-bold bg-blue-500',
									danger: 'rounded font-bold bg-red-500'
								}
							},
							requiredVariants: ['intent']
						});`,
					errors: [
						{
							messageId: 'shared',
							data: {
								token: 'rounded',
								variant: 'intent',
								slot: 'base'
							}
						},
						{
							messageId: 'shared',
							data: {
								token: 'font-bold',
								variant: 'intent',
								slot: 'base'
							}
						},
						{
							messageId: 'shared',
							data: {
								token: 'rounded',
								variant: 'intent',
								slot: 'base'
							}
						},
						{
							messageId: 'shared',
							data: {
								token: 'font-bold',
								variant: 'intent',
								slot: 'base'
							}
						}
					]
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
					errors: [
						{
							messageId: 'shared',
							data: {
								token: 'rounded',
								variant: 'size',
								slot: 'root'
							}
						},
						{
							messageId: 'shared',
							data: {
								token: 'rounded',
								variant: 'size',
								slot: 'root'
							}
						}
					]
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
					errors: [
						{
							messageId: 'shared',
							data: {
								token: 'rounded',
								variant: 'size',
								slot: 'base'
							}
						},
						{
							messageId: 'shared',
							data: {
								token: 'rounded',
								variant: 'size',
								slot: 'base'
							}
						}
					]
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
					errors: [
						{
							messageId: 'shared',
							data: {
								token: 'highlight',
								variant: 'on',
								slot: 'base'
							}
						},
						{
							messageId: 'shared',
							data: {
								token: 'highlight',
								variant: 'on',
								slot: 'base'
							}
						}
					]
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
					errors: [
						{
							messageId: 'shared',
							data: {
								token: 'rounded',
								variant: 'size',
								slot: 'base'
							}
						},
						{
							messageId: 'shared',
							data: {
								token: 'rounded',
								variant: 'size',
								slot: 'base'
							}
						}
					]
				}
			]
		});
	}, 'rule tester passes');
	t.end();
});