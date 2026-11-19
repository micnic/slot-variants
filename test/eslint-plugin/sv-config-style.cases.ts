import { IMPORT, IMPORT_CN, IMPORT_CREATE_SV } from './helpers.ts';

export const SV_CONFIG_STYLE_ORDER_VALID = [
	{
		code:
			IMPORT +
			"sv({ base: 'flex', variants: { size: { sm: 'text-sm' } } });"
	},
	{
		code:
			IMPORT +
			"sv({ base: 'flex', slots: { icon: 'w-4' }, groups: { all: ['icon'] }, multiSlots: true, variants: { size: { sm: 'text-sm' } }, presets: {}, compoundSlots: [], compoundVariants: [], defaultVariants: { size: 'sm' }, requiredVariants: { size: true }, cacheSize: 10, introspection: true, postProcess: (c) => c });"
	},
	{
		// Single property stays as-is.
		code: IMPORT + "sv({ base: 'flex', variants: {} });"
	},
	{
		// Three properties in order.
		code:
			IMPORT +
			"sv({ base: 'flex', slots: { body: 'p-4' }, variants: { size: { sm: 'text-sm' } } });"
	},
	{
		// `extend` comes first.
		code:
			IMPORT +
			"const parent = sv({ base: 'btn', variants: {} });\nsv({ extend: parent, base: 'flex', variants: { size: { sm: 'text-sm' } } });"
	}
];

export const SV_CONFIG_STYLE_ORDER_INVALID = [
	{
		// `extend` placed after another key moves to the front.
		code:
			IMPORT +
			"const parent = sv({ base: 'btn', variants: {} });\nsv({ base: 'flex', extend: parent, variants: {} });",
		errors: [
			{
				messageId: 'wrongOrder',
				data: { key: 'extend', before: 'base' }
			}
		],
		output:
			IMPORT +
			"const parent = sv({ base: 'btn', variants: {} });\nsv({ extend: parent, base: 'flex', variants: {} });"
	},
	{
		// A hoisted config shared by several calls is reported once.
		code: IMPORT + "const c = { variants: {}, base: 'x' };\nsv(c);\nsv(c);",
		errors: [
			{
				messageId: 'wrongOrder',
				data: { key: 'base', before: 'variants' }
			}
		],
		output:
			IMPORT + "const c = { base: 'x', variants: {} };\nsv(c);\nsv(c);"
	},
	{
		code:
			IMPORT +
			"sv({ variants: { size: { sm: 'text-sm' } }, base: 'flex' });",
		errors: [
			{
				messageId: 'wrongOrder',
				data: { key: 'base', before: 'variants' }
			}
		],
		output:
			IMPORT +
			"sv({ base: 'flex', variants: { size: { sm: 'text-sm' } } });"
	},
	{
		// Multiple out-of-order keys each report their own violation.
		code:
			IMPORT +
			"sv({ defaultVariants: { size: 'sm' }, variants: { size: { sm: 'text-sm' } }, base: 'flex' });",
		errors: [
			{
				messageId: 'wrongOrder',
				data: { key: 'variants', before: 'defaultVariants' }
			},
			{
				messageId: 'wrongOrder',
				data: { key: 'base', before: 'defaultVariants' }
			}
		],
		output:
			IMPORT +
			"sv({ base: 'flex', variants: { size: { sm: 'text-sm' } }, defaultVariants: { size: 'sm' } });"
	},
	{
		// An unknown/computed key present anywhere in the object disables
		// the fixer for the whole call, but known-key order is still checked
		// and reported. Note: this uses createSV(), not sv() — a computed
		// key in an sv() config argument makes the shared call-matcher
		// (`matchSvCall` → `isConfigLike` → `getStrictProperties`) refuse to
		// recognize the object as a config at all (it requires every key to
		// be statically readable), so `call.config` would be null and this
		// rule would never see it. `createSV(defaults)` matches its argument
		// more permissively (`matchFactoryCall` only checks that it's an
		// `ObjectExpression`), so a computed key there still reaches this
		// rule — that's the real place this bail-out matters.
		code:
			IMPORT_CREATE_SV +
			"const key = 'variants';\ncreateSV({ variants: { size: { sm: 'text-sm' } }, [key]: 1, base: 'flex' });",
		errors: [
			{
				messageId: 'wrongOrder',
				data: { key: 'base', before: 'variants' }
			}
		]
	},
	{
		// createSV() factory defaults are checked too.
		code:
			IMPORT_CREATE_SV +
			"createSV({ variants: { size: { sm: 'text-sm' } }, base: 'flex' });",
		errors: [
			{
				messageId: 'wrongOrder',
				data: { key: 'base', before: 'variants' }
			}
		],
		output:
			IMPORT_CREATE_SV +
			"createSV({ base: 'flex', variants: { size: { sm: 'text-sm' } } });"
	},
	{
		// An unknown (but non-computed) key also disables the fixer for
		// the whole call while known-key order is still reported. Uses
		// createSV() for the same reason as the computed-key case above.
		code:
			IMPORT_CREATE_SV +
			"createSV({ variants: { size: { sm: 'text-sm' } }, foo: 1, base: 'flex' });",
		errors: [
			{
				messageId: 'wrongOrder',
				data: { key: 'base', before: 'variants' }
			}
		]
	},
	{
		// A spread element inside the config disables the fixer too
		// — the spread's own keys aren't statically known, so moving
		// properties across it could change which value wins.
		code:
			IMPORT_CREATE_SV +
			"const extra = getExtra();\ncreateSV({ variants: { size: { sm: 'text-sm' } }, ...extra, base: 'flex' });",
		errors: [
			{
				messageId: 'wrongOrder',
				data: { key: 'base', before: 'variants' }
			}
		]
	},
	{
		// A comment anywhere inside the config disables the fixer:
		// reattaching it to its moved property isn't attempted.
		code:
			IMPORT +
			"sv({\n\tvariants: { size: { sm: 'text-sm' } },\n\t// keep base last\n\tbase: 'flex'\n});",
		errors: [
			{
				messageId: 'wrongOrder',
				data: { key: 'base', before: 'variants' }
			}
		]
	},
	{
		// Multiple reorderings trigger error for each misplaced key.
		code:
			IMPORT +
			"sv({ variants: { size: { sm: 'text-sm' } }, slots: { body: 'p-4' }, base: 'flex' });",
		errors: [
			{
				messageId: 'wrongOrder',
				data: { key: 'slots', before: 'variants' }
			},
			{
				messageId: 'wrongOrder',
				data: { key: 'base', before: 'variants' }
			}
		],
		output:
			IMPORT +
			"sv({ base: 'flex', slots: { body: 'p-4' }, variants: { size: { sm: 'text-sm' } } });"
	}
];

export const SV_CONFIG_STYLE_BASE_VALID = [
	// Default baseStyle ('field'): base as a config field passes.
	{ code: IMPORT + "sv({ base: 'flex', variants: {} });" },
	// No base classes at all: nothing to check.
	{ code: IMPORT + 'sv({ variants: {} });' },
	// separateArg configured and used.
	{
		code: IMPORT + "sv('flex', { variants: {} });",
		options: [{ baseStyle: 'separateArg' }]
	},
	// slotsBase configured and used.
	{
		code:
			IMPORT +
			"sv({ slots: { base: 'flex', icon: 'w-4' }, variants: {} });",
		options: [{ baseStyle: 'slotsBase' }]
	},
	// The same with a hoisted `slots` record.
	{
		code:
			IMPORT +
			"const slots = { base: 'flex', icon: 'w-4' };\nsv({ slots, variants: {} });",
		options: [{ baseStyle: 'slotsBase' }]
	},
	// A dynamic `slots` value has no record to hold a base, so slotsBase has
	// nothing to require.
	{
		code: IMPORT + "sv('flex', { slots: getSlots(), variants: {} });",
		options: [{ baseStyle: 'slotsBase' }]
	},
	// slotsBase configured but call has no slots at all: skipped entirely, so a
	// plain `base` field isn't flagged either.
	{
		code: IMPORT + "sv({ base: 'flex', variants: {} });",
		options: [{ baseStyle: 'slotsBase' }]
	},
	// cn()-style call: never has a config object, so checkBaseStyle's
	// `call.config` guard is exercised as a no-op.
	{ code: IMPORT_CN + "cn('flex');" },
	// separateArg configured but the config is a createSV() factory default:
	// createSV() takes exactly one argument, so a leading class argument there
	// would be ignored at runtime. The check is skipped entirely rather than
	// reporting an unsatisfiable requirement.
	{
		code: IMPORT_CREATE_SV + "createSV({ base: 'flex', variants: {} });",
		options: [{ baseStyle: 'separateArg' }]
	}
];

export const SV_CONFIG_STYLE_BASE_INVALID = [
	{
		// A spread in `slots` may hold a `base` the moved one would override.
		code: IMPORT + "sv({ base: 'y', slots: { ...s, icon: 'x' } });",
		options: [{ baseStyle: 'slotsBase' }],
		errors: [
			{
				messageId: 'wrongBaseStyle',
				data: {
					style: 'a "base" entry in "slots"',
					found: 'a "base" field in the config'
				}
			}
		],
		output: null
	},
	{
		// The same holds for a leading argument moved into `slots`.
		code: IMPORT + "sv('y', { slots: { ...s, icon: 'x' } });",
		options: [{ baseStyle: 'slotsBase' }],
		errors: [
			{
				messageId: 'wrongBaseStyle',
				data: {
					style: 'a "base" entry in "slots"',
					found: 'a separate leading argument'
				}
			}
		],
		output: null
	},
	{
		// A `base` moved out of `slots` would join one a spread there may hold.
		code: IMPORT + "sv({ slots: { ...s, base: 'y', icon: 'x' } });",
		errors: [
			{
				messageId: 'wrongBaseStyle',
				data: {
					style: 'a "base" field in the config',
					found: 'a "base" entry in "slots"'
				}
			}
		],
		output: null
	},
	{
		// A comment beside the base being moved would be lost, so there's no
		// fix — whether it trails a leading argument or a `base` property.
		code: IMPORT + "sv('flex' /* primary */, { variants: {} });",
		errors: [
			{
				messageId: 'wrongBaseStyle',
				data: {
					style: 'a "base" field in the config',
					found: 'a separate leading argument'
				}
			}
		],
		output: null
	},
	{
		// A comment inside a leading array argument moves along with it.
		code: IMPORT + "sv(['flex' /* primary */], { variants: {} });",
		errors: [
			{
				messageId: 'wrongBaseStyle',
				data: {
					style: 'a "base" field in the config',
					found: 'a separate leading argument'
				}
			}
		],
		output: IMPORT + "sv({ base: ['flex' /* primary */], variants: {} });"
	},
	{
		// The same for a `slots` base that's the only property there.
		code:
			IMPORT +
			"sv({ slots: { base: /* primary */ 'flex' }, variants: {} });",
		errors: [
			{
				messageId: 'wrongBaseStyle',
				data: {
					style: 'a "base" field in the config',
					found: 'a "base" entry in "slots"'
				}
			}
		],
		output: null
	},
	{
		code: IMPORT + "sv({ base: 'flex' /* primary */, variants: {} });",
		options: [{ baseStyle: 'separateArg' }],
		errors: [
			{
				messageId: 'wrongBaseStyle',
				data: {
					style: 'a separate leading argument',
					found: 'a "base" field in the config'
				}
			}
		],
		output: null
	},
	{
		// A `base` entry in a hoisted `slots` record is detected, but not moved
		// out: other configs may share that record.
		code:
			IMPORT +
			"const slots = { base: 'flex', icon: 'w-4' };\nsv({ slots, variants: {} });",
		errors: [
			{
				messageId: 'wrongBaseStyle',
				data: {
					style: 'a "base" field in the config',
					found: 'a "base" entry in "slots"'
				}
			}
		],
		output: null
	},
	{
		// Nor is a base moved into a hoisted `slots` record.
		code:
			IMPORT +
			"const slots = { icon: 'w-4' };\nsv('flex', { slots, variants: {} });",
		options: [{ baseStyle: 'slotsBase' }],
		errors: [
			{
				messageId: 'wrongBaseStyle',
				data: {
					style: 'a "base" entry in "slots"',
					found: 'a separate leading argument'
				}
			}
		],
		output: null
	},
	{
		// separateArg present, default target is 'field': reports and fixes.
		code: IMPORT + "sv('flex', { variants: {} });",
		errors: [
			{
				messageId: 'wrongBaseStyle',
				data: {
					style: 'a "base" field in the config',
					found: 'a separate leading argument'
				}
			}
		],
		output: IMPORT + "sv({ base: 'flex', variants: {} });"
	},
	{
		// field present, target configured as separateArg: reports and fixes.
		code: IMPORT + "sv({ base: 'flex', variants: {} });",
		options: [{ baseStyle: 'separateArg' }],
		errors: [
			{
				messageId: 'wrongBaseStyle',
				data: {
					style: 'a separate leading argument',
					found: 'a "base" field in the config'
				}
			}
		],
		output: IMPORT + "sv('flex', { variants: {} });"
	},
	{
		// field present, target separateArg, config followed by a trailing
		// comma: still the call's own last argument, so fixed.
		code: IMPORT + "sv({ base: 'flex', variants: {} },);",
		options: [{ baseStyle: 'separateArg' }],
		errors: [
			{
				messageId: 'wrongBaseStyle',
				data: {
					style: 'a separate leading argument',
					found: 'a "base" field in the config'
				}
			}
		],
		output: IMPORT + "sv('flex', { variants: {} },);"
	},
	{
		// field present, target separateArg, config wrapped in parentheses:
		// a leading argument inserted inside them would form a comma
		// expression and drop the classes, so reported but not fixed.
		code: IMPORT + "sv(({ base: 'flex', variants: {} }));",
		options: [{ baseStyle: 'separateArg' }],
		errors: [
			{
				messageId: 'wrongBaseStyle',
				data: {
					style: 'a separate leading argument',
					found: 'a "base" field in the config'
				}
			}
		],
		output: null
	},
	{
		// separateArg present, config wrapped in parentheses: removing the
		// leading argument up to the config would split the parentheses, so
		// reported but not fixed.
		code: IMPORT + "sv('flex', ({ variants: {} }));",
		errors: [
			{
				messageId: 'wrongBaseStyle',
				data: {
					style: 'a "base" field in the config',
					found: 'a separate leading argument'
				}
			}
		],
		output: null
	},
	{
		// field present, target configured as slotsBase, slots already exists:
		// reports and fixes, moving base into slots.
		code:
			IMPORT +
			"sv({ base: 'flex', slots: { icon: 'w-4' }, variants: {} });",
		options: [{ baseStyle: 'slotsBase' }],
		errors: [
			{
				messageId: 'wrongBaseStyle',
				data: {
					style: 'a "base" entry in "slots"',
					found: 'a "base" field in the config'
				}
			}
		],
		output:
			IMPORT +
			"sv({ slots: { base: 'flex', icon: 'w-4' }, variants: {} });"
	},
	{
		// Dynamic (non-static) base value: reported, not fixed.
		code:
			IMPORT +
			'const extra = getExtra();\nsv({ base: extra, variants: {} });',
		errors: [
			{
				messageId: 'wrongBaseStyle',
				data: {
					style: 'a separate leading argument',
					found: 'a "base" field in the config'
				}
			}
		],
		options: [{ baseStyle: 'separateArg' }]
	},
	{
		// Target already populated (both a leading arg and a field present):
		// reported for the mismatched one, not fixed (ambiguous merge).
		code: IMPORT + "sv('flex', { base: 'items-center', variants: {} });",
		errors: [
			{
				messageId: 'wrongBaseStyle',
				data: {
					style: 'a "base" field in the config',
					found: 'a separate leading argument'
				}
			}
		]
	},
	{
		// slotsBase present, default target is 'field': reports and fixes,
		// removing the only property from `slots` (exercises the
		// `properties.length === 1` removal from a non-config object) and
		// moving base out to a config field.
		code: IMPORT + "sv({slots:{base:'flex'},variants:{}});",
		errors: [
			{
				messageId: 'wrongBaseStyle',
				data: {
					style: 'a "base" field in the config',
					found: 'a "base" entry in "slots"'
				}
			}
		],
		output: IMPORT + "sv({base: 'flex', slots:{},variants:{}});"
	},
	{
		// field present, target configured as slotsBase, slots already exists
		// but is empty: reports and fixes, inserting base as the first (and
		// only) property of the empty slots object.
		code: IMPORT + "sv({ base: 'flex', slots: {}, variants: {} });",
		options: [{ baseStyle: 'slotsBase' }],
		errors: [
			{
				messageId: 'wrongBaseStyle',
				data: {
					style: 'a "base" entry in "slots"',
					found: 'a "base" field in the config'
				}
			}
		],
		output: IMPORT + "sv({ slots: { base: 'flex' }, variants: {} });"
	},
	{
		// Base value is a static array (not a plain string): exercises the
		// ArrayExpression branch of the movable-value check, still fixed.
		code: IMPORT + "sv({ base: ['flex', 'items-center'], variants: {} });",
		options: [{ baseStyle: 'separateArg' }],
		errors: [
			{
				messageId: 'wrongBaseStyle',
				data: {
					style: 'a separate leading argument',
					found: 'a "base" field in the config'
				}
			}
		],
		output: IMPORT + "sv(['flex', 'items-center'], { variants: {} });"
	},
	{
		// slotsBase present as the LAST property inside `slots` (not the only
		// one, not the first): exercises the last-property removal branch.
		// `slots`' own key order isn't covered by the key-order check, so this
		// doesn't also trigger `wrongOrder`.
		code:
			IMPORT +
			"sv({ slots: { icon: 'w-4', base: 'flex' }, variants: {} });",
		errors: [
			{
				messageId: 'wrongBaseStyle',
				data: {
					style: 'a "base" field in the config',
					found: 'a "base" entry in "slots"'
				}
			}
		],
		output:
			IMPORT +
			"sv({ base: 'flex', slots: { icon: 'w-4' }, variants: {} });"
	},
	{
		// Base value is an array with a spread element: not statically
		// movable, so it's reported without a fix.
		code: IMPORT + "sv({ base: ['flex', ...rest], variants: {} });",
		options: [{ baseStyle: 'separateArg' }],
		errors: [
			{
				messageId: 'wrongBaseStyle',
				data: {
					style: 'a separate leading argument',
					found: 'a "base" field in the config'
				}
			}
		]
	},
	{
		// Base value is an array with a dynamic (non-static) element: not
		// statically movable, so it's reported without a fix.
		code: IMPORT + "sv({ base: ['flex', dynamic], variants: {} });",
		options: [{ baseStyle: 'separateArg' }],
		errors: [
			{
				messageId: 'wrongBaseStyle',
				data: {
					style: 'a separate leading argument',
					found: 'a "base" field in the config'
				}
			}
		]
	},
	{
		// slotsBase present, target configured as separateArg: reports and
		// fixes, moving base out of `slots` and into a leading argument.
		code: IMPORT + "sv({ slots: { base: 'flex' }, variants: {} });",
		options: [{ baseStyle: 'separateArg' }],
		errors: [
			{
				messageId: 'wrongBaseStyle',
				data: {
					style: 'a separate leading argument',
					found: 'a "base" entry in "slots"'
				}
			}
		],
		output: IMPORT + "sv('flex', { slots: {  }, variants: {} });"
	},
	{
		// separateArg present, target configured as
		// slotsBase with slots already declared: reports and
		// fixes, moving the leading argument into `slots`.
		code: IMPORT + "sv('flex', { slots: { icon: 'w-4' }, variants: {} });",
		options: [{ baseStyle: 'slotsBase' }],
		errors: [
			{
				messageId: 'wrongBaseStyle',
				data: {
					style: 'a "base" entry in "slots"',
					found: 'a separate leading argument'
				}
			}
		],
		output:
			IMPORT +
			"sv({ slots: { base: 'flex', icon: 'w-4' }, variants: {} });"
	},
	{
		// More than one leading class argument: reported, but never fixed —
		// folding them into a single base value would silently drop a class.
		code: IMPORT + "sv('flex', 'items-center', { variants: {} });",
		errors: [
			{
				messageId: 'wrongBaseStyle',
				data: {
					style: 'a "base" field in the config',
					found: 'a separate leading argument'
				}
			}
		]
	},
	{
		// The config is a hoisted `const` resolved from elsewhere
		// in the file, so the call's own argument list doesn't
		// hold the object literal. Inserting a leading argument
		// would edit the wrong place: reported, never fixed.
		code:
			IMPORT +
			"const config = { base: 'flex', variants: {} };\nsv(config);",
		options: [{ baseStyle: 'separateArg' }],
		errors: [
			{
				messageId: 'wrongBaseStyle',
				data: {
					style: 'a separate leading argument',
					found: 'a "base" field in the config'
				}
			}
		]
	},
	{
		// Same hoisting hazard from the other direction: the leading argument
		// is real, but removing it spans the range up to the config *literal*,
		// which lives in the declaration above. Reported, never fixed.
		code: IMPORT + "const config = { variants: {} };\nsv('flex', config);",
		errors: [
			{
				messageId: 'wrongBaseStyle',
				data: {
					style: 'a "base" field in the config',
					found: 'a separate leading argument'
				}
			}
		]
	},
	{
		// A key-order violation and a base-style violation in the same call:
		// both are reported. Their fix ranges touch, so ESLint applies only
		// the base-style one in this pass (RuleTester checks a single pass)
		// and the reorder on the next pass — neither corrupts the other.
		code: IMPORT + "sv('flex', { variants: {}, slots: { icon: 'w-4' } });",
		errors: [
			{
				messageId: 'wrongBaseStyle',
				data: {
					style: 'a "base" field in the config',
					found: 'a separate leading argument'
				}
			},
			{
				messageId: 'wrongOrder',
				data: { key: 'slots', before: 'variants' }
			}
		],
		output:
			IMPORT +
			"sv({ base: 'flex', variants: {}, slots: { icon: 'w-4' } });"
	}
];