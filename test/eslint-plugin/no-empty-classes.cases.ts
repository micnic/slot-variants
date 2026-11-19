import { IMPORT, IMPORT_CN, IMPORT_CREATE_SV, IMPORT_NS } from './helpers.ts';

export const NO_EMPTY_CLASSES_VALID = [
	// An empty object is an empty config, as `sv()` reads it at runtime, not
	// an empty class record.
	// An empty `variants` or `slots` is kept while it's what makes the object
	// a config.
	IMPORT + 'sv({ variants: {} });',
	IMPORT + "sv({ base: 'flex', slots: {} });",
	IMPORT + "const none = {};\nsv({ base: 'a', variants: none });",
	IMPORT + "sv('flex', { variants: {} });",
	// Non-empty cn-style call.
	IMPORT + "sv('flex', 'items-center');",
	// Non-empty config.
	IMPORT + "sv({ base: 'flex', variants: {} });",
	// Non-empty array, no empty elements.
	IMPORT + "sv({ base: ['flex', 'gap-2'], variants: {} });",
	// Sparse hole in array — skipped.
	IMPORT + "sv({ base: ['flex', , 'gap-2'], variants: {} });",
	// Spread element inside array — skipped.
	IMPORT + "sv({ base: ['flex', ...rest], variants: {} });",
	// Non-empty template literal.
	IMPORT + 'sv({ base: `flex`, variants: {} });',
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
	IMPORT + 'sv({ variants: {}, compoundVariants: dynamic });',
	// Non-empty variants record.
	IMPORT + "sv({ variants: { size: { sm: 'text-sm', lg: 'text-lg' } } });",
	// Boolean shorthand variant with non-empty class.
	IMPORT + "sv({ variants: { disabled: 'opacity-50' } });",
	// Slot object under `true` with a non-empty class.
	IMPORT +
		"sv({ slots: { body: 'p-4' }, variants: { disabled: { true: { body: 'opacity-50' } } } });",
	// compoundVariants with non-empty class.
	IMPORT +
		`sv({
			variants: { size: { sm: 'text-sm', lg: 'text-lg' } },
			compoundVariants: [{ size: 'lg', class: 'font-bold' }]
		});`,
	// Slot-keyed compoundVariants class record with non-empty values.
	IMPORT +
		`sv({
			slots: { body: 'p-4' },
			variants: { size: { sm: 'text-sm' } },
			compoundVariants: [{ size: 'sm', class: { body: 'font-bold' } }]
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
	// Non-empty array matcher on a compoundVariants entry — can match.
	IMPORT +
		`sv({
			variants: { size: { sm: 'text-sm', lg: 'text-lg' } },
			compoundVariants: [{ size: ['sm', 'lg'], class: 'font-bold' }]
		});`,
	// The `slots` target array on a compoundSlots entry is a meta key, not
	// a matcher — an empty array there is a TS-level error, not something
	// this rule checks; a non-empty matcher alongside it is unaffected.
	IMPORT +
		`sv({
			slots: { body: 'p-4' },
			variants: { size: { sm: 'text-sm' } },
			compoundSlots: [{ slots: ['body'], size: 'sm', class: 'font-bold' }]
		});`,
	// Computed matcher key with an empty array value — the key is
	// dynamic, so the value isn't checked as a matcher.
	IMPORT +
		`sv({
			variants: { size: { sm: 'text-sm' } },
			compoundVariants: [{ [k]: [], class: 'font-bold' }]
		});`,
	// cn-style record with non-empty keys.
	IMPORT_CN + 'cn({ foo: true, bar: false });',
	// cn-style record with a non-empty string-literal key.
	IMPORT_CN + "cn({ 'px-2': cond });",
	// cn-style record with a computed key — skipped, not an empty class.
	IMPORT_CN + 'cn({ [k]: cond });',
	// Spread in a clsx record is skipped; other keys are still checked.
	IMPORT_CN + 'cn({ ...rest, foo: true });',
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
	// Non-class config keys carrying a value are not validated.
	IMPORT +
		`sv({
			base: 'flex',
			variants: { size: { sm: 'text-sm', lg: 'text-lg' } },
			defaultVariants: { size: 'sm' },
			requiredVariants: true,
			multiSlots: false,
			presets: { fancy: { size: 'lg' } },
			postProcess: noop
		});`,
	// A dynamic value can't be seen into.
	IMPORT + "sv({ base: 'flex', variants: {}, defaultVariants: opts });",
	// A non-empty preset selection is left alone.
	IMPORT + "sv({ base: 'flex', variants: {}, presets: { fancy: {} } });",
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
	IMPORT + "sv({ 'base': 'flex', 'slots': { 'body': 'p-4' } });",
	// createSV() with no defaults is a valid factory call, not an empty call.
	IMPORT_CREATE_SV + 'createSV();',
	// createSV() with an empty defaults object carries no class value.
	IMPORT_CREATE_SV + 'createSV({});',
	// A createSV() factory config with non-empty class values.
	IMPORT_CREATE_SV + "createSV({ base: 'flex' });",
	// A spread in a createSV() factory config is skipped (dynamic, not empty).
	IMPORT_CREATE_SV + "createSV({ ...rest, base: 'flex' });",
	// A computed key in a createSV() factory config is skipped.
	IMPORT_CREATE_SV + "createSV({ [k]: 'x', base: 'flex' });",
	// Keys named like `Object.prototype` members are no config keys either.
	IMPORT_CREATE_SV +
		"createSV({ toString: 'x', __defineGetter__: 'y', constructor: [] });",
	// Non-empty `&&` right operand.
	IMPORT_CN + "cn(isActive && 'flex');",
	// Non-empty ternary branches.
	IMPORT_CN + "cn(isActive ? 'flex' : 'block');",
	// A hoisted `const` non-empty-string alias.
	IMPORT_CN + "const cls = 'flex';\ncn(cls);",
	// An empty string is a meaningful "this value adds no classes" variant
	// declaration, the same way it is for a slot.
	IMPORT + "sv({ variants: { size: { sm: '', lg: 'text-lg' } } });",
	// The same allowance in the slot-keyed variant value form.
	IMPORT +
		"sv({ slots: { body: 'p-4' }, variants: { size: { sm: { body: '' } } } });",
	// And in a boolean-shorthand variant value.
	IMPORT + "sv({ variants: { disabled: '' } });",
	// An empty string reached through a hoisted `const` alias.
	IMPORT + "const none = '';\nsv({ variants: { size: { sm: none } } });"
];

export const NO_EMPTY_CLASSES_INVALID = [
	{
		// Removing the last argument would leave an object defining `variants`
		// last, turning the class list into a config call: no fix.
		code: IMPORT + "sv({ base: 'x', variants: {} }, '');",
		errors: [{ messageId: 'emptyString' }],
		output: null
	},
	{
		// An object of other config key names stays a class record once last.
		code: IMPORT + "sv({ base: 'x' }, '');",
		errors: [{ messageId: 'emptyString' }],
		output: IMPORT + "sv({ base: 'x' });"
	},
	{
		// An object of other keys stays a class record once last.
		code: IMPORT + "sv({ flex: true }, '');",
		errors: [{ messageId: 'emptyString' }],
		output: IMPORT + 'sv({ flex: true });'
	},
	{
		// `cn()` never reads a config, so its last argument is removed.
		code: IMPORT_CN + "cn({ base: 'x' }, '');",
		errors: [{ messageId: 'emptyString' }],
		output: IMPORT_CN + "cn({ base: 'x' });"
	},
	{
		// The parentheses around an element are removed with it.
		code: IMPORT_CN + "cn('a', (''), 'b');",
		output: IMPORT_CN + "cn('a', 'b');",
		errors: [{ messageId: 'emptyString' }]
	},
	{
		code: IMPORT_CN + "cn('a', (''));",
		output: IMPORT_CN + "cn('a');",
		errors: [{ messageId: 'emptyString' }]
	},
	{
		code: IMPORT_CN + "cn(((''  )), 'a');",
		output: IMPORT_CN + "cn('a');",
		errors: [{ messageId: 'emptyString' }]
	},
	{
		// The last element before a trailing comma takes the whitespace
		// around its comma.
		code: IMPORT_CN + "cn('a', '',);",
		output: IMPORT_CN + "cn('a',);",
		errors: [{ messageId: 'emptyString' }]
	},
	{
		code: IMPORT + "sv({ base: ['a', '' , ], variants: {} });",
		output: IMPORT + "sv({ base: ['a',], variants: {} });",
		errors: [{ messageId: 'emptyString' }]
	},
	{
		// A comment in the removed range would be lost, so there's no fix.
		code: IMPORT_CN + "cn('flex', '' /* keep */, 'block');",
		output: null,
		errors: [{ messageId: 'emptyString' }]
	},
	{
		code: IMPORT_CN + "cn('flex', /* keep */ '');",
		output: null,
		errors: [{ messageId: 'emptyString' }]
	},
	{
		// The allowance covers empty strings only — an empty array still
		// contributes nothing while looking like a class list.
		code: IMPORT + "sv({ variants: { size: { sm: [], lg: 'text-lg' } } });",
		errors: [{ messageId: 'emptyArray' }]
	},
	{
		// The allowance is scoped to a direct variant value — an empty string
		// inside an array is not one.
		code: IMPORT + "sv({ variants: { size: { sm: ['text-sm', ''] } } });",
		output: IMPORT + "sv({ variants: { size: { sm: ['text-sm'] } } });",
		errors: [{ messageId: 'emptyString' }]
	},
	{
		// Nor is a compound class value.
		code:
			IMPORT +
			"sv({ variants: { size: { sm: 'text-sm' } }, compoundVariants: [{ size: 'sm', class: '' }] });",
		errors: [{ messageId: 'emptyString' }]
	},
	{
		// A config container that holds no class values of its own is
		// inert when empty, so the property is reported and removed.
		code:
			IMPORT + "sv({ base: 'flex', variants: {}, defaultVariants: {} });",
		output: IMPORT + "sv({ base: 'flex', variants: {} });",
		errors: [{ messageId: 'emptyConfig', data: { key: 'defaultVariants' } }]
	},
	{
		code:
			IMPORT +
			"sv({ base: 'flex', variants: {}, requiredVariants: [] });",
		output: IMPORT + "sv({ base: 'flex', variants: {} });",
		errors: [
			{ messageId: 'emptyConfig', data: { key: 'requiredVariants' } }
		]
	},
	{
		code: IMPORT + "sv({ base: 'flex', multiSlots: [], variants: {} });",
		output: IMPORT + "sv({ base: 'flex', variants: {} });",
		errors: [{ messageId: 'emptyConfig', data: { key: 'multiSlots' } }]
	},
	{
		code: IMPORT + "sv({ base: 'flex', variants: {}, presets: {} });",
		output: IMPORT + "sv({ base: 'flex', variants: {} });",
		errors: [{ messageId: 'emptyConfig', data: { key: 'presets' } }]
	},
	{
		code: IMPORT + "sv({ base: 'flex', groups: {}, variants: {} });",
		output: IMPORT + "sv({ base: 'flex', variants: {} });",
		errors: [{ messageId: 'emptyConfig', data: { key: 'groups' } }]
	},
	{
		// The empty container is removed, leaving the `variants` that make the
		// object a config.
		code: IMPORT + 'sv({ variants: {}, defaultVariants: {} });',
		output: IMPORT + 'sv({ variants: {} });',
		errors: [{ messageId: 'emptyConfig', data: { key: 'defaultVariants' } }]
	},
	{
		// With both markers empty, `variants` is kept to leave the object a
		// config rather than a class record.
		code: IMPORT + "sv({ slots: {}, base: 'p-2', variants: {} });",
		output: IMPORT + "sv({ base: 'p-2', variants: {} });",
		errors: [{ messageId: 'emptyObject' }]
	},
	{
		code: IMPORT + "sv({ variants: {}, base: 'p-2', slots: {} });",
		output: IMPORT + "sv({ variants: {}, base: 'p-2' });",
		errors: [{ messageId: 'emptyObject' }]
	},
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
		// Empty template literal as cn-style sv argument.
		code: IMPORT + 'sv(``);',
		errors: [{ messageId: 'emptyString' }]
	},
	{
		// A namespace member call is analyzed like the named import.
		code: IMPORT_NS + "SV.sv({ base: '', variants: {} });",
		output: IMPORT_NS + 'SV.sv({ variants: {} });',
		errors: [{ messageId: 'emptyString' }]
	},
	{
		// Empty string inside an array argument. The removal takes
		// the separator after it, so no double space is left behind.
		code: IMPORT + "sv(['', 'flex']);",
		output: IMPORT + "sv(['flex']);",
		errors: [{ messageId: 'emptyString' }]
	},
	{
		// A middle element, where the stray
		// space would sit between the survivors.
		code: IMPORT + "sv(['flex', '', 'gap-2']);",
		output: IMPORT + "sv(['flex', 'gap-2']);",
		errors: [{ messageId: 'emptyString' }]
	},
	{
		// An element on its own line takes the line break and indentation that
		// introduce it instead, so no blank, indent-only line is left behind.
		code: IMPORT + "sv([\n\t'flex',\n\t'',\n\t'gap-2'\n]);",
		output: IMPORT + "sv([\n\t'flex',\n\t'gap-2'\n]);",
		errors: [{ messageId: 'emptyString' }]
	},
	{
		// Same for the first element of a multi-line list.
		code: IMPORT + "sv([\n\t'',\n\t'flex'\n]);",
		output: IMPORT + "sv([\n\t'flex'\n]);",
		errors: [{ messageId: 'emptyString' }]
	},
	{
		// The last element of a line takes the whitespace before it instead,
		// so no trailing whitespace is left behind.
		code: IMPORT_CN + "cn('a', '',\n\t'b');",
		output: IMPORT_CN + "cn('a',\n\t'b');",
		errors: [{ messageId: 'emptyString' }]
	},
	{
		// The same before a CRLF line break.
		code: IMPORT_CN + "cn('a', '',\r\n\t'b');",
		output: IMPORT_CN + "cn('a',\r\n\t'b');",
		errors: [{ messageId: 'emptyString' }]
	},
	{
		// A comment after the comma keeps the element's line going, so only
		// the element and its comma go.
		code: IMPORT_CN + "cn('a', '', /* c */\n\t'b');",
		output: IMPORT_CN + "cn('a', /* c */\n\t'b');",
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
		output: IMPORT + "sv([['flex']]);",
		errors: [{ messageId: 'emptyString' }]
	},
	{
		// Empty string as base.
		code: IMPORT + "sv({ base: '', variants: {} });",
		output: IMPORT + 'sv({ variants: {} });',
		errors: [{ messageId: 'emptyString' }]
	},
	{
		// Empty array as base.
		code: IMPORT + 'sv({ base: [], variants: {} });',
		output: IMPORT + 'sv({ variants: {} });',
		errors: [{ messageId: 'emptyArray' }]
	},
	{
		// Empty object as base.
		code: IMPORT + 'sv({ base: {}, variants: {} });',
		output: IMPORT + 'sv({ variants: {} });',
		errors: [{ messageId: 'emptyObject' }]
	},
	{
		// Empty string inside a base array.
		code: IMPORT + "sv({ base: ['', 'flex'], variants: {} });",
		output: IMPORT + "sv({ base: ['flex'], variants: {} });",
		errors: [{ messageId: 'emptyString' }]
	},
	{
		// Empty slots object beside the variants that make the object a config —
		// the whole property is removed.
		code:
			IMPORT + "sv({ base: 'flex', slots: {}, variants: { on: 'x' } });",
		output: IMPORT + "sv({ base: 'flex', variants: { on: 'x' } });",
		errors: [{ messageId: 'emptyObject' }]
	},
	{
		// Empty base alongside other keys — the property is dropped.
		code: IMPORT + "sv({ base: '', variants: { size: { sm: 'a' } } });",
		output: IMPORT + "sv({ variants: { size: { sm: 'a' } } });",
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
		// Empty variants object beside the slots that make the object a config.
		code: IMPORT + "sv({ slots: { a: 'x' }, variants: {} });",
		output: IMPORT + "sv({ slots: { a: 'x' } });",
		errors: [{ messageId: 'emptyObject' }]
	},
	{
		// Empty variant value record.
		code: IMPORT + 'sv({ variants: { size: {} } });',
		errors: [{ messageId: 'emptyObject' }]
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
		// Empty record as a compoundVariants class.
		code:
			IMPORT +
			`sv({
				slots: { body: 'p-4' },
				variants: { size: { sm: 'text-sm' } },
				compoundVariants: [{ size: 'sm', class: {} }]
			});`,
		errors: [{ messageId: 'emptyObject' }]
	},
	{
		// Empty string inside a slot-keyed compoundVariants class record.
		code:
			IMPORT +
			`sv({
				slots: { body: 'p-4' },
				variants: { size: { sm: 'text-sm' } },
				compoundVariants: [{ size: 'sm', class: { body: '' } }]
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
		// Empty array matcher on a compoundVariants entry could never match,
		// so sv() throws for the config.
		code:
			IMPORT +
			`sv({
				variants: { size: { sm: 'text-sm', lg: 'text-lg' } },
				compoundVariants: [{ size: [], class: 'font-bold' }]
			});`,
		errors: [{ messageId: 'emptyMatcher' }]
	},
	{
		// Empty array matcher on a compoundSlots entry.
		code:
			IMPORT +
			`sv({
				slots: { body: 'p-4' },
				variants: { size: { sm: 'text-sm', lg: 'text-lg' } },
				compoundSlots: [{ slots: ['body'], size: [], class: 'font-bold' }]
			});`,
		errors: [{ messageId: 'emptyMatcher' }]
	},
	{
		// A hoisted `const` empty array read through as a matcher value.
		code:
			IMPORT +
			`const noSizes = [];
			sv({
				variants: { size: { sm: 'text-sm', lg: 'text-lg' } },
				compoundVariants: [{ size: noSizes, class: 'font-bold' }]
			});`,
		errors: [{ messageId: 'emptyMatcher', line: 5, column: 32 }]
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
		// Multiple empties reported in a single call. Only the non-overlapping
		// fixes apply in one pass; the rest are reported again on the next.
		code: IMPORT_CN + "cn('', [], {});",
		output: IMPORT_CN + 'cn([]);',
		errors: [
			{ messageId: 'emptyString' },
			{ messageId: 'emptyArray' },
			{ messageId: 'emptyObject' }
		]
	},
	{
		// Empty string as a base arg with config.
		code: IMPORT + "sv('', { base: 'flex', variants: {} });",
		output: IMPORT + "sv({ base: 'flex', variants: {} });",
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
	},
	{
		// Empty string key in a clsx-style record — an empty class string.
		code: IMPORT_CN + "cn({ '': cond });",
		errors: [{ messageId: 'emptyString' }]
	},
	{
		// Empty record key nested inside a cn array argument.
		code: IMPORT_CN + "cn(['flex', { '': x }]);",
		errors: [{ messageId: 'emptyString' }]
	},
	{
		// An empty class value in a createSV() factory config is flagged.
		code: IMPORT_CREATE_SV + "createSV({ base: '' });",
		errors: [{ messageId: 'emptyString' }]
	},
	{
		// Empty string as the `&&` right operand — the condition's left
		// side is a runtime check, not the class value.
		code: IMPORT_CN + "cn(isActive && '');",
		errors: [{ messageId: 'emptyString' }]
	},
	{
		// Empty string in a ternary branch.
		code: IMPORT_CN + "cn(isActive ? '' : 'foo');",
		errors: [{ messageId: 'emptyString' }]
	},
	{
		// Empty string in both ternary branches — reported once per branch.
		code: IMPORT_CN + "cn(isActive ? '' : '');",
		errors: [{ messageId: 'emptyString' }, { messageId: 'emptyString' }]
	},
	{
		// A hoisted `const` empty-string alias read through as a cn argument,
		// reported where it's used.
		code: IMPORT_CN + "const cls = '';\ncn(cls);",
		errors: [{ messageId: 'emptyString', line: 3, column: 4 }]
	},
	{
		// Each use of a shared empty `const` is reported and removed on its
		// own; the declaration is left for no-unused-vars.
		code: IMPORT_CN + "const none = '';\ncn('a', none);\ncn('b', none);",
		output: IMPORT_CN + "const none = '';\ncn('a');\ncn('b');",
		errors: [
			{ messageId: 'emptyString', line: 3 },
			{ messageId: 'emptyString', line: 4 }
		]
	},
	{
		// The same for an empty array behind a `const`.
		code: IMPORT_CN + "const none = [];\ncn('a', none);",
		output: IMPORT_CN + "const none = [];\ncn('a');",
		errors: [{ messageId: 'emptyArray', line: 3, column: 9 }]
	},
	{
		// An empty `base` behind a `const` is reported in each config that
		// uses it, where the fix removes it.
		code:
			IMPORT +
			"const none = [];\nsv({ base: none, slots: { a: 'x' } });\nsv({ base: none, slots: { b: 'y' } });",
		output:
			IMPORT +
			"const none = [];\nsv({ slots: { a: 'x' } });\nsv({ slots: { b: 'y' } });",
		errors: [
			{ messageId: 'emptyArray', line: 3, column: 12 },
			{ messageId: 'emptyArray', line: 4, column: 12 }
		]
	},
	{
		// An empty config container behind a `const`, reported where it's used.
		code:
			IMPORT +
			"const none = {};\nsv({ base: 'a', variants: {}, defaultVariants: none });",
		output: IMPORT + "const none = {};\nsv({ base: 'a', variants: {} });",
		errors: [{ messageId: 'emptyConfig', line: 3, column: 48 }]
	},
	{
		// An empty `variants` record behind a `const`, beside slots.
		code:
			IMPORT +
			"const none = {};\nsv({ base: 'a', slots: { b: 'x' }, variants: none });",
		output:
			IMPORT + "const none = {};\nsv({ base: 'a', slots: { b: 'x' } });",
		errors: [{ messageId: 'emptyObject', line: 3, column: 46 }]
	},
	{
		// An empty compound list behind a `const`.
		code:
			IMPORT +
			"const none = [];\nsv({ base: 'a', variants: {}, compoundVariants: none });",
		output: IMPORT + "const none = [];\nsv({ base: 'a', variants: {} });",
		errors: [{ messageId: 'emptyArray', line: 3, column: 49 }]
	},
	{
		// Empty variant values and value records behind a `const`.
		code:
			IMPORT +
			"const none = [];\nconst empty = {};\nsv({ variants: { size: { sm: none, lg: 'x' }, tone: empty } });",
		errors: [
			{ messageId: 'emptyArray', line: 4, column: 30 },
			{ messageId: 'emptyObject', line: 4, column: 53 }
		]
	},
	{
		// Empty compound classes behind a `const`, as a value and as a slot
		// record.
		code:
			IMPORT +
			"const none = [];\nconst empty = {};\nsv({ variants: { size: { sm: 'a', lg: 'b' } }, compoundVariants: [{ size: 'sm', class: none }, { size: 'lg', class: empty }] });",
		errors: [
			{ messageId: 'emptyArray', line: 4, column: 88 },
			{ messageId: 'emptyObject', line: 4, column: 117 }
		]
	},
	{
		// Empty string as the `&&` right operand alongside another arg —
		// the whole arg is removed on --fix.
		code: IMPORT_CN + "cn('flex', isActive && '');",
		output: IMPORT_CN + "cn('flex');",
		errors: [{ messageId: 'emptyString' }]
	},
	{
		// Empty string in one ternary branch alongside another arg — removing
		// the whole arg would drop the other branch's classes, so no fix.
		code: IMPORT_CN + "cn('flex', isActive ? '' : 'foo');",
		output: null,
		errors: [{ messageId: 'emptyString' }]
	},
	{
		// The same, with the empty string in the alternate branch.
		code: IMPORT_CN + "cn('flex', isActive ? 'foo' : '');",
		output: null,
		errors: [{ messageId: 'emptyString' }]
	},
	{
		// The same, as an array element.
		code: IMPORT_CN + "cn(['flex', isActive ? '' : 'foo']);",
		output: null,
		errors: [{ messageId: 'emptyString' }]
	},
	{
		// Empty string in both ternary branches alongside another arg — the
		// arg applies no classes either way, so it's removed on --fix.
		code: IMPORT_CN + "cn('flex', isActive ? '' : '');",
		output: IMPORT_CN + "cn('flex');",
		errors: [{ messageId: 'emptyString' }, { messageId: 'emptyString' }]
	},
	{
		// A `const` empty-string alias counts as an empty branch, reported
		// in the branch that reads it.
		code: IMPORT_CN + "const none = '';\ncn('flex', isActive ? none : '');",
		output: IMPORT_CN + "const none = '';\ncn('flex');",
		errors: [
			{ messageId: 'emptyString', line: 3, column: 23 },
			{ messageId: 'emptyString', line: 3, column: 30 }
		]
	}
];