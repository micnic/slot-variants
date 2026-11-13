import { IMPORT, IMPORT_CN, IMPORT_CREATE_SV, IMPORT_NS } from './helpers.ts';

export const NO_REDUNDANT_SPACES_VALID = [
	// A non-breaking space is no class separator — the browser reads one class.
	IMPORT_CN + "cn('p-2\u00a0p-4');",
	// Keys named like `Object.prototype` members are no config keys.
	IMPORT_CREATE_SV + "createSV({ toString: 'x', __defineGetter__: 'y' });",
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
	// A namespace member that isn't a tracked export stays untracked.
	"import * as mod from 'slot-variants'; mod.other({ base: ' flex  ' });",
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
	"import { sv, cn } from 'slot-variants'; sv('flex'); cn('items-center');",
	// A clsx-style record key is a class string — a clean key is fine.
	IMPORT_CN + "cn({ 'px-2 py-1': cond });",
	// An identifier record key can't contain whitespace.
	IMPORT_CN + 'cn({ flex: cond });',
	// A numeric record key is not a string — skipped.
	IMPORT_CN + 'cn({ 5: cond });',
	// A computed record key is dynamic — skipped.
	IMPORT_CN + 'cn({ [k]: cond });',
	// A spread in a clsx record is skipped; other keys are still checked.
	IMPORT_CN + "cn({ ...rest, 'px-2 py-1': cond });",
	// A clsx record as an sv() cn-style leading argument — key is checked.
	IMPORT + "sv({ 'px-2 py-1': isActive }, { base: 'flex' });",
	// Clean `&&` right operand.
	IMPORT_CN + "cn(isActive && 'flex items-center');",
	// Clean ternary branches.
	IMPORT_CN + "cn(isActive ? 'flex' : 'items-center');"
];

export const NO_REDUNDANT_SPACES_INVALID = [
	{
		// A hoisted value shared by several calls is reported once.
		code: IMPORT_CN + "const X = 'a  b';\ncn(X, 'c');\ncn(X, 'd');",
		output: IMPORT_CN + "const X = 'a b';\ncn(X, 'c');\ncn(X, 'd');",
		errors: 1
	},
	{
		// Inside a hoisted record too: collapsing the whitespace changes no
		// config's output, so the fix applies at the declaration.
		code:
			IMPORT +
			"const sizes = { sm: 'p-1  p-2' };\nsv({ variants: { size: sizes } });",
		output:
			IMPORT +
			"const sizes = { sm: 'p-1 p-2' };\nsv({ variants: { size: sizes } });",
		errors: 1
	},
	{
		// A namespace member call is analyzed like the named import.
		code: IMPORT_NS + "SV.sv({ base: ' flex  ' });",
		output: IMPORT_NS + "SV.sv({ base: 'flex' });",
		errors: 1
	},
	{
		// Collapsed, the text would hold the literal's own quote unescaped, so
		// it's reported without a fix.
		code: IMPORT + "sv({ base: 'a  \\'b' });",
		output: null,
		errors: 1
	},
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
	},
	{
		// Redundant whitespace inside a clsx-style record key (a class string).
		code: IMPORT_CN + "cn({ 'px-2  py-1': cond });",
		output: IMPORT_CN + "cn({ 'px-2 py-1': cond });",
		errors: 1
	},
	{
		// Redundant whitespace in a record key
		// nested inside a cn array argument.
		code: IMPORT_CN + "cn(['flex', { 'a  b': x }]);",
		output: IMPORT_CN + "cn(['flex', { 'a b': x }]);",
		errors: 1
	},
	{
		// Redundant whitespace in the `&&` right operand — the condition's
		// left side is a runtime check, not the class value.
		code: IMPORT_CN + "cn(isActive && 'flex  items-center');",
		output: IMPORT_CN + "cn(isActive && 'flex items-center');",
		errors: 1
	},
	{
		// Redundant whitespace in a ternary branch.
		code: IMPORT_CN + "cn(isActive ? 'flex  items-center' : 'block');",
		output: IMPORT_CN + "cn(isActive ? 'flex items-center' : 'block');",
		errors: 1
	},
	{
		// Redundant whitespace in both ternary
		// branches — one report per branch.
		code: IMPORT_CN + "cn(isActive ? 'flex  a' : 'block  b');",
		output: IMPORT_CN + "cn(isActive ? 'flex a' : 'block b');",
		errors: 2
	}
];