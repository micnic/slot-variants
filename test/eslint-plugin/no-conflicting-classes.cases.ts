import {
	IMPORT,
	IMPORT_CN,
	IMPORT_CREATE_SV,
	IMPORT_NS,
	conflict,
	conflictCn,
	dup,
	dupCn,
	duplicateGroupSlot,
	overlap,
	repeat
} from './helpers.ts';

export const NO_CONFLICTING_DUP_VALID = [
	IMPORT +
		"sv({ base: 'flex items-center', variants: { size: { sm: 'text-sm', lg: 'text-lg' } } });",
	IMPORT +
		"sv({ variants: { size: { sm: 'text-sm', lg: 'text-lg' }, intent: { primary: 'bg-blue-500', danger: 'bg-red-500' } } });",
	IMPORT + "sv('flex', 'items-center');",
	IMPORT + 'sv({});',
	// Same token across values of the same variant — mutually exclusive.
	IMPORT +
		"sv({ variants: { state: { on: 'highlight', off: 'highlight' } } });",
	// Same token in different slots of a compound class record — tokens are
	// attributed per slot, so they never collide.
	IMPORT +
		`sv({
			slots: { body: 'p-4', icon: 'shrink-0' },
			variants: { size: { sm: 'text-sm' } },
			compoundVariants: [
				{ size: 'sm', class: { body: 'font-bold', icon: 'font-bold' } }
			]
		});`,
	// Same token across a ternary's branches — only one branch renders.
	IMPORT_CN + "cn(isActive ? 'flex' : 'flex');",
	// Same token across compounds matching different values of one variant —
	// they can never co-occur.
	IMPORT +
		`sv({
			variants: { size: { sm: 'text-sm', lg: 'text-lg' } },
			compoundVariants: [
				{ size: 'sm', class: 'font-bold' },
				{ size: 'lg', class: 'font-bold' }
			]
		});`,
	// Same token across complementary conditionals — `cond` and `!cond` are
	// opposite branches of one condition.
	IMPORT_CN + "cn(isActive && 'flex', !isActive && 'flex');",
	IMPORT_CN + "cn(isActive ? 'flex' : '', isActive ? '' : 'flex');",
	// A clsx-style record value is its key's condition, like `&&`'s left side.
	IMPORT_CN + "cn({ flex: isActive }, !isActive && 'flex');",
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
	// Slot object under `true` — distinct from the slot's class.
	IMPORT +
		`sv({
			slots: { body: 'p-4' },
			variants: { disabled: { true: { body: 'opacity-50' } } }
		});`,
	// Values named like slots are mutually exclusive values.
	IMPORT +
		"sv({ slots: { top: 't', bottom: 'b' }, variants: { placement: { top: 'mt-1', bottom: 'mt-2' } } });",
	// Group lists without repeats, with a spread, and with a non-string entry.
	IMPORT + "sv({ slots: { a: 'x', b: 'y' }, groups: { g: ['a', 'b'] } });",
	IMPORT +
		"sv({ slots: { a: 'x', b: 'y' }, groups: { g: [...rest, 'a', 'b'] } });",
	IMPORT +
		"sv({ slots: { a: 'x', b: 'y' }, groups: { g: [slot, 'a', 'b'] } });",
	// A group list that isn't an array literal can't be read.
	IMPORT + "sv({ slots: { a: 'x' }, groups: { g: dynamicSlots } });",
	// Groups that share no slot with the object's other keys.
	IMPORT +
		"sv({ slots: { header: 'font-bold', body: 'text-sm' }, groups: { top: ['header'] }, variants: { size: { lg: { top: 'mt-1', body: 'mt-2' } } } });",
	// A spread or computed key hides which slots the object reaches.
	IMPORT +
		"sv({ slots: { header: 'font-bold' }, groups: { top: ['header'] }, variants: { size: { lg: { ...extra, header: 'mt-1', top: 'mt-2' } } } });",
	IMPORT +
		"sv({ slots: { header: 'font-bold' }, groups: { top: ['header'] }, variants: { size: { lg: { [k]: 'mt-1', top: 'mt-2' } } } });",
	// Call sites: no class prop, a string class prop, and a multi-slot slot
	// function, whose class prop applies to that one slot.
	IMPORT +
		"const card = sv({ slots: { header: 'font-bold' }, groups: { top: ['header'] }, variants: { size: { lg: 'x' } } });\ncard({ size: 'lg' });",
	IMPORT +
		"const card = sv({ slots: { header: 'font-bold' }, groups: { top: ['header'] } });\ncard({ class: 'mt-1' });",
	IMPORT +
		"const card = sv({ slots: { header: 'font-bold' }, groups: { top: ['header'] }, multiSlots: ['header'] });\ncard().header({ class: { header: 'mt-1', top: 'mt-2' } });",
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

export const NO_CONFLICTING_DUP_INVALID = [
	{
		// A slot listed twice in a group gets the group's classes twice; the
		// repeat is removed. A group repeating a slot isn't also reported as
		// overlapping itself.
		code:
			IMPORT +
			"sv({ slots: { a: 'x', b: 'y' }, groups: { g: ['a', 'a', 'b'] }, variants: { s: { on: { g: 'mt-1' } } } });",
		output:
			IMPORT +
			"sv({ slots: { a: 'x', b: 'y' }, groups: { g: ['a', 'b'] }, variants: { s: { on: { g: 'mt-1' } } } });",
		errors: [duplicateGroupSlot('g', 'a')]
	},
	{
		// Each repeat is reported, whichever slot it names. The two removals
		// touch the same comma, so one pass applies the first; `--fix` takes
		// the other on its next pass.
		code:
			IMPORT +
			"sv({ slots: { a: 'x', b: 'y' }, groups: { g: ['a', 'b', 'a', 'b'] } });",
		output:
			IMPORT +
			"sv({ slots: { a: 'x', b: 'y' }, groups: { g: ['a', 'b', 'b'] } });",
		errors: [duplicateGroupSlot('g', 'a'), duplicateGroupSlot('g', 'b')]
	},
	{
		// A list shared through a `const` is reported, but not edited where it
		// is declared.
		code:
			IMPORT +
			"const pair = ['a', 'a'];\nsv({ slots: { a: 'x' }, groups: { g: pair } });",
		output: null,
		errors: [duplicateGroupSlot('g', 'a')]
	},
	{
		// Both values reach `header`; the group's own conflict is still
		// reported once, on the group.
		code:
			IMPORT +
			"sv({ slots: { header: 'font-bold' }, groups: { top: ['header'] }, variants: { size: { lg: { header: 'mt-1', top: 'px-2 px-4' } } } });",
		errors: [
			overlap('top', 'header', 'header'),
			...repeat(conflict('px-2, px-4', 'top'), 2)
		]
	},
	{
		// A group key reaches a slot the same variant value sets directly.
		code:
			IMPORT +
			"sv({ slots: { header: 'font-bold', body: 'text-sm' }, groups: { content: ['header', 'body'] }, variants: { size: { lg: { header: 'px-6', content: 'mt-2' } } } });",
		errors: [overlap('content', 'header', 'header')]
	},
	{
		// Two groups share a slot in a compound class object.
		code:
			IMPORT +
			"sv({ slots: { header: 'font-bold', body: 'text-sm' }, groups: { content: ['header', 'body'], top: ['header'] }, variants: { size: { sm: 'a', lg: 'b' } }, compoundVariants: [{ size: 'lg', class: { content: 'mt-1', top: 'italic' } }] });",
		errors: [overlap('top', 'header', 'content')]
	},
	{
		// A slot object under a `true` key.
		code:
			IMPORT +
			"sv({ slots: { header: 'font-bold' }, groups: { all: ['base', 'header'] }, variants: { hl: { true: { base: 'ring', all: 'italic' } } } });",
		errors: [overlap('all', 'base', 'base')]
	},
	{
		// A static `class` prop at a call of the variant function.
		code:
			IMPORT +
			"const card = sv({ slots: { header: 'font-bold', body: 'text-sm' }, groups: { content: ['header', 'body'] } });\ncard({ class: { header: 'mt-1', content: 'mt-2' } });",
		errors: [overlap('content', 'header', 'header')]
	},
	{
		// A separator written as an escape yields two tokens, so the repeat is
		// visible as a duplicate. Neither token's own position is known inside
		// an escaped literal, so both are reported at the whole literal — as
		// one report, the same for both.
		code: IMPORT_CN + "cn('flex\\u0020flex');",
		errors: [dupCn('flex')]
	},
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
		// A hoisted `const` config is read through and analyzed as a config.
		code: IMPORT + "const config = { base: 'flex flex' };\nsv(config);",
		errors: 2
	},
	{
		// Duplicate inside a slot-keyed compoundVariants class record — the
		// tokens land on the record's slot.
		code:
			IMPORT +
			`sv({
				slots: { body: 'p-4' },
				variants: { size: { sm: 'text-sm' } },
				compoundVariants: [{ size: 'sm', class: { body: 'flex flex' } }]
			});`,
		errors: repeat(dup('flex', 'body'), 2)
	},
	{
		// A `const` alias of the sv import is tracked through to the config.
		code: IMPORT + "const styled = sv;\nstyled({ base: 'flex flex' });",
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
		// Duplicate across same-branch conditionals — both render together
		// whenever the shared condition is truthy.
		code: IMPORT_CN + "cn(isActive && 'flex', isActive && 'flex');",
		errors: repeat(dupCn('flex'), 2)
	},
	{
		// Duplicate across compounds matching the same variant value — both
		// apply together.
		code:
			IMPORT +
			`sv({
				variants: { size: { sm: 'text-sm' }, tone: { red: 'text-red-500' } },
				compoundVariants: [
					{ size: 'sm', class: 'font-bold' },
					{ size: 'sm', tone: 'red', class: 'font-bold' }
				]
			});`,
		errors: repeat(dup('font-bold'), 2)
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
		// A `true` slot object duplicates the slot's base class.
		code:
			IMPORT +
			`sv({
				slots: { body: 'flex' },
				variants: { disabled: { true: { body: 'flex' } } }
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
	},
	{
		// A `createSV()`-derived binding's config is analyzed like sv.
		code:
			IMPORT_CREATE_SV +
			"const customSV = createSV({ cacheSize: 512 });\nconst c = customSV({ base: 'flex flex' });",
		errors: repeat(dup('flex'), 2)
	},
	{
		// A `preset` matcher names variant values rather than being one, so it
		// proves no exclusivity — `cta` and `big` both match `size: 'lg'` with
		// `intent: 'primary'`, so the shared token really does duplicate.
		code:
			IMPORT +
			`sv({
				variants: {
					size: { sm: 'text-sm', lg: 'text-lg' },
					intent: { primary: 'lowercase', danger: 'uppercase' }
				},
				presets: {
					cta: { size: 'lg' },
					big: { size: 'lg', intent: 'primary' }
				},
				compoundVariants: [
					{ preset: 'cta', class: 'font-bold' },
					{ preset: 'big', class: 'font-bold' }
				]
			});`,
		errors: repeat(dup('font-bold'), 2)
	}
];

export const NO_CONFLICTING_NS_VALID = [
	// Variants that pick another element keep their place in the stack:
	// `hover:*:` styles children of a hovered element, `*:hover:` hovered
	// children, so the two never target the same element.
	IMPORT_CN + "cn('hover:*:p-2', '*:hover:p-4');",
	IMPORT_CN + "cn('hover:before:p-2', 'before:hover:p-4');",
	// The same for any arbitrary variant.
	IMPORT_CN + "cn('[&>p]:hover:p-2', 'hover:[&>p]:p-4');",
	// Joined by a non-breaking space, `p-2` and `p-4` are one class.
	IMPORT_CN + "cn('p-2\u00a0p-4');",
	// Class prefixes named like `Object.prototype` members are no known
	// Tailwind families.
	IMPORT +
		"sv({ base: '__defineGetter__-2 toString constructor-4 hasOwnProperty' });",
	// Project class names share a prefix but name no Tailwind utility, so
	// nothing says they set the same property.
	IMPORT_CN + "cn('btn-primary btn-lg');",
	// A group's classes don't reach a slot outside it.
	IMPORT +
		"sv({ slots: { icon: 'w-4', label: 'text-sm' }, groups: { controls: ['label'] }, variants: { size: { sm: { controls: 'w-2' } } } });",
	// An untyped CSS variable on a shadow utility is the shadow itself, and on
	// `font` a weight — neither collides with a color or a family.
	IMPORT_CN + "cn('shadow-(--x) shadow-red-500');",
	IMPORT_CN + "cn('inset-shadow-(--x) inset-shadow-red-500');",
	IMPORT_CN + "cn('text-shadow-(--x) text-shadow-red-500');",
	IMPORT_CN + "cn('drop-shadow-(--x) drop-shadow-red-500');",
	IMPORT_CN + "cn('font-(--x) font-sans');",
	// Record keys under complementary conditions never apply together, in a
	// record or against a `&&`.
	IMPORT_CN + "cn({ 'w-2': active, 'w-4': !active });",
	IMPORT_CN + "cn(active && 'w-2', { 'w-4': !active });",
	IMPORT + "sv({ base: 'card-body card-title card-header-actions' });",
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
	// cn() with a dynamic arg — no static entries,
	// exercises the empty-tokenMap branch.
	IMPORT_CN + 'cn(dynamic);',
	// Different namespace prefixes don't conflict.
	IMPORT + "sv({ base: 'w-100 h-200' });",
	// A font size and a text color target different properties, so they don't
	// conflict — even when the color is a single-word keyword.
	IMPORT + "sv({ base: 'text-sm text-red-500' });",
	IMPORT + "sv({ base: 'text-lg text-white' });",
	// A single-word color keyword with an opacity modifier still resolves to
	// `color`, not `size` — the modifier doesn't shadow the keyword match.
	IMPORT + "sv({ base: 'text-lg text-white/50' });",
	// A one-word theme color (`--color-primary`) is a color, not a font size —
	// only Tailwind's named sizes (`xs`…`9xl`) read as sizes, the same way
	// tailwind-merge tells them apart.
	IMPORT + "sv({ base: 'text-sm text-primary' });",
	IMPORT + "sv({ base: 'text-base text-foreground/80' });",
	IMPORT + "sv({ base: 'text-2xl text-destructive' });",
	// The same goes for every prefix that is
	// both a width (or size) and a color.
	IMPORT + "sv({ base: 'border-2 border-primary' });",
	IMPORT + "sv({ base: 'border-t-2 border-t-primary' });",
	IMPORT + "sv({ base: 'ring-2 ring-primary' });",
	IMPORT + "sv({ base: 'ring-offset-2 ring-offset-background' });",
	IMPORT + "sv({ base: 'inset-ring-2 inset-ring-primary' });",
	IMPORT + "sv({ base: 'outline-2 outline-primary' });",
	IMPORT + "sv({ base: 'stroke-2 stroke-primary' });",
	IMPORT + "sv({ base: 'decoration-2 decoration-primary' });",
	IMPORT + "sv({ base: 'shadow-md shadow-primary' });",
	IMPORT + "sv({ base: 'text-shadow-sm text-shadow-primary' });",
	IMPORT + "sv({ base: 'inset-shadow-xs inset-shadow-primary' });",
	// A plain font size reads its line-height through `--tw-leading`, which a
	// `leading-*` utility sets, so the two compose rather than conflict.
	IMPORT + "sv({ base: 'text-sm leading-6' });",
	// A font size and text alignment don't conflict.
	IMPORT + "sv({ base: 'text-sm text-center' });",
	// Border width, style, and color are distinct properties.
	IMPORT + "sv({ base: 'border-2 border-solid border-red-500' });",
	// A bare default utility stays clear of siblings on other properties:
	// `border` is a width, distinct from a border color or style.
	IMPORT + "sv({ base: 'border border-red-500 border-solid' });",
	// Bare `rounded` (border-radius) is unrelated to a shadow.
	IMPORT + "sv({ base: 'rounded shadow-md' });",
	// Bare `outline` is a width, distinct from an outline style or color.
	IMPORT + "sv({ base: 'outline outline-dashed outline-red-500' });",
	// Bare `transition` groups only with its own family, not the separate
	// transition-duration utility.
	IMPORT + "sv({ base: 'transition duration-100' });",
	// Distinct filter functions compose, so bare toggles don't cross-conflict.
	IMPORT + "sv({ base: 'grayscale invert sepia' });",
	// `w-*` and `h-*` are independent axes — they only conflict through a
	// co-occurring `size-*` shorthand, never with each other.
	IMPORT + "sv({ base: 'w-4 h-4' });",
	// `min-w`/`max-w` are their own segments, so `size-*` doesn't overlap them.
	IMPORT + "sv({ base: 'min-w-0 size-4' });",
	// The shorthand overlap is scoped per variant prefix.
	IMPORT_CN + "cn('hover:w-4', 'size-4');",
	IMPORT_CN + "cn('hover:m-4', 'mt-2');",
	// Spacing sides and axes are independent without their shorthand present.
	IMPORT + "sv({ base: 'mt-2 mr-2 mb-2 ml-2' });",
	IMPORT + "sv({ base: 'mx-2 my-2' });",
	IMPORT + "sv({ base: 'px-4 pt-2' });",
	// Logical spacing sides are leaves — they only merge through the bare form.
	IMPORT + "sv({ base: 'px-4 ps-2' });",
	// `inset-x` covers left/right only, not top.
	IMPORT + "sv({ base: 'inset-x-0 top-0' });",
	// `translate-z` has its own overlap node, but it's only reachable through
	// `translate-none` — a plain axis value doesn't reach it.
	IMPORT + "sv({ base: 'translate-x-2 translate-z-10' });",
	// The bare `translate` shorthand doesn't reach `z` either — only
	// `translate-none` does (it resets every axis).
	IMPORT + "sv({ base: 'translate-4 translate-z-10' });",
	// Unlike `translate`, `scale` has no `-none` bridge, so its `z` axis
	// never overlaps the bare shorthand.
	IMPORT + "sv({ base: 'scale-105 scale-z-10' });",
	// Unlike `gap`/`overflow`/`overscroll`/`translate`, tailwind-merge doesn't
	// treat bare `scale`/`skew` as conflicting with their `-x`/`-y` forms —
	// they compose as independent per-axis overrides.
	IMPORT + "sv({ base: 'scale-105 scale-x-110' });",
	IMPORT + "sv({ base: 'skew-3 skew-x-6' });",
	// Corner sides and sibling corners don't overlap without their shorthand.
	IMPORT + "sv({ base: 'rounded-t-lg rounded-b-sm' });",
	IMPORT + "sv({ base: 'rounded-tl-lg rounded-tr-sm' });",
	// `border-x` covers left/right widths only, not the top width.
	IMPORT + "sv({ base: 'border-x-2 border-t-4' });",
	// A border width doesn't overlap a per-side border color.
	IMPORT + "sv({ base: 'border-2 border-t-red-500' });",
	// Logical block sides are leaves — they only merge through the bare form.
	IMPORT + "sv({ base: 'border-bs-2 border-t-4' });",
	IMPORT + "sv({ base: 'mbs-2 mt-2' });",
	// `inset-x` still covers left/right only, not the logical block sides.
	IMPORT + "sv({ base: 'inset-x-0 inset-bs-4' });",
	// Per-side border width vs color are distinct sub-properties — including
	// the single-word color keywords.
	IMPORT + "sv({ base: 'border-t-2 border-t-red-500' });",
	IMPORT + "sv({ base: 'border-t-2 border-t-current' });",
	// scroll-behavior is unrelated to the scroll-margin family.
	IMPORT + "sv({ base: 'scroll-smooth scroll-mt-4' });",
	// A shorthand overlap across mutually-exclusive variant values is fine.
	IMPORT + "sv({ variants: { pad: { sm: 'p-2', lg: 'pt-8' } } });",
	// Two siblings from the same variant value (`px-4`/`pb-4`) both bridge
	// through `p`, which a different, mutually-exclusive value sets alone —
	// the siblings must not be compared against each other just because they
	// share a bridge with a branch neither of them can ever render alongside.
	IMPORT + "sv({ variants: { inset: { edge: 'px-4 pb-4', full: 'p-4' } } });",
	// Compounds matching different values of one variant can never co-occur.
	IMPORT +
		`sv({
			variants: { size: { sm: 'text-sm', lg: 'text-lg' } },
			compoundVariants: [
				{ size: 'sm', class: 'p-2' },
				{ size: 'lg', class: 'p-4' }
			]
		});`,
	// A compound is exclusive with a value of a variant it matches differently.
	IMPORT +
		`sv({
			variants: { size: { sm: 'p-2', lg: 'font-bold' } },
			compoundVariants: [{ size: 'lg', class: 'p-4' }]
		});`,
	// An array compound matcher reads as a value set: two compounds are
	// exclusive when their sets for a shared key share no value. `"link"` is
	// never one of the first compound's `variant` values, so neither the
	// same-key `h-28`/`h-auto` pair nor the `p`-covers `p-sm`/`px-none` pair
	// can ever co-occur.
	IMPORT +
		`sv({
			compoundVariants: [
				{
					variant: ['primary', 'secondary', 'tertiary', 'ghost'],
					size: 'sm',
					class: 'h-28 p-sm'
				},
				{ variant: 'link', class: 'h-auto px-none py-none' }
			]
		});`,
	// Boolean and numeric matchers align with variant value keys.
	IMPORT +
		`sv({
			variants: { disabled: 'opacity-50' },
			compoundVariants: [{ disabled: false, class: 'opacity-100' }]
		});`,
	IMPORT +
		`sv({
			variants: { cols: { 1: 'w-4', 2: 'w-8' } },
			compoundVariants: [
				{ cols: 1, class: 'gap-2' },
				{ cols: 2, class: 'gap-4' }
			]
		});`,
	// Multi-matcher compounds only need to disagree on one shared key.
	IMPORT +
		`sv({
			variants: { size: { sm: '' }, tone: { red: '', blue: '' } },
			compoundVariants: [
				{ size: 'sm', tone: 'red', class: 'p-2' },
				{ size: 'sm', tone: 'blue', class: 'p-4' }
			]
		});`,
	// compoundSlots matchers get the same exclusivity treatment, per slot.
	IMPORT +
		`sv({
			slots: { icon: 'shrink-0' },
			compoundSlots: [
				{ slots: ['icon'], size: 'sm', class: 'w-2' },
				{ slots: ['icon'], size: 'lg', class: 'w-4' }
			]
		});`,
	// Complementary conditionals — `cond` and `!cond` are opposite branches of
	// one condition, whether spelled as ternaries or logical-ANDs.
	IMPORT_CN + "cn(active ? 'p-2' : 'm-2', !active ? 'p-4' : 'm-4');",
	IMPORT_CN + "cn(active && 'p-2', !active && 'p-4');",
	// Opposite branches of the same condition across two ternaries.
	IMPORT_CN + "cn(active ? 'p-2' : '', active ? '' : 'p-4');",
	// Nested conditionals accumulate their outer condition, so the inner
	// branches stay exclusive to each other.
	IMPORT_CN + "cn(active && (dense ? 'p-2' : 'p-4'));",
	// A custom-palette color still classifies as a color (no palette needed).
	IMPORT + "sv({ base: 'text-brand-500 text-sm' });",
	// An arbitrary color value classifies as a color, not a size.
	IMPORT + "sv({ base: 'text-[#fff] text-sm' });",
	// So does a CSS named color, in any letter case, against a font size,
	// a border width, and a stroke width.
	IMPORT + "sv({ base: 'text-[red] text-sm' });",
	IMPORT + "sv({ base: 'text-[RebeccaPurple] text-[14px]' });",
	IMPORT + "sv({ base: 'text-[currentcolor] text-sm' });",
	IMPORT + "sv({ base: 'text-[red]/50 text-sm' });",
	IMPORT + "sv({ base: 'border-[2px] border-[red]' });",
	IMPORT + "sv({ base: 'stroke-[2px] stroke-[red]' });",
	// An arbitrary length value stays a size, distinct from a color.
	IMPORT + "sv({ base: 'text-[16px] text-red-500' });",
	// A typed CSS-variable shorthand classifies by its hint, so a color one is
	// distinct from a font size.
	IMPORT + "sv({ base: 'text-(color:--brand) text-sm' });",
	// An untyped CSS-variable shorthand is the prefix's widest value type — a
	// color here, so it doesn't touch the font size either.
	IMPORT + "sv({ base: 'text-(--brand) text-sm' });",
	// `decoration-(--x)` is the narrower thickness property, not a color.
	IMPORT + "sv({ base: 'decoration-(--thin) decoration-red-500' });",
	// v3's `decoration-clone` is box-decoration-break, not a thickness.
	IMPORT + "sv({ base: 'decoration-clone decoration-2' });",
	// `list-item` is a display value, not a list-style-type.
	IMPORT + "sv({ base: 'list-item list-disc' });",
	// A length hint is a border width, distinct from the border color.
	IMPORT + "sv({ base: 'border-(length:--hairline) border-red-500' });",
	// A number hint is a font weight, distinct from the family.
	IMPORT + "sv({ base: 'font-(number:--bold) font-sans' });",
	// An unhinted bracketed number is a weight too, so it stays clear of the
	// family — while a bracketed family name is not.
	IMPORT + "sv({ base: 'font-[550] font-sans' });",
	IMPORT + "sv({ base: 'font-[Arial] font-bold' });",
	// A position hint is background-position, distinct from the color.
	IMPORT + "sv({ base: 'bg-(position:--spot) bg-red-500' });",
	// The explicit `bg-size-*`/`bg-position-*` namespaces are two distinct
	// properties, and neither is the background color.
	IMPORT + "sv({ base: 'bg-size-[3px_4px] bg-position-[center_top]' });",
	IMPORT + "sv({ base: 'bg-position-[center_top] bg-red-500' });",
	// An object-position value doesn't touch the keyword-only object-fit.
	IMPORT + "sv({ base: 'object-[center_top] object-cover' });",
	// Same for their mask counterparts, which also don't touch the mask image.
	IMPORT + "sv({ base: 'mask-size-[3px] mask-position-[top]' });",
	IMPORT + "sv({ base: 'mask-position-[top] mask-[url(/a.svg)]' });",
	// Ring offset width vs ring offset color are distinct sub-properties.
	IMPORT + "sv({ base: 'ring-offset-2 ring-offset-red-500' });",
	// Ring width vs ring offset width are distinct properties.
	IMPORT + "sv({ base: 'ring-2 ring-offset-2' });",
	// A text-shadow color doesn't conflict with the unrelated text color.
	IMPORT + "sv({ base: 'text-shadow-red-500 text-blue-500' });",
	// A text-shadow size doesn't conflict with the unrelated font size.
	IMPORT + "sv({ base: 'text-shadow-sm text-lg' });",
	// An inset-shadow doesn't conflict with a physical inset offset.
	IMPORT + "sv({ base: 'inset-shadow-sm inset-4' });",
	// An inset-ring doesn't conflict with a physical inset offset.
	IMPORT + "sv({ base: 'inset-ring-2 inset-4' });",
	// Inset-ring width vs inset-ring color are distinct sub-properties.
	IMPORT + "sv({ base: 'inset-ring-2 inset-ring-red-500' });",
	// mask-composite and mask-mode are distinct properties.
	IMPORT + "sv({ base: 'mask-add mask-luminance' });",
	// mask-position and mask-size are distinct properties.
	IMPORT + "sv({ base: 'mask-center mask-cover' });",
	// mask-clip and mask-origin are distinct properties.
	IMPORT + "sv({ base: 'mask-clip-border mask-origin-padding' });",
	// mask-clip and mask-type are distinct properties.
	IMPORT + "sv({ base: 'mask-clip-border mask-type-alpha' });",
	// A directional mask gradient's position and color stops compose.
	IMPORT + "sv({ base: 'mask-t-from-30% mask-t-from-red-500' });",
	// Different mask gradient directions are distinct properties.
	IMPORT + "sv({ base: 'mask-t-from-red-500 mask-r-from-blue-500' });",
	// mask-linear and mask-conic angles are distinct properties.
	IMPORT + "sv({ base: 'mask-linear-45 mask-conic-90' });",
	// mask-radial shape, size, and position are distinct sub-properties.
	IMPORT +
		"sv({ base: 'mask-radial-circle mask-radial-closest-side mask-radial-at-center' });",
	// mask-no-clip and mask-no-repeat are the boolean-off form of distinct
	// properties, so they don't conflict with each other — even though each one
	// does conflict with its own positive counterpart.
	IMPORT + "sv({ base: 'mask-no-clip mask-no-repeat' });",
	// scrollbar-thumb and scrollbar-track colors are distinct properties.
	IMPORT +
		"sv({ base: 'scrollbar-thumb-red-500 scrollbar-track-blue-500' });",
	// scrollbar-thumb color and the bare scrollbar width are distinct.
	IMPORT + "sv({ base: 'scrollbar-thumb-red-500 scrollbar-thin' });",
	// scrollbar-gutter and the bare scrollbar width are distinct.
	IMPORT + "sv({ base: 'scrollbar-gutter-stable scrollbar-thin' });",
	// touch-action pan directions compose, so they don't conflict.
	IMPORT + "sv({ base: 'touch-pan-x touch-pan-y' });",
	// Pan and pinch-zoom also compose.
	IMPORT + "sv({ base: 'touch-pan-x touch-pinch-zoom' });",
	// `touch-pan-left` shares the `x` axis with `touch-pan-x`, but the `y`
	// axis (`touch-pan-up`) is independent of it.
	IMPORT + "sv({ base: 'touch-pan-left touch-pan-up' });",
	// An unrecognized pan direction has no overlap node at all, so it stays
	// untracked even alongside a bare touch-action toggle.
	IMPORT + "sv({ base: 'touch-none touch-pan-diagonal' });",
	// A composing `-reverse` flag sits alongside the width, so it doesn't
	// conflict with it.
	IMPORT + "sv({ base: 'space-x-2 space-x-reverse' });",
	IMPORT + "sv({ base: 'divide-x-2 divide-x-reverse' });",
	// A gradient color stop and its position
	// are distinct, composing properties.
	IMPORT + "sv({ base: 'from-10% from-red-500' });",
	// background-blend-mode is distinct from background-color.
	IMPORT + "sv({ base: 'bg-blend-multiply bg-red-500' });",
	// grid-auto-columns vs grid-auto-rows are independent.
	IMPORT + "sv({ base: 'auto-cols-max auto-rows-min' });",
	// Placeholder opacity composes with the placeholder color.
	IMPORT + "sv({ base: 'placeholder-opacity-50 placeholder-red-500' });",
	// border-spacing x and y compose into the single border-spacing property.
	IMPORT + "sv({ base: 'border-spacing-x-2 border-spacing-y-4' });",
	// table-layout vs a table display value are distinct properties.
	IMPORT + "sv({ base: 'table-auto table-cell' });",
	// v3 opacity utilities compose with their color rather than conflict.
	IMPORT + "sv({ base: 'bg-opacity-50 bg-red-500' });",
	IMPORT + "sv({ base: 'ring-opacity-50 ring-red-500' });",
	IMPORT + "sv({ base: 'divide-opacity-50 divide-red-500' });",
	// Background color vs background size/position.
	IMPORT + "sv({ base: 'bg-white bg-cover bg-center' });",
	// Arbitrary image values are a background-image, not a color — including
	// when the value contains colons or dashes inside the brackets.
	IMPORT + "sv({ base: 'bg-[url(data:image/png;base64,abc)] bg-red-500' });",
	IMPORT +
		"sv({ base: 'bg-[linear-gradient(to_right,red,blue)] bg-white' });",
	IMPORT + "sv({ base: 'bg-[image:var(--hero)] bg-red-500' });",
	// A dashed arbitrary value is one segment, so a hinted `text-[length:…]`
	// stays in the short (font-size) bucket instead of misreading as a color.
	IMPORT + "sv({ base: 'text-[length:var(--x-y)] text-red-500' });",
	// Different stacked-variant sets don't conflict in any order.
	IMPORT_CN + "cn('sm:hover:w-4', 'sm:focus:w-8');",
	// grow/shrink/basis are independent without a `flex-*` sizing shorthand.
	IMPORT + "sv({ base: 'grow-0 shrink-0 basis-auto' });",
	// The v3 `flex-*` spellings of the same three are just as independent.
	IMPORT + "sv({ base: 'flex-grow-0 flex-shrink-0 flex-basis-auto' });",
	// A v3 sizing longhand doesn't touch the direction or wrap properties.
	IMPORT + "sv({ base: 'flex-grow-0 flex-row flex-wrap' });",
	// Flex direction and wrap don't take part in the sizing overlap.
	IMPORT + "sv({ base: 'flex-row flex-1 flex-wrap' });",
	// `truncate` is unrelated to a font size, and overflow/white-space don't
	// reach each other without the `truncate` bridge.
	IMPORT + "sv({ base: 'truncate text-sm' });",
	IMPORT + "sv({ base: 'overflow-visible whitespace-normal' });",
	// The truncate overlap is scoped per variant prefix.
	IMPORT_CN + "cn('hover:truncate', 'overflow-visible');",
	// `line-through` shares the `line` first segment with `line-clamp-*` but
	// is an unrelated single-word utility — no bridge between them.
	IMPORT + "sv({ base: 'line-clamp-3 line-through' });",
	// Container queries are unrelated to other utilities without their own
	// bridge (`line-clamp` doesn't reach `@container`).
	IMPORT + "sv({ base: '@container flex' });",
	// The container overlap is scoped per variant prefix too.
	IMPORT_CN + "cn('@container', 'hover:@container-normal');",
	// Font-variant-numeric styles from different (non-`normal`) categories
	// compose — only `normal-nums` conflicts with every other value.
	IMPORT + "sv({ base: 'lining-nums tabular-nums diagonal-fractions' });",
	// `normal-nums` keeps a conflict key of its own rather than joining a
	// `normal-*` dash family, so it stays clear of the unrelated `normal-case`.
	IMPORT + "sv({ base: 'normal-nums normal-case' });",
	// Two display keywords from different dash families are still opt-in only,
	// even though both now take part in the `line-clamp` overlap.
	IMPORT + "sv({ base: 'table-cell inline-block' });",
	// Axis utilities on independent axes don't conflict.
	IMPORT + "sv({ base: 'gap-x-4 gap-y-2' });",
	// Grid columns vs rows.
	IMPORT + "sv({ base: 'grid-cols-3 grid-rows-2' });",
	// Flex direction vs wrap.
	IMPORT + "sv({ base: 'flex-col flex-wrap' });",
	// Font family vs weight.
	IMPORT + "sv({ base: 'font-sans font-bold' });",
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
	IMPORT + 'sv();',
	// A drop-shadow size and a drop-shadow color are distinct sub-properties.
	IMPORT + "sv({ base: 'drop-shadow-sm drop-shadow-red-500' });",
	// The bare drop-shadow preset is itself a size, distinct from the color.
	IMPORT + "sv({ base: 'drop-shadow drop-shadow-red-500' });",
	// A transform rendering hint and transform-style are distinct properties.
	IMPORT + "sv({ base: 'transform-gpu transform-3d' });",
	IMPORT + "sv({ base: 'transform-none transform-flat' });",
	// scale-3d enables 3D scaling and is independent of the scale factor.
	IMPORT + "sv({ base: 'scale-150 scale-3d' });",
	IMPORT + "sv({ base: 'scale-x-50 scale-3d' });",
	// color-scheme is unrelated to background color.
	IMPORT + "sv({ base: 'scheme-dark bg-red-500' });",
	// A bare perspective value and perspective-origin are distinct properties.
	IMPORT + "sv({ base: 'perspective-near perspective-origin-center' });",
	// font-features is distinct from font-stretch and font-family.
	IMPORT +
		"sv({ base: 'font-features-[10px] font-stretch-condensed font-sans' });",
	// mix-blend-mode is unrelated to an explicit background color.
	IMPORT + "sv({ base: 'mix-blend-multiply bg-red-500' });",
	// break-before/after/inside are distinct from the word-break values.
	IMPORT + "sv({ base: 'break-words break-before-column' });",
	// A stroke color and stroke width are distinct sub-properties.
	IMPORT + "sv({ base: 'stroke-2 stroke-red-500' });",
	// stroke-none is a color value (not a width), so it doesn't falsely
	// conflict with an actual stroke width.
	IMPORT + "sv({ base: 'stroke-none stroke-2' });",
	// font-stretch is a distinct sub-property from both weight and family.
	IMPORT + "sv({ base: 'font-stretch-condensed font-bold font-sans' });",
	// align-items and align-self are distinct properties.
	IMPORT + "sv({ base: 'items-center self-end' });",
	// An inline-size value doesn't conflict with the unrelated inline-flex
	// display keyword, even though both share the `inline` first segment.
	IMPORT + "sv({ base: 'inline-flex inline-4' });",
	IMPORT + "sv({ base: 'inline-block inline-full' });",
	// min-inline-size and min-block-size are distinct properties.
	IMPORT + "sv({ base: 'min-inline-full min-block-full' });",
	// transition-property and transition-behavior are distinct properties.
	IMPORT + "sv({ base: 'transition-colors transition-discrete' });",
	IMPORT + "sv({ base: 'transition transition-normal' });",
	// overflow-wrap and word-break are distinct properties.
	IMPORT + "sv({ base: 'wrap-anywhere break-words' });",
	// col-start/col-end are distinct from the col-span/auto/bare-integer group.
	IMPORT + "sv({ base: 'col-start-2 col-span-3' });",
	IMPORT + "sv({ base: 'col-start-2 col-end-4' });",
	IMPORT + "sv({ base: 'row-start-2 row-span-3' });",
	// A whole-module namespace import reaches the same exports, so an untracked
	// member of it is left alone.
	IMPORT_NS + "SV.other({ base: 'w-1 w-2' });",
	// A computed member can't be read statically.
	IMPORT_NS + "SV['sv']({ base: 'w-1 w-2' });",
	// Nor can a nested member path be a namespace binding.
	IMPORT_NS + "a.b.sv({ base: 'w-1 w-2' });",
	// A private-name member is not an export either.
	IMPORT_NS + "class A { #sv; m() { return SV.#sv({ base: 'w-1 w-2' }); } }",
	// A local binding shadowing the namespace isn't the import.
	IMPORT_NS + "function f(SV) { return SV.sv({ base: 'w-1 w-2' }); }",
	// A namespace of some other module is unrelated.
	"import * as X from 'other';\nX.sv({ base: 'w-1 w-2' });",
	{
		// A Tailwind v3 `prefix` is stripped, so two different properties stop
		// looking like one `tw` namespace with a matching dash count.
		code: IMPORT + "sv({ base: 'tw-w-4 tw-h-4 tw-p-2 tw-text-sm' });",
		options: [{ prefix: 'tw-' }]
	},
	{
		// With a prefix configured, an unprefixed token is one
		// of the project's own class names, not a utility.
		code: IMPORT + "sv({ base: 'card-body card-header' });",
		options: [{ prefix: 'tw-' }]
	}
];

export const NO_CONFLICTING_NS_INVALID = [
	{
		// Only tokens that differ are checked for co-occurring: `p-4` never
		// renders with either `p-2`, which repeat each other — reported as a
		// duplicate alone.
		code:
			IMPORT +
			"sv({ variants: { size: { sm: 'p-2', md: 'p-4' }, color: { red: 'a', blue: 'b' } }, compoundVariants: [{ size: 'sm', color: 'red', class: 'p-2' }] });",
		errors: repeat(dup('p-2'), 2)
	},
	{
		// The same in a cn() call.
		code: IMPORT_CN + "cn(c ? 'p-2' : 'p-4', c && 'p-2');",
		errors: repeat(dupCn('p-2'), 2)
	},
	{
		// A base token still conflicts with every other token it renders with.
		code:
			IMPORT +
			"sv({ base: 'p-2', variants: { size: { sm: 'p-2', md: 'p-4' } } });",
		errors: [
			dup('p-2'),
			conflict('p-2, p-4'),
			dup('p-2'),
			conflict('p-2, p-4'),
			conflict('p-2, p-4')
		]
	},
	{
		// Classes written for a group land on each of its member slots.
		code:
			IMPORT +
			"sv({ slots: { icon: 'w-4', label: 'text-sm' }, groups: { controls: ['icon', 'label'] }, variants: { size: { sm: { controls: 'w-2' } } } });",
		errors: repeat(conflict('w-2, w-4', 'icon'), 2)
	},
	{
		// The same through a `compoundSlots` entry naming the group.
		code:
			IMPORT +
			"sv({ slots: { icon: 'w-4', label: 'p-1' }, groups: { controls: ['icon', 'label'] }, variants: { size: { sm: '', lg: '' } }, compoundSlots: [{ slots: ['controls'], size: 'sm', class: 'w-2' }] });",
		errors: repeat(conflict('w-2, w-4', 'icon'), 2)
	},
	{
		// Two groups naming one slot meet in it.
		code:
			IMPORT +
			"sv({ slots: { icon: '' }, groups: { a: ['icon'], b: ['icon'] }, variants: { size: { sm: { a: 'w-2' } }, tone: { x: { b: 'w-4' } } } });",
		errors: repeat(conflict('w-2, w-4', 'icon'), 2)
	},
	{
		// A group's class duplicating a member slot's own.
		code:
			IMPORT +
			"sv({ slots: { icon: 'rounded' }, groups: { all: ['icon'] }, variants: { size: { sm: { all: 'rounded' } } } });",
		errors: repeat(dup('rounded', 'icon'), 2)
	},
	{
		// A conflict within one group's own classes is reported once, for the
		// group, rather than once per member slot.
		code:
			IMPORT +
			"sv({ slots: { icon: '', label: '' }, groups: { controls: ['icon', 'label'] }, variants: { size: { sm: { controls: 'w-2 w-4' } } } });",
		errors: repeat(conflict('w-2, w-4', 'controls'), 2)
	},
	{
		// An untyped CSS variable on a shadow utility collides with a preset
		// size, on `font` with a weight; a `color:` hint stays a color.
		code:
			IMPORT_CN +
			"cn('shadow-(--x) shadow-lg', 'inset-shadow-(--x) inset-shadow-sm', 'text-shadow-(--x) text-shadow-sm', 'drop-shadow-(--x) drop-shadow-md', 'font-(--x) font-bold', 'shadow-(color:--y) shadow-blue-500');",
		errors: [
			...repeat(conflictCn('shadow-(--x), shadow-lg'), 2),
			...repeat(conflictCn('inset-shadow-(--x), inset-shadow-sm'), 2),
			...repeat(conflictCn('text-shadow-(--x), text-shadow-sm'), 2),
			...repeat(conflictCn('drop-shadow-(--x), drop-shadow-md'), 2),
			...repeat(conflictCn('font-(--x), font-bold'), 2),
			...repeat(conflictCn('shadow-(color:--y), shadow-blue-500'), 2)
		]
	},
	{
		// Record keys under the same condition apply together.
		code: IMPORT_CN + "cn({ 'w-2': active, 'w-4': active });",
		errors: repeat(conflictCn('w-2, w-4'), 2)
	},
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
		// Two text-color utilities share a first segment and dash count, so
		// they conflict — including when one uses a custom-palette color name.
		code: IMPORT_CN + "cn('text-red-500', 'text-blue-500');",
		errors: repeat(conflictCn('text-blue-500, text-red-500'), 2)
	},
	{
		// A custom-palette color conflicts with a built-in one (same shape).
		code: IMPORT_CN + "cn('text-brand-500', 'text-red-500');",
		errors: repeat(conflictCn('text-brand-500, text-red-500'), 2)
	},
	{
		// A single-word color keyword and a
		// shaded color both classify as color.
		code: IMPORT + "sv({ base: 'bg-white bg-red-500' });",
		errors: repeat(conflict('bg-red-500, bg-white'), 2)
	},
	{
		// An arbitrary hex color conflicts with a palette color of the same
		// property (both classify as color).
		code: IMPORT_CN + "cn('text-[#fff]', 'text-red-500');",
		errors: repeat(conflictCn('text-[#fff], text-red-500'), 2)
	},
	{
		// A CSS named color conflicts with a palette color the same way.
		code: IMPORT_CN + "cn('text-[red]', 'text-red-500');",
		errors: repeat(conflictCn('text-[red], text-red-500'), 2)
	},
	{
		// A word that isn't a color name — the `large` font-size keyword —
		// stays a size.
		code: IMPORT_CN + "cn('text-[large]', 'text-sm');",
		errors: repeat(conflictCn('text-[large], text-sm'), 2)
	},
	{
		// An arbitrary color function is recognized too.
		code: IMPORT_CN + "cn('bg-[rgb(0,0,0)]', 'bg-red-500');",
		errors: repeat(conflictCn('bg-[rgb(0,0,0)], bg-red-500'), 2)
	},
	{
		// A `color:` hint on the v4 CSS-variable shorthand reaches the color
		// bucket, which its single segment alone wouldn't.
		code: IMPORT_CN + "cn('text-(color:--brand)', 'text-red-500');",
		errors: repeat(conflictCn('text-(color:--brand), text-red-500'), 2)
	},
	{
		// An untyped shorthand is a color too, on
		// a prefix whose widest value type is one.
		code: IMPORT_CN + "cn('text-(--brand)', 'text-red-500');",
		errors: repeat(conflictCn('text-(--brand), text-red-500'), 2)
	},
	{
		// `bg` has no multi-segment bucket of its own, so an untyped shorthand
		// falls to its color fallback.
		code: IMPORT_CN + "cn('bg-(--brand)', 'bg-red-500');",
		errors: repeat(conflictCn('bg-(--brand), bg-red-500'), 2)
	},
	{
		// `decoration-(--x)` is a thickness,
		// so it collides with an explicit one.
		code: IMPORT_CN + "cn('decoration-(--thin)', 'decoration-2');",
		errors: repeat(conflictCn('decoration-(--thin), decoration-2'), 2)
	},
	{
		// The two box-decoration-break values do conflict with each other.
		code: IMPORT_CN + "cn('decoration-clone', 'decoration-slice');",
		errors: repeat(conflictCn('decoration-clone, decoration-slice'), 2)
	},
	{
		// The remaining bare `list-*` keywords are still one list-style-type.
		code: IMPORT_CN + "cn('list-disc', 'list-none');",
		errors: repeat(conflictCn('list-disc, list-none'), 2)
	},
	{
		// A `length:` hint is a width on a prefix that has one.
		code: IMPORT_CN + "cn('border-(length:--hairline)', 'border-2');",
		errors: repeat(conflictCn('border-(length:--hairline), border-2'), 2)
	},
	{
		// A `number:` hint is a font weight.
		code: IMPORT_CN + "cn('font-(number:--bold)', 'font-semibold');",
		errors: repeat(conflictCn('font-(number:--bold), font-semibold'), 2)
	},
	{
		// So is a bracketed bare number, hint or not.
		code: IMPORT_CN + "cn('font-[550]', 'font-bold');",
		errors: repeat(conflictCn('font-[550], font-bold'), 2)
	},
	{
		// A prefix with no weight of its own is unaffected — a bracketed
		// number is still the width its segment count makes it.
		code: IMPORT_CN + "cn('border-[2]', 'border-4');",
		errors: repeat(conflictCn('border-4, border-[2]'), 2)
	},
	{
		// A hint the prefix has no property for is ignored — `gap` has
		// no color, so the value stays the axis-less gap it looks like.
		code: IMPORT_CN + "cn('gap-(color:--x)', 'gap-4');",
		errors: repeat(conflictCn('gap-(color:--x), gap-4'), 2)
	},
	{
		// An unrecognized hint is ignored the same way, leaving
		// the segment-count heuristic to classify the value.
		code: IMPORT_CN + "cn('line-clamp-(integer:--x)', 'line-clamp-3');",
		errors: repeat(conflictCn('line-clamp-(integer:--x), line-clamp-3'), 2)
	},
	{
		// A colon that isn't a type hint (the scheme of a data URI) leaves the
		// value untyped, so a bracketed one keeps the plain heuristic.
		code:
			IMPORT_CN + "cn('content-[url(data:a)]', 'content-[url(data:b)]');",
		errors: repeat(
			conflictCn('content-[url(data:a)], content-[url(data:b)]'),
			2
		)
	},
	{
		// Two font sizes conflict, modifier or not.
		code: IMPORT_CN + "cn('text-lg', 'text-xl');",
		errors: repeat(conflictCn('text-lg, text-xl'), 2)
	},
	{
		// A `/leading` modifier sets line-height, so it conflicts with a
		// separate `leading-*` utility.
		code: IMPORT_CN + "cn('text-lg/6', 'leading-8');",
		errors: repeat(conflictCn('leading-8, text-lg/6'), 2)
	},
	{
		// A one-word theme color is a color,
		// so it conflicts with another color…
		code: IMPORT_CN + "cn('text-primary', 'text-red-500');",
		errors: repeat(conflictCn('text-primary, text-red-500'), 2)
	},
	{
		// …and with another one-word theme color.
		code: IMPORT_CN + "cn('border-primary', 'border-accent/50');",
		errors: repeat(conflictCn('border-accent/50, border-primary'), 2)
	},
	{
		// A digit-led named size is still a size.
		code: IMPORT_CN + "cn('text-2xl', 'text-sm');",
		errors: repeat(conflictCn('text-2xl, text-sm'), 2)
	},
	{
		// A named shadow size is still a shadow, not a color.
		code: IMPORT_CN + "cn('shadow-md', 'shadow-none');",
		errors: repeat(conflictCn('shadow-md, shadow-none'), 2)
	},
	{
		// A named text-shadow size is still a size, not a color.
		code: IMPORT_CN + "cn('text-shadow-md', 'text-shadow-none');",
		errors: repeat(conflictCn('text-shadow-md, text-shadow-none'), 2)
	},
	{
		// …and it still conflicts with a plain, non-modifier font size too.
		code: IMPORT_CN + "cn('text-lg', 'text-xl/6');",
		errors: repeat(conflictCn('text-lg, text-xl/6'), 2)
	},
	{
		// Two modifier-bearing font sizes conflict directly.
		code: IMPORT_CN + "cn('text-lg/6', 'text-xl/8');",
		errors: repeat(conflictCn('text-lg/6, text-xl/8'), 2)
	},
	{
		// The modifier works on an arbitrary font-size value too.
		code: IMPORT_CN + "cn('text-[13px]/6', 'leading-8');",
		errors: repeat(conflictCn('leading-8, text-[13px]/6'), 2)
	},
	{
		// Two ring offset widths conflict (same nested sub-property).
		code: IMPORT_CN + "cn('ring-offset-2', 'ring-offset-4');",
		errors: repeat(conflictCn('ring-offset-2, ring-offset-4'), 2)
	},
	{
		// Two ring offset colors conflict.
		code: IMPORT_CN + "cn('ring-offset-red-500', 'ring-offset-blue-500');",
		errors: repeat(
			conflictCn('ring-offset-blue-500, ring-offset-red-500'),
			2
		)
	},
	{
		// Two text-shadow sizes conflict.
		code: IMPORT_CN + "cn('text-shadow-sm', 'text-shadow-lg');",
		errors: repeat(conflictCn('text-shadow-lg, text-shadow-sm'), 2)
	},
	{
		// Two text-shadow colors conflict.
		code: IMPORT_CN + "cn('text-shadow-red-500', 'text-shadow-blue-500');",
		errors: repeat(
			conflictCn('text-shadow-blue-500, text-shadow-red-500'),
			2
		)
	},
	{
		// Two inset-shadow sizes conflict.
		code: IMPORT_CN + "cn('inset-shadow-sm', 'inset-shadow-lg');",
		errors: repeat(conflictCn('inset-shadow-lg, inset-shadow-sm'), 2)
	},
	{
		// Two inset-ring widths conflict.
		code: IMPORT_CN + "cn('inset-ring-2', 'inset-ring-4');",
		errors: repeat(conflictCn('inset-ring-2, inset-ring-4'), 2)
	},
	{
		// Two mask-composite values conflict.
		code: IMPORT_CN + "cn('mask-add', 'mask-subtract');",
		errors: repeat(conflictCn('mask-add, mask-subtract'), 2)
	},
	{
		// Two mask-mode values conflict.
		code: IMPORT_CN + "cn('mask-alpha', 'mask-luminance');",
		errors: repeat(conflictCn('mask-alpha, mask-luminance'), 2)
	},
	{
		// Two mask-clip values conflict.
		code: IMPORT_CN + "cn('mask-clip-border', 'mask-clip-padding');",
		errors: repeat(conflictCn('mask-clip-border, mask-clip-padding'), 2)
	},
	{
		// `mask-no-clip` turns the same property
		// off, so it collides with a value.
		code: IMPORT_CN + "cn('mask-no-clip', 'mask-clip-border');",
		errors: repeat(conflictCn('mask-clip-border, mask-no-clip'), 2)
	},
	{
		// Same for `mask-no-repeat` against a mask-repeat value.
		code: IMPORT_CN + "cn('mask-no-repeat', 'mask-repeat-x');",
		errors: repeat(conflictCn('mask-no-repeat, mask-repeat-x'), 2)
	},
	{
		// Two directional mask gradient-stop colors conflict.
		code: IMPORT_CN + "cn('mask-t-from-red-500', 'mask-t-from-blue-500');",
		errors: repeat(
			conflictCn('mask-t-from-blue-500, mask-t-from-red-500'),
			2
		)
	},
	{
		// Two directional mask gradient-stop positions conflict.
		code: IMPORT_CN + "cn('mask-t-from-30%', 'mask-t-from-60%');",
		errors: repeat(conflictCn('mask-t-from-30%, mask-t-from-60%'), 2)
	},
	{
		// Two mask-linear angles conflict.
		code: IMPORT_CN + "cn('mask-linear-45', 'mask-linear-90');",
		errors: repeat(conflictCn('mask-linear-45, mask-linear-90'), 2)
	},
	{
		// Two mask-radial size values conflict, regardless of side/corner.
		code:
			IMPORT_CN +
			"cn('mask-radial-closest-side', 'mask-radial-farthest-corner');",
		errors: repeat(
			conflictCn('mask-radial-closest-side, mask-radial-farthest-corner'),
			2
		)
	},
	{
		// Two scrollbar-thumb colors conflict.
		code:
			IMPORT_CN +
			"cn('scrollbar-thumb-red-500', 'scrollbar-thumb-blue-500');",
		errors: repeat(
			conflictCn('scrollbar-thumb-blue-500, scrollbar-thumb-red-500'),
			2
		)
	},
	{
		// Two bare scrollbar width keywords conflict.
		code: IMPORT_CN + "cn('scrollbar-thin', 'scrollbar-none');",
		errors: repeat(conflictCn('scrollbar-none, scrollbar-thin'), 2)
	},
	{
		// Two scrollbar-gutter values conflict.
		code:
			IMPORT_CN + "cn('scrollbar-gutter-auto', 'scrollbar-gutter-both');",
		errors: repeat(
			conflictCn('scrollbar-gutter-auto, scrollbar-gutter-both'),
			2
		)
	},
	{
		// Exclusive touch-action keywords conflict (they replace each other).
		code: IMPORT_CN + "cn('touch-auto', 'touch-none');",
		errors: repeat(conflictCn('touch-auto, touch-none'), 2)
	},
	{
		// `touch-pan-x`/`-left`/`-right` all set the same CSS value, so they
		// conflict directly, not just through the bare `touch-*` bridge.
		code: IMPORT_CN + "cn('touch-pan-x', 'touch-pan-left');",
		errors: repeat(conflictCn('touch-pan-left, touch-pan-x'), 2)
	},
	{
		code: IMPORT_CN + "cn('touch-pan-y', 'touch-pan-up');",
		errors: repeat(conflictCn('touch-pan-up, touch-pan-y'), 2)
	},
	{
		// A bare touch-action toggle reaches every pan direction, not just the
		// bare axis form.
		code: IMPORT_CN + "cn('touch-none', 'touch-pan-left');",
		errors: repeat(conflictCn('touch-none, touch-pan-left'), 2)
	},
	{
		// `reverse` composition is opt-in: `flex-row-reverse` is a direction
		// value, not a flag, so it still conflicts with `flex-row`.
		code: IMPORT_CN + "cn('flex-row', 'flex-row-reverse');",
		errors: repeat(conflictCn('flex-row, flex-row-reverse'), 2)
	},
	{
		// A single-property color utility collides across value shapes (keyword
		// vs shaded color).
		code: IMPORT_CN + "cn('fill-current', 'fill-red-500');",
		errors: repeat(conflictCn('fill-current, fill-red-500'), 2)
	},
	{
		// A gradient color keyword collides with a shaded gradient color.
		code: IMPORT_CN + "cn('from-transparent', 'from-red-500');",
		errors: repeat(conflictCn('from-red-500, from-transparent'), 2)
	},
	{
		// scroll-snap-type: none conflicts with an axis value.
		code: IMPORT_CN + "cn('snap-x', 'snap-none');",
		errors: repeat(conflictCn('snap-none, snap-x'), 2)
	},
	{
		// Two background-blend-modes conflict.
		code: IMPORT_CN + "cn('bg-blend-multiply', 'bg-blend-screen');",
		errors: repeat(conflictCn('bg-blend-multiply, bg-blend-screen'), 2)
	},
	{
		// Two grid-auto-columns values conflict.
		code: IMPORT_CN + "cn('auto-cols-max', 'auto-cols-min');",
		errors: repeat(conflictCn('auto-cols-max, auto-cols-min'), 2)
	},
	{
		// Same-axis border-spacing values
		// conflict; different axes (above) don't.
		code: IMPORT_CN + "cn('border-spacing-x-2', 'border-spacing-x-4');",
		errors: repeat(conflictCn('border-spacing-x-2, border-spacing-x-4'), 2)
	},
	{
		// Two table-layout values conflict; layout vs display (above) does not.
		code: IMPORT_CN + "cn('table-auto', 'table-fixed');",
		errors: repeat(conflictCn('table-auto, table-fixed'), 2)
	},
	{
		// Two table display values conflict regardless of segment count.
		code: IMPORT_CN + "cn('table-cell', 'table-header-group');",
		errors: repeat(conflictCn('table-cell, table-header-group'), 2)
	},
	{
		// A single-property utility collides across
		// value shapes (one segment vs hyphenated).
		code: IMPORT_CN + "cn('ease-in', 'ease-in-out');",
		errors: repeat(conflictCn('ease-in, ease-in-out'), 2)
	},
	{
		// text-overflow utilities conflict by default via the
		// classifier, with no exclusiveGroups opt-in needed.
		code: IMPORT_CN + "cn('text-ellipsis', 'text-clip');",
		errors: repeat(conflictCn('text-clip, text-ellipsis'), 2)
	},
	{
		// Two font sizes conflict (same size category, short bucket).
		code: IMPORT_CN + "cn('text-sm', 'text-lg');",
		errors: repeat(conflictCn('text-lg, text-sm'), 2)
	},
	{
		// Border widths conflict (same width category).
		code: IMPORT_CN + "cn('border-2', 'border-4');",
		errors: repeat(conflictCn('border-2, border-4'), 2)
	},
	{
		// Same flex direction values conflict.
		code: IMPORT_CN + "cn('flex-row', 'flex-col');",
		errors: repeat(conflictCn('flex-col, flex-row'), 2)
	},
	{
		// Same-side border widths conflict; different sides (above) do not.
		code: IMPORT_CN + "cn('border-t-2', 'border-t-4');",
		errors: repeat(conflictCn('border-t-2, border-t-4'), 2)
	},
	{
		// A bare default utility conflicts with its sized sibling: `rounded` is
		// `rounded-DEFAULT`, so it collides with `rounded-lg`.
		code: IMPORT_CN + "cn('rounded', 'rounded-lg');",
		errors: repeat(conflictCn('rounded, rounded-lg'), 2)
	},
	{
		// Bare `border` is a border-width, so it collides with `border-2`.
		code: IMPORT_CN + "cn('border', 'border-2');",
		errors: repeat(conflictCn('border, border-2'), 2)
	},
	{
		// Bare `ring` is a ring-width, colliding with `ring-2`.
		code: IMPORT_CN + "cn('ring', 'ring-2');",
		errors: repeat(conflictCn('ring, ring-2'), 2)
	},
	{
		// Bare `outline` is an outline-width, colliding with `outline-2`.
		code: IMPORT_CN + "cn('outline', 'outline-2');",
		errors: repeat(conflictCn('outline, outline-2'), 2)
	},
	{
		// Bare `shadow` is a box-shadow, colliding with `shadow-md`.
		code: IMPORT_CN + "cn('shadow', 'shadow-md');",
		errors: repeat(conflictCn('shadow, shadow-md'), 2)
	},
	{
		// Bare utilities of unclassified families collide
		// with their sized siblings too (`blur`/`blur-sm`,
		// `grow`/`grow-0`, `shrink`/`shrink-0`).
		code: IMPORT_CN + "cn('blur', 'blur-sm');",
		errors: repeat(conflictCn('blur, blur-sm'), 2)
	},
	{
		code: IMPORT_CN + "cn('grow', 'grow-0');",
		errors: repeat(conflictCn('grow, grow-0'), 2)
	},
	{
		code: IMPORT_CN + "cn('shrink', 'shrink-0');",
		errors: repeat(conflictCn('shrink, shrink-0'), 2)
	},
	{
		// Bare feature-toggle utilities collide with any dashed member of their
		// family (all set the same single property).
		code: IMPORT_CN + "cn('transition', 'transition-none');",
		errors: repeat(conflictCn('transition, transition-none'), 2)
	},
	{
		code: IMPORT_CN + "cn('transform', 'transform-gpu');",
		errors: repeat(conflictCn('transform, transform-gpu'), 2)
	},
	{
		code: IMPORT_CN + "cn('filter', 'filter-none');",
		errors: repeat(conflictCn('filter, filter-none'), 2)
	},
	{
		code: IMPORT_CN + "cn('resize', 'resize-x');",
		errors: repeat(conflictCn('resize, resize-x'), 2)
	},
	{
		// Bare filter toggles collide with their `-0`
		// reset sibling (same filter sub-property).
		code: IMPORT_CN + "cn('grayscale', 'grayscale-0');",
		errors: repeat(conflictCn('grayscale, grayscale-0'), 2)
	},
	{
		code: IMPORT_CN + "cn('invert', 'invert-0');",
		errors: repeat(conflictCn('invert, invert-0'), 2)
	},
	{
		code: IMPORT_CN + "cn('sepia', 'sepia-0');",
		errors: repeat(conflictCn('sepia, sepia-0'), 2)
	},
	{
		// Bare `drop-shadow` and its sized variants are one drop-shadow filter.
		code: IMPORT_CN + "cn('drop-shadow', 'drop-shadow-md');",
		errors: repeat(conflictCn('drop-shadow, drop-shadow-md'), 2)
	},
	{
		// `size-*` sets width, so it overlaps `w-*` (value-independent).
		code: IMPORT_CN + "cn('w-4', 'size-4');",
		errors: repeat(conflictCn('size-4, w-4'), 2)
	},
	{
		// …and height, so it overlaps `h-*` too.
		code: IMPORT_CN + "cn('h-full', 'size-4');",
		errors: repeat(conflictCn('h-full, size-4'), 2)
	},
	{
		// With both axes present, `size-*` merges the width
		// and height groups into one conflict — but
		// `w-*`/`h-*` only reach each other through `size`.
		code: IMPORT_CN + "cn('w-4', 'h-4', 'size-8');",
		errors: repeat(conflictCn('h-4, size-8, w-4'), 3)
	},
	{
		// Two `size-*` utilities conflict directly (same property).
		code: IMPORT_CN + "cn('size-4', 'size-8');",
		errors: repeat(conflictCn('size-4, size-8'), 2)
	},
	{
		// `m-*` sets every margin side, so it overlaps a side utility.
		code: IMPORT_CN + "cn('m-4', 'mt-2');",
		errors: repeat(conflictCn('m-4, mt-2'), 2)
	},
	{
		// …and a spacing axis overlaps its physical sides.
		code: IMPORT_CN + "cn('px-4', 'pl-2');",
		errors: repeat(conflictCn('pl-2, px-4'), 2)
	},
	{
		// The whole chain merges when the shorthand bridges it.
		code: IMPORT_CN + "cn('m-4', 'mx-2', 'ml-1');",
		errors: repeat(conflictCn('m-4, ml-1, mx-2'), 3)
	},
	{
		// `p-2` alone is exhaustive (every `size` value sets it), so the edge
		// check runs against its `px` neighbor — the array matcher's value set
		// (`sm`/`lg`) overlaps `p-2`'s own values on the shared `size` key, so
		// the compound can still render alongside it: a real conflict.
		code:
			IMPORT +
			`sv({
				variants: { size: { sm: 'p-2', lg: 'p-2' } },
				compoundVariants: [{ size: ['sm', 'lg'], class: 'px-4' }]
			});`,
		errors: repeat(conflict('p-2, px-4'), 3)
	},
	{
		// `p` and `px` each come from a different variant, so neither is
		// exclusive with the other on shared-key grounds — both can be active
		// (`size: 'sm', shade: 'red'`) at once, a real conflict.
		code:
			IMPORT +
			`sv({
				variants: {
					size: { sm: 'p-2' },
					shade: { red: 'px-4' }
				}
			});`,
		errors: repeat(conflict('p-2, px-4'), 2)
	},
	{
		// `p-2` alone is exclusive with itself (single-branch variant), so the
		// edge check reaches its `px` neighbor — a wholly dynamic compound
		// matcher can't prove exclusivity, so the overlap still counts as a
		// real conflict.
		code:
			IMPORT +
			`sv({
				variants: { size: { sm: 'p-2', lg: 'p-2' } },
				compoundVariants: [{ size: dyn, class: 'px-4' }]
			});`,
		errors: repeat(conflict('p-2, px-4'), 3)
	},
	{
		// An arbitrary value is one segment regardless of inner dashes, so it
		// resolves to the very same conflict key as its sized sibling.
		code: IMPORT_CN + "cn('mt-4', 'mt-[calc(100%-1px)]');",
		errors: repeat(conflictCn('mt-4, mt-[calc(100%-1px)]'), 2)
	},
	{
		code: IMPORT_CN + "cn('w-4', 'w-[calc(100%-2rem)]');",
		errors: repeat(conflictCn('w-4, w-[calc(100%-2rem)]'), 2)
	},
	{
		// A Tailwind v4 CSS-variable shorthand is one segment regardless of
		// inner dashes in the variable name, so it conflicts with a sized
		// sibling the same way a bracketed arbitrary value does.
		code: IMPORT_CN + "cn('w-4', 'w-(--my-width)');",
		errors: repeat(conflictCn('w-(--my-width), w-4'), 2)
	},
	{
		// Two CSS-variable shorthands with differing dash counts in the
		// variable name still land in the same conflict key.
		code: IMPORT_CN + "cn('w-(--foo)', 'w-(--foo-bar)');",
		errors: repeat(conflictCn('w-(--foo), w-(--foo-bar)'), 2)
	},
	{
		// Values with different segment counts land in different conflict keys
		// but still share the segment's overlap node.
		code: IMPORT_CN + "cn('mt-4', 'mt-safe-bottom');",
		errors: repeat(conflictCn('mt-4, mt-safe-bottom'), 2)
	},
	{
		// Stacked variants are order-insensitive: both orders share one
		// canonical prefix.
		code: IMPORT_CN + "cn('hover:focus:w-4', 'focus:hover:w-8');",
		errors: repeat(conflictCn('focus:hover:w-8, hover:focus:w-4'), 2)
	},
	{
		// Including on either side of a variant that keeps its place.
		code: IMPORT_CN + "cn('hover:focus:*:w-4', 'focus:hover:*:w-8');",
		errors: repeat(conflictCn('focus:hover:*:w-8, hover:focus:*:w-4'), 2)
	},
	{
		code:
			IMPORT_CN + "cn('[&>p]:hover:focus:w-4', '[&>p]:focus:hover:w-8');",
		errors: repeat(
			conflictCn('[&>p]:focus:hover:w-8, [&>p]:hover:focus:w-4'),
			2
		)
	},
	{
		code: IMPORT + "sv({ base: 'md:hover:w-4 hover:md:w-8' });",
		errors: repeat(conflict('hover:md:w-8, md:hover:w-4'), 2)
	},
	{
		// A colon inside an arbitrary variant doesn't split the prefix.
		code:
			IMPORT_CN +
			"cn('supports-[display:grid]:w-4', 'supports-[display:grid]:w-8');",
		errors: repeat(
			conflictCn(
				'supports-[display:grid]:w-4, supports-[display:grid]:w-8'
			),
			2
		)
	},
	{
		// Two background-images conflict — an arbitrary url() is an image.
		code: IMPORT_CN + "cn('bg-[url(/hero.png)]', 'bg-none');",
		errors: repeat(conflictCn('bg-[url(/hero.png)], bg-none'), 2)
	},
	{
		// A mask image works the same way.
		code: IMPORT_CN + "cn('mask-[url(/a.svg)]', 'mask-none');",
		errors: repeat(conflictCn('mask-[url(/a.svg)], mask-none'), 2)
	},
	{
		// The explicit `bg-size-*` namespace is the same property as the bare
		// keyword form.
		code: IMPORT_CN + "cn('bg-size-[3px_4px]', 'bg-cover');",
		errors: repeat(conflictCn('bg-cover, bg-size-[3px_4px]'), 2)
	},
	{
		code: IMPORT_CN + "cn('bg-position-(position:--spot)', 'bg-center');",
		errors: repeat(
			conflictCn('bg-center, bg-position-(position:--spot)'),
			2
		)
	},
	{
		// Same for the mask namespaces.
		code: IMPORT_CN + "cn('mask-size-[3px]', 'mask-contain');",
		errors: repeat(conflictCn('mask-contain, mask-size-[3px]'), 2)
	},
	{
		code: IMPORT_CN + "cn('mask-position-[top]', 'mask-center');",
		errors: repeat(conflictCn('mask-center, mask-position-[top]'), 2)
	},
	{
		// An arbitrary object value is an object-position,
		// so it collides with the keyword form.
		code: IMPORT_CN + "cn('object-[center_top]', 'object-center');",
		errors: repeat(conflictCn('object-[center_top], object-center'), 2)
	},
	{
		code: IMPORT_CN + "cn('object-(--spot)', 'object-left-top');",
		errors: repeat(conflictCn('object-(--spot), object-left-top'), 2)
	},
	{
		// `inset-*` covers the individual offset utilities.
		code: IMPORT_CN + "cn('inset-0', 'top-4');",
		errors: repeat(conflictCn('inset-0, top-4'), 2)
	},
	{
		code: IMPORT_CN + "cn('inset-x-0', 'left-2');",
		errors: repeat(conflictCn('inset-x-0, left-2'), 2)
	},
	{
		// A bare axis utility covers its per-axis forms.
		code: IMPORT_CN + "cn('gap-4', 'gap-x-2');",
		errors: repeat(conflictCn('gap-4, gap-x-2'), 2)
	},
	{
		code: IMPORT_CN + "cn('overflow-hidden', 'overflow-x-auto');",
		errors: repeat(conflictCn('overflow-hidden, overflow-x-auto'), 2)
	},
	{
		// `translate-none` resets every axis, so it conflicts with the bare
		// shorthand…
		code: IMPORT_CN + "cn('translate-none', 'translate-4');",
		errors: repeat(conflictCn('translate-4, translate-none'), 2)
	},
	{
		// …with a per-axis value…
		code: IMPORT_CN + "cn('translate-none', 'translate-x-2');",
		errors: repeat(conflictCn('translate-none, translate-x-2'), 2)
	},
	{
		// …and, unlike the bare shorthand, with `translate-z` too.
		code: IMPORT_CN + "cn('translate-none', 'translate-z-10');",
		errors: repeat(conflictCn('translate-none, translate-z-10'), 2)
	},
	{
		// `rounded-*` covers corner sides, which cover their corners.
		code: IMPORT_CN + "cn('rounded-lg', 'rounded-t-sm');",
		errors: repeat(conflictCn('rounded-lg, rounded-t-sm'), 2)
	},
	{
		code: IMPORT_CN + "cn('rounded-t-lg', 'rounded-tl-sm');",
		errors: repeat(conflictCn('rounded-t-lg, rounded-tl-sm'), 2)
	},
	{
		// The bare `rounded` default participates in the overlap too.
		code: IMPORT_CN + "cn('rounded', 'rounded-tl-sm');",
		errors: repeat(conflictCn('rounded, rounded-tl-sm'), 2)
	},
	{
		// A border width covers the per-side widths, and the width axes cover
		// their physical sides.
		code: IMPORT_CN + "cn('border-2', 'border-t-4');",
		errors: repeat(conflictCn('border-2, border-t-4'), 2)
	},
	{
		code: IMPORT_CN + "cn('border-x-2', 'border-l-4');",
		errors: repeat(conflictCn('border-l-4, border-x-2'), 2)
	},
	{
		// Bare `border-t` is the 1px top width, colliding with `border-t-2`.
		code: IMPORT_CN + "cn('border-t', 'border-t-2');",
		errors: repeat(conflictCn('border-t, border-t-2'), 2)
	},
	{
		// Two per-side border colors conflict.
		code: IMPORT_CN + "cn('border-t-red-500', 'border-t-blue-500');",
		errors: repeat(conflictCn('border-t-blue-500, border-t-red-500'), 2)
	},
	{
		// A border color covers the per-side colors, mirroring `border-w`.
		code: IMPORT_CN + "cn('border-red-500', 'border-t-blue-500');",
		errors: repeat(conflictCn('border-red-500, border-t-blue-500'), 2)
	},
	{
		// Logical block-side border widths conflict with each other…
		code: IMPORT_CN + "cn('border-bs-2', 'border-bs-4');",
		errors: repeat(conflictCn('border-bs-2, border-bs-4'), 2)
	},
	{
		// …and the bare border width covers them too, like the physical sides.
		code: IMPORT_CN + "cn('border-2', 'border-bs-4');",
		errors: repeat(conflictCn('border-2, border-bs-4'), 2)
	},
	{
		// Bare `border-spacing` covers its per-axis forms.
		code: IMPORT_CN + "cn('border-spacing-2', 'border-spacing-x-4');",
		errors: repeat(conflictCn('border-spacing-2, border-spacing-x-4'), 2)
	},
	{
		// The scroll-margin family overlaps like the plain spacing one.
		code: IMPORT_CN + "cn('scroll-m-4', 'scroll-mt-2');",
		errors: repeat(conflictCn('scroll-m-4, scroll-mt-2'), 2)
	},
	{
		// `m-*`/`p-*` also cover the logical block sides (`mbs`/`pbs`).
		code: IMPORT_CN + "cn('m-4', 'mbs-2');",
		errors: repeat(conflictCn('m-4, mbs-2'), 2)
	},
	{
		code: IMPORT_CN + "cn('p-4', 'pbe-2');",
		errors: repeat(conflictCn('p-4, pbe-2'), 2)
	},
	{
		// …and so does `scroll-m`/`scroll-p`.
		code: IMPORT_CN + "cn('scroll-m-4', 'scroll-mbs-2');",
		errors: repeat(conflictCn('scroll-m-4, scroll-mbs-2'), 2)
	},
	{
		// `inset-*` also covers the logical block-side offsets.
		code: IMPORT_CN + "cn('inset-0', 'inset-bs-4');",
		errors: repeat(conflictCn('inset-0, inset-bs-4'), 2)
	},
	{
		// Compounds matching the same variant value apply together.
		code:
			IMPORT +
			`sv({
				variants: { size: { sm: 'text-sm' } },
				compoundVariants: [
					{ size: 'sm', class: 'p-2' },
					{ size: 'sm', tone: 'red', class: 'p-4' }
				]
			});`,
		errors: repeat(conflict('p-2, p-4'), 2)
	},
	{
		// Compounds with no shared matcher key can co-occur.
		code:
			IMPORT +
			`sv({
				compoundVariants: [
					{ size: 'sm', class: 'p-2' },
					{ tone: 'red', class: 'p-4' }
				]
			});`,
		errors: repeat(conflict('p-2, p-4'), 2)
	},
	{
		// A dynamic matcher can't prove exclusivity — stays flagged.
		code:
			IMPORT +
			`sv({
				compoundVariants: [
					{ size: dyn, class: 'p-2' },
					{ size: 'lg', class: 'p-4' }
				]
			});`,
		errors: repeat(conflict('p-2, p-4'), 2)
	},
	{
		// An array matcher with no statically-readable element can't narrow
		// anything either — same as a wholly dynamic matcher, stays flagged.
		code:
			IMPORT +
			`sv({
				compoundVariants: [
					{ size: [dyn], class: 'p-2' },
					{ size: 'lg', class: 'p-4' }
				]
			});`,
		errors: repeat(conflict('p-2, p-4'), 2)
	},
	{
		// A compound applies together with the variant value it matches.
		code:
			IMPORT +
			`sv({
				variants: { size: { sm: 'p-2' } },
				compoundVariants: [{ size: 'sm', class: 'p-4' }]
			});`,
		errors: repeat(conflict('p-2, p-4'), 2)
	},
	{
		// Same-branch conditionals render together.
		code: IMPORT_CN + "cn(active && 'p-2', active && 'p-4');",
		errors: repeat(conflictCn('p-2, p-4'), 2)
	},
	{
		code: IMPORT_CN + "cn(active ? 'p-2' : '', active ? 'p-4' : '');",
		errors: repeat(conflictCn('p-2, p-4'), 2)
	},
	{
		// A nested conditional shares its outer condition with a plain
		// same-condition token — they co-occur whenever both conditions hold.
		code:
			IMPORT_CN + "cn(active && 'p-2', active && (dense ? 'p-4' : ''));",
		errors: repeat(conflictCn('p-2, p-4'), 2)
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
		// Opt-in: single-word text-transform utilities are mutually exclusive.
		code: IMPORT_CN + "cn('uppercase', 'capitalize');",
		options: [{ exclusiveGroups: true }],
		errors: repeat(conflictCn('capitalize, uppercase'), 2)
	},
	{
		// Opt-in: text-decoration-line utilities, including the hyphenated
		// `line-through`/`no-underline` members.
		code: IMPORT_CN + "cn('underline', 'line-through');",
		options: [{ exclusiveGroups: true }],
		errors: repeat(conflictCn('line-through, underline'), 2)
	},
	{
		// Opt-in: font-style utilities.
		code: IMPORT_CN + "cn('italic', 'not-italic');",
		options: [{ exclusiveGroups: true }],
		errors: repeat(conflictCn('italic, not-italic'), 2)
	},
	{
		// Opt-in: font-smoothing utilities.
		code: IMPORT_CN + "cn('antialiased', 'subpixel-antialiased');",
		options: [{ exclusiveGroups: true }],
		errors: repeat(conflictCn('antialiased, subpixel-antialiased'), 2)
	},
	{
		// Opt-in: isolation utilities.
		code: IMPORT_CN + "cn('isolate', 'isolation-auto');",
		options: [{ exclusiveGroups: true }],
		errors: repeat(conflictCn('isolate, isolation-auto'), 2)
	},
	{
		// Opt-in: screen-reader visibility utilities.
		code: IMPORT_CN + "cn('sr-only', 'not-sr-only');",
		options: [{ exclusiveGroups: true }],
		errors: repeat(conflictCn('not-sr-only, sr-only'), 2)
	},
	{
		// Font-variant-numeric spacing styles are the same property, so they
		// conflict by default — no opt-in needed (unlike `display`, these
		// words are specific enough to not collide with project class names).
		code: IMPORT_CN + "cn('tabular-nums', 'proportional-nums');",
		errors: repeat(conflictCn('proportional-nums, tabular-nums'), 2)
	},
	{
		// `normal-nums` resets the whole property, so it conflicts with a
		// value from any of the other font-variant-numeric categories too.
		code: IMPORT_CN + "cn('normal-nums', 'diagonal-fractions');",
		errors: repeat(conflictCn('diagonal-fractions, normal-nums'), 2)
	},
	{
		// `truncate` forces text-overflow, so it conflicts with the explicit
		// `text-ellipsis`/`text-clip` utilities by default — no opt-in needed.
		code: IMPORT_CN + "cn('truncate', 'text-ellipsis');",
		errors: repeat(conflictCn('text-ellipsis, truncate'), 2)
	},
	{
		code: IMPORT_CN + "cn('truncate', 'text-clip');",
		errors: repeat(conflictCn('text-clip, truncate'), 2)
	},
	{
		// `truncate` also sets overflow (both axes) and white-space.
		code: IMPORT_CN + "cn('truncate', 'overflow-visible');",
		errors: repeat(conflictCn('overflow-visible, truncate'), 2)
	},
	{
		code: IMPORT_CN + "cn('truncate', 'overflow-x-auto');",
		errors: repeat(conflictCn('overflow-x-auto, truncate'), 2)
	},
	{
		code: IMPORT_CN + "cn('truncate', 'whitespace-normal');",
		errors: repeat(conflictCn('truncate, whitespace-normal'), 2)
	},
	{
		// Two `line-clamp-*` values conflict directly (same property).
		code: IMPORT_CN + "cn('line-clamp-3', 'line-clamp-4');",
		errors: repeat(conflictCn('line-clamp-3, line-clamp-4'), 2)
	},
	{
		// `line-clamp-*` forces `display`, so it conflicts with any display
		// keyword by default — no opt-in needed, unlike display-vs-display.
		code: IMPORT_CN + "cn('line-clamp-3', 'flex');",
		errors: repeat(conflictCn('flex, line-clamp-3'), 2)
	},
	{
		code: IMPORT_CN + "cn('line-clamp-3', 'hidden');",
		errors: repeat(conflictCn('hidden, line-clamp-3'), 2)
	},
	{
		// `line-clamp-*` also forces `overflow: hidden`.
		code: IMPORT_CN + "cn('line-clamp-3', 'overflow-visible');",
		errors: repeat(conflictCn('line-clamp-3, overflow-visible'), 2)
	},
	{
		code: IMPORT_CN + "cn('line-clamp-3', 'overflow-x-auto');",
		errors: repeat(conflictCn('line-clamp-3, overflow-x-auto'), 2)
	},
	{
		// The bridge merges every present display keyword into one group, since
		// `flex` and `hidden` both reach `line-clamp` (and, transitively, each
		// other) — this is a real conflict either way.
		code: IMPORT_CN + "cn('line-clamp-3', 'flex', 'hidden');",
		errors: repeat(conflictCn('flex, hidden, line-clamp-3'), 3)
	},
	{
		// The bridge reaches the hyphenated display keywords too,
		// whichever dash family they take their conflict key from.
		code: IMPORT_CN + "cn('line-clamp-3', 'inline-flex');",
		errors: repeat(conflictCn('inline-flex, line-clamp-3'), 2)
	},
	{
		code: IMPORT_CN + "cn('line-clamp-3', 'table-cell');",
		errors: repeat(conflictCn('line-clamp-3, table-cell'), 2)
	},
	{
		// `flow-root` has no dash family of its own, `list-item`
		// shares one with the list-style-type utilities.
		code: IMPORT_CN + "cn('line-clamp-3', 'flow-root');",
		errors: repeat(conflictCn('flow-root, line-clamp-3'), 2)
	},
	{
		code: IMPORT_CN + "cn('line-clamp-3', 'list-item');",
		errors: repeat(conflictCn('line-clamp-3, list-item'), 2)
	},
	{
		// Enabling `exclusiveGroups` gives a display keyword a group conflict
		// key, but must not cost it the always-on `line-clamp` bridge above.
		code: IMPORT_CN + "cn('line-clamp-3', 'flex');",
		options: [{ exclusiveGroups: true }],
		errors: repeat(conflictCn('flex, line-clamp-3'), 2)
	},
	{
		code: IMPORT_CN + "cn('line-clamp-3', 'inline-flex');",
		options: [{ exclusiveGroups: true }],
		errors: repeat(conflictCn('inline-flex, line-clamp-3'), 2)
	},
	{
		// Same for a grouped `truncate`: a custom group replaces its
		// conflict key while the overflow/white-space overlaps keep working.
		code: IMPORT_CN + "cn('truncate', 'overflow-auto');",
		options: [{ exclusiveGroups: [['truncate', 'text-ellipsis']] }],
		errors: repeat(conflictCn('overflow-auto, truncate'), 2)
	},
	{
		// `@container`/`@container-normal`/`@container-size` all set one
		// property, so they conflict with each other directly.
		code: IMPORT_CN + "cn('@container', '@container-normal');",
		errors: repeat(conflictCn('@container, @container-normal'), 2)
	},
	{
		// Two named containers conflict too, regardless of the actual name —
		// tailwind-merge doesn't distinguish container names either.
		code: IMPORT_CN + "cn('@container/sidebar', '@container-size/nav');",
		errors: repeat(conflictCn('@container-size/nav, @container/sidebar'), 2)
	},
	{
		// Naming a container also sets its type, so it conflicts with a plain
		// `container-type` utility too.
		code: IMPORT_CN + "cn('@container-normal', '@container/sidebar');",
		errors: repeat(conflictCn('@container-normal, @container/sidebar'), 2)
	},
	{
		code: IMPORT_CN + "cn('@container', '@container/sidebar');",
		errors: repeat(conflictCn('@container, @container/sidebar'), 2)
	},
	{
		// `flex-1`/`flex-auto`/`flex-none` set grow, shrink, and basis at once.
		code: IMPORT_CN + "cn('flex-1', 'grow-0');",
		errors: repeat(conflictCn('flex-1, grow-0'), 2)
	},
	{
		code: IMPORT_CN + "cn('flex-auto', 'basis-4');",
		errors: repeat(conflictCn('basis-4, flex-auto'), 2)
	},
	{
		// The bare `grow`/`shrink` defaults participate in the overlap too.
		code: IMPORT_CN + "cn('flex-none', 'shrink');",
		errors: repeat(conflictCn('flex-none, shrink'), 2)
	},
	{
		// The sizing shorthand bridges every present longhand into one group.
		code: IMPORT_CN + "cn('flex-1', 'grow-0', 'shrink-0');",
		errors: repeat(conflictCn('flex-1, grow-0, shrink-0'), 3)
	},
	{
		// Tailwind v3's `flex-grow-*` is the same property as `grow-*`.
		code: IMPORT_CN + "cn('flex-grow-0', 'grow');",
		errors: repeat(conflictCn('flex-grow-0, grow'), 2)
	},
	{
		code: IMPORT_CN + "cn('flex-shrink-0', 'shrink-0');",
		errors: repeat(conflictCn('flex-shrink-0, shrink-0'), 2)
	},
	{
		code: IMPORT_CN + "cn('flex-basis-0', 'basis-1/2');",
		errors: repeat(conflictCn('basis-1/2, flex-basis-0'), 2)
	},
	{
		// And the sizing shorthand reaches the v3 longhands the same way.
		code: IMPORT_CN + "cn('flex-1', 'flex-grow-0');",
		errors: repeat(conflictCn('flex-1, flex-grow-0'), 2)
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
		code:
			IMPORT_CN +
			"cn('px-2 py-1', isActive && 'px-4', { 'text-red-500': hasError });",
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
	},
	{
		// Two drop-shadow sizes conflict.
		code: IMPORT_CN + "cn('drop-shadow-sm', 'drop-shadow-md');",
		errors: repeat(conflictCn('drop-shadow-md, drop-shadow-sm'), 2)
	},
	{
		// Two drop-shadow colors conflict.
		code: IMPORT_CN + "cn('drop-shadow-red-500', 'drop-shadow-blue-500');",
		errors: repeat(
			conflictCn('drop-shadow-blue-500, drop-shadow-red-500'),
			2
		)
	},
	{
		// Two transform rendering hints conflict.
		code: IMPORT_CN + "cn('transform-gpu', 'transform-cpu');",
		errors: repeat(conflictCn('transform-cpu, transform-gpu'), 2)
	},
	{
		// Two transform-style values conflict.
		code: IMPORT_CN + "cn('transform-3d', 'transform-flat');",
		errors: repeat(conflictCn('transform-3d, transform-flat'), 2)
	},
	{
		// A single-segment and a hyphenated color-scheme value conflict, even
		// though they have different dash counts.
		code: IMPORT_CN + "cn('scheme-dark', 'scheme-only-dark');",
		errors: repeat(conflictCn('scheme-dark, scheme-only-dark'), 2)
	},
	{
		// break-normal, break-words, break-all, and break-keep are all
		// word-break values, so any two of them conflict.
		code: IMPORT_CN + "cn('break-words', 'break-all');",
		errors: repeat(conflictCn('break-all, break-words'), 2)
	},
	{
		code: IMPORT_CN + "cn('break-normal', 'break-keep');",
		errors: repeat(conflictCn('break-keep, break-normal'), 2)
	},
	{
		// stroke-none sets the stroke color, so it conflicts with another
		// stroke color rather than a stroke width.
		code: IMPORT_CN + "cn('stroke-none', 'stroke-red-500');",
		errors: repeat(conflictCn('stroke-none, stroke-red-500'), 2)
	},
	{
		// divide-hidden is a divide-style keyword, so it conflicts with another
		// divide-style value.
		code: IMPORT_CN + "cn('divide-hidden', 'divide-solid');",
		errors: repeat(conflictCn('divide-hidden, divide-solid'), 2)
	},
	{
		// Two font-stretch values conflict.
		code: IMPORT_CN + "cn('font-stretch-condensed', 'font-stretch-50%');",
		errors: repeat(
			conflictCn('font-stretch-50%, font-stretch-condensed'),
			2
		)
	},
	{
		// Two align-items values conflict.
		code: IMPORT_CN + "cn('items-center', 'items-start');",
		errors: repeat(conflictCn('items-center, items-start'), 2)
	},
	{
		// Two align-self values conflict, including the `-safe` v4.1 variant.
		code: IMPORT_CN + "cn('self-end', 'self-end-safe');",
		errors: repeat(conflictCn('self-end, self-end-safe'), 2)
	},
	{
		// Two inline-size values conflict.
		code: IMPORT_CN + "cn('inline-4', 'inline-full');",
		errors: repeat(conflictCn('inline-4, inline-full'), 2)
	},
	{
		// Two inline display keywords conflict with each other.
		code: IMPORT_CN + "cn('inline-flex', 'inline-table');",
		errors: repeat(conflictCn('inline-flex, inline-table'), 2)
	},
	{
		// Two block-size values conflict.
		code: IMPORT_CN + "cn('block-full', 'block-4');",
		errors: repeat(conflictCn('block-4, block-full'), 2)
	},
	{
		// Two transition-property values conflict.
		code: IMPORT_CN + "cn('transition-colors', 'transition-none');",
		errors: repeat(conflictCn('transition-colors, transition-none'), 2)
	},
	{
		// Two transition-behavior values conflict.
		code: IMPORT_CN + "cn('transition-normal', 'transition-discrete');",
		errors: repeat(conflictCn('transition-discrete, transition-normal'), 2)
	},
	{
		// Two overflow-wrap values conflict, despite differing dash counts.
		code: IMPORT_CN + "cn('wrap-break-word', 'wrap-anywhere');",
		errors: repeat(conflictCn('wrap-anywhere, wrap-break-word'), 2)
	},
	{
		// col-auto, col-span-*, and a bare col-3 are one classGroup.
		code: IMPORT_CN + "cn('col-auto', 'col-span-3');",
		errors: repeat(conflictCn('col-auto, col-span-3'), 2)
	},
	{
		code: IMPORT_CN + "cn('col-3', 'col-span-full');",
		errors: repeat(conflictCn('col-3, col-span-full'), 2)
	},
	{
		code: IMPORT_CN + "cn('row-auto', 'row-span-2');",
		errors: repeat(conflictCn('row-auto, row-span-2'), 2)
	},
	{
		// `inset-s-*` is tailwind-merge's own alias for `start-*` — the same
		// classGroup — so they conflict directly.
		code: IMPORT_CN + "cn('inset-s-4', 'start-2');",
		errors: repeat(conflictCn('inset-s-4, start-2'), 2)
	},
	{
		code: IMPORT_CN + "cn('inset-e-4', 'end-2');",
		errors: repeat(conflictCn('end-2, inset-e-4'), 2)
	},
	{
		// Two font-feature-settings values conflict, distinct from weight and
		// family.
		code: IMPORT_CN + "cn('font-features-[10px]', 'font-features-[20px]');",
		errors: repeat(
			conflictCn('font-features-[10px], font-features-[20px]'),
			2
		)
	},
	{
		// Two mix-blend-mode values conflict, regardless of keyword segment
		// count.
		code: IMPORT_CN + "cn('mix-blend-normal', 'mix-blend-color-dodge');",
		errors: repeat(conflictCn('mix-blend-color-dodge, mix-blend-normal'), 2)
	},
	{
		// Two perspective-origin values conflict, regardless of keyword
		// segment count.
		code:
			IMPORT_CN +
			"cn('perspective-origin-center', 'perspective-origin-top-left');",
		errors: repeat(
			conflictCn(
				'perspective-origin-center, perspective-origin-top-left'
			),
			2
		)
	},
	{
		// A separator written as an escape still separates two classes — the
		// cooked value is what the browser sees, so that's what gets tokenized.
		// Both tokens are reported at the whole literal, as one report.
		code: IMPORT_CN + "cn('w-1\\u0020w-2');",
		errors: [conflictCn('w-1, w-2')]
	},
	{
		code: IMPORT_CN + "cn('w-1\\x20w-2');",
		errors: [conflictCn('w-1, w-2')]
	},
	{
		// An escaped separator inside a template literal behaves the same.
		code: IMPORT_CN + 'cn(`w-1\\u0020w-2`);',
		errors: [conflictCn('w-1, w-2')]
	},
	{
		// An escape inside the token itself is decoded for
		// identity too, so the class matches its plainly-written
		// twin and is named as the browser sees it.
		code: IMPORT_CN + "cn('w-\\u0031', 'w-2');",
		errors: repeat(conflictCn('w-1, w-2'), 2)
	},
	{
		// A line continuation cooks away entirely, joining
		// the two halves into one class — so this is the
		// same class twice, not a stray backslash token.
		code: IMPORT_CN + "cn('fl\\\nex', 'flex');",
		errors: repeat(dupCn('flex'), 2)
	},
	{
		// The static parts of a ternary-bearing template are tokenized the same
		// way.
		code:
			IMPORT_CN + "cn(`w-1\\u0020w-2 ${col ? 'flex-col' : 'flex-row'}`);",
		errors: [conflictCn('w-1, w-2')]
	},
	{
		// A namespace member call is analyzed like the named import.
		code: IMPORT_NS + "SV.sv({ base: 'w-1 w-2' });",
		errors: repeat(conflict('w-1, w-2'), 2)
	},
	{
		code: IMPORT_NS + "SV.cn('w-1', 'w-2');",
		errors: repeat(conflictCn('w-1, w-2'), 2)
	},
	{
		// Optionally-chained too.
		code: IMPORT_NS + "SV?.sv({ base: 'w-1 w-2' });",
		errors: repeat(conflict('w-1, w-2'), 2)
	},
	{
		// A namespace `createSV()` validates its defaults, and the binding it
		// returns is analyzed like `sv`.
		code: IMPORT_NS + "SV.createSV({ base: 'w-1 w-2' });",
		errors: repeat(conflict('w-1, w-2'), 2)
	},
	{
		code:
			IMPORT_NS +
			'const custom = SV.createSV({ cacheSize: 8 });\n' +
			"custom({ base: 'w-1 w-2' });",
		errors: repeat(conflict('w-1, w-2'), 2)
	},
	{
		// Two prefixed values of one property still conflict.
		code: IMPORT + "sv({ base: 'tw-w-4 tw-w-8' });",
		options: [{ prefix: 'tw-' }],
		errors: repeat(conflict('tw-w-4, tw-w-8'), 2)
	},
	{
		// v3 puts the negative marker before the prefix.
		code: IMPORT + "sv({ base: '-tw-mt-2 tw-mt-4' });",
		options: [{ prefix: 'tw-' }],
		errors: repeat(conflict('-tw-mt-2, tw-mt-4'), 2)
	},
	{
		// A prefix written without its trailing `-` means the same thing.
		code: IMPORT + "sv({ base: 'tw-w-4 tw-w-8' });",
		options: [{ prefix: 'tw' }],
		errors: repeat(conflict('tw-w-4, tw-w-8'), 2)
	},
	{
		// The shorthand/longhand overlaps read the stripped namespace too.
		code: IMPORT + "sv({ base: 'tw-size-4 tw-w-8' });",
		options: [{ prefix: 'tw-' }],
		errors: repeat(conflict('tw-size-4, tw-w-8'), 2)
	},
	{
		// So does the exclusive-group lookup, which lists unprefixed utilities.
		code: IMPORT + "sv({ base: 'tw-flex tw-block' });",
		options: [{ prefix: 'tw-', exclusiveGroups: true }],
		errors: repeat(conflict('tw-block, tw-flex'), 2)
	},
	{
		// An unprefixed token takes no part in the namespace analysis, but an
		// exact repeat of one is still a duplicate.
		code: IMPORT_CN + "cn('card-body', 'card-body');",
		options: [{ prefix: 'tw-' }],
		errors: repeat(dupCn('card-body'), 2)
	}
];