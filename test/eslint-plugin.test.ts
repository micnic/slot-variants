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