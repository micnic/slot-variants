import { IMPORT, IMPORT_CN, IMPORT_CREATE_SV, IMPORT_NS } from './helpers.ts';

export const NO_DYNAMIC_CLASSES_VALID = [
	// Keys named like `Object.prototype` members are no config keys.
	IMPORT_CREATE_SV + "createSV({ toString: 'x', __defineGetter__: 'y' });",
	// Static class strings in cn-style call.
	IMPORT + "sv('flex', 'items-center');",
	// Another sv()/cn() call's output is not a literal, but its classes are
	// still known at lint time — `no-restyle` is what checks them.
	`import { cn, sv } from 'slot-variants';
		const card = sv({ slots: { header: 'px-4' } });
		const classes = card();
		cn(classes.header, 'font-bold');`,
	// Slots destructured off a result, renamed or not, and a slot read by a
	// string key, are another call's output too.
	`import { cn, sv } from 'slot-variants';
		const card = sv('p-2', { slots: { header: 'font-bold' } });
		const { base, header: title } = card();
		cn(base, title, card()['header']);`,
	// Static base in config.
	IMPORT + "sv({ base: 'flex', variants: {} });",
	// Array of static class values.
	IMPORT + "sv({ base: ['flex', 'gap-2'], variants: {} });",
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
	IMPORT + "sv({ base: ['flex', , 'gap-2'], variants: {} });",
	// Template literal without expressions.
	IMPORT + 'sv({ base: `flex gap-2`, variants: {} });',
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
	// Boolean variant with a slot object under `true`.
	IMPORT +
		`sv({
			slots: { body: 'p-4' },
			variants: { disabled: { true: { base: 'opacity-50', body: 'cursor-not-allowed' } } }
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
	// Slot-keyed compoundVariants class record — same shape as a variant
	// branch, including arrays as slot values.
	IMPORT +
		`sv({
			slots: { body: 'p-4', icon: 'size-4' },
			variants: { size: { sm: 'text-sm', lg: 'text-lg' } },
			compoundVariants: [
				{ size: 'sm', class: { base: 'font-bold', icon: 'shrink-0' } },
				{ size: 'lg', className: { body: ['gap-1', 'font-mono'] } }
			]
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
	// compoundSlots with a no-substitution template literal slot name.
	IMPORT +
		`sv({
			slots: { body: 'p-4' },
			compoundSlots: [{ slots: [\`body\`], class: 'font-bold' }]
		});`,
	// Non-class config keys with dynamic values are not validated.
	IMPORT +
		`sv({
			base: 'flex',
			variants: {}, defaultVariants: dynamic,
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
	IMPORT + "sv(isActive ? 'px-4' : 'px-2', { base: 'flex', variants: {} });",
	// Ternary substitution inside a template literal — whitespace-isolated.
	IMPORT_CN + "cn(`items-center ${col ? 'flex-col' : 'flex-row'}`);",
	// Ternary substitution at the start of a template literal.
	IMPORT_CN + "cn(`${col ? 'flex-col' : 'flex-row'} items-center`);",
	// Multiple ternary substitutions in one template literal.
	IMPORT_CN +
		"cn(`${a ? 'flex-col' : 'flex-row'} ${b ? 'gap-2' : 'gap-4'}`);",
	// Template-literal ternary nested inside a cn array argument.
	IMPORT_CN +
		"cn(['flex', `items-center ${col ? 'flex-col' : 'flex-row'}`]);",
	// Ternary branch may itself be an expression-free template literal.
	IMPORT_CN + 'cn(`gap-2 ${col ? `flex-col` : `flex-row`}`);',
	// Chained ternary — every branch is a static string.
	IMPORT_CN +
		"cn(size === 'lg' ? 'text-lg' : size === 'sm' ? 'text-sm' : 'text-base');",
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
	IMPORT_CN +
		"cn('px-2 py-1', isActive && 'px-4', { 'text-red-500': hasError });",
	// Record nested inside a cn array argument.
	IMPORT_CN + "cn(['flex', { active: isActive }]);",
	// Record as an sv() cn-style leading argument.
	IMPORT + "sv({ active: isActive }, { base: 'flex', variants: {} });",
	// Conditional in an sv() cn-style leading argument.
	IMPORT + "sv(isActive && 'px-4', { base: 'flex', variants: {} });",
	// Without an import, the rule is silent.
	'sv({ base: dynamic, variants: {} });',
	// Default-imported sv is not tracked.
	"import sv from 'slot-variants'; sv(dynamic);",
	// A namespace member that isn't a tracked export stays untracked.
	"import * as mod from 'slot-variants'; mod.other(dynamic);",
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
	IMPORT_CN + "const X = 'px-4';\ncn(cond ? X : 'px-2');",
	// A hoisted `const` config is read through and validated as a config.
	IMPORT + "const config = { base: 'flex', variants: {} };\nsv(config);",
	// A `const` alias of a tracked import stays tracked.
	IMPORT_CN + "const cx = cn;\ncx('flex');",
	// An alias of an untracked identifier is ignored.
	IMPORT_CN + 'const cx = other;\ncx(dynamic);',
	// An alias of a non-identifier value is ignored.
	IMPORT_CN + "const cx = () => '';\ncx(dynamic);",
	// A `createSV()`-derived binding is analyzed like `sv` — static config.
	IMPORT_CREATE_SV +
		"const customSV = createSV({ cacheSize: 512 });\ncustomSV({ base: 'flex', variants: {} });",
	// A `createSV()`-derived binding used cn-style is analyzed like `sv`.
	IMPORT_CREATE_SV +
		"const customSV = createSV({ cacheSize: 512 });\ncustomSV('flex', 'items-center');",
	// A `const` alias of a `createSV()`-derived binding stays tracked.
	IMPORT_CREATE_SV +
		"const customSV = createSV({ cacheSize: 512 });\nconst cx = customSV;\ncx({ base: 'flex' });",
	// A binding initialized by a member-expression call is not a factory.
	IMPORT_CREATE_SV + 'const c = obj.make();\nc(dynamic);',
	// A binding initialized by an untracked call is not a factory.
	IMPORT_CREATE_SV + 'const c = other();\nc(dynamic);',
	// A binding whose factory alias resolves to a non-identifier is ignored.
	IMPORT_CREATE_SV +
		"const factory = () => () => '';\nconst c = factory({});\nc(dynamic);",
	// A `createSV` shadowed by a local binding is not tracked.
	IMPORT_CREATE_SV +
		'function f(createSV) {\n\tconst c = createSV({});\n\treturn c(dynamic);\n}',
	// A non-object argument to createSV() leaves nothing to analyze.
	IMPORT_CREATE_SV + 'createSV(dynamic);',
	// A config key left `undefined`, directly, through a binding, or as
	// `void 0`, is one the config doesn't set.
	IMPORT + "sv({ slots: undefined, variants: { s: { x: 'b' } } });",
	IMPORT + "sv({ slots: { a: 'p-1' }, variants: undefined });",
	IMPORT +
		"sv({ variants: { s: { x: 'b' } }, compoundVariants: undefined, compoundSlots: void 0 });",
	IMPORT +
		"const u = undefined;\nsv({ slots: u, variants: { s: { x: 'b' } } });",
	IMPORT + 'sv({ base: void 0, variants: {} });'
];

export const NO_DYNAMIC_CLASSES_INVALID = [
	{
		// Only a `void` of a literal is surely `undefined`.
		code: IMPORT + 'sv({ base: void f(), variants: {} });',
		errors: [{ messageId: 'dynamic' }]
	},
	{
		code: IMPORT + 'sv({ base: !x, variants: {} });',
		errors: [{ messageId: 'dynamic' }]
	},
	{
		// A hoisted value shared by several positions and calls is reported
		// once.
		code:
			IMPORT +
			'const cls = foo();\nsv({ base: cls, variants: { v: { x: cls } } });\nsv({ base: cls, variants: {} });',
		errors: [{ messageId: 'dynamic', line: 2 }]
	},
	{
		// A non-breaking space doesn't separate the substitution from the text
		// beside it, so the branch is glued onto `a` as one dynamic class.
		code: IMPORT_CN + "cn(`a\u00a0${cond ? 'b' : 'c'}`);",
		errors: 1
	},
	{
		// A namespace member call is analyzed like the named import.
		code: IMPORT_NS + 'SV.sv(dynamic);',
		errors: [{ messageId: 'dynamic' }]
	},
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
		code: IMPORT + 'sv({ base: dynamic, variants: {} });',
		errors: 1
	},
	{
		// Non-string literal as base.
		code: IMPORT + 'sv({ base: 42, variants: {} });',
		errors: 1
	},
	{
		// Template literal with expression as base.
		code: IMPORT + 'sv({ base: `flex ${x}`, variants: {} });',
		errors: 1
	},
	{
		// Identifier element inside base array.
		code: IMPORT + "sv({ base: ['flex', dynamic], variants: {} });",
		errors: 1
	},
	{
		// Undefined is only allowed as the whole config class value,
		// not as an array element.
		code: IMPORT + "sv({ base: ['flex', undefined], variants: {} });",
		errors: 1
	},
	{
		// Config class arrays must be flat string arrays.
		code: IMPORT + "sv({ base: ['flex', ['gap-2']], variants: {} });",
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
		code: IMPORT + "sv({ base: ['flex', ...rest], variants: {} });",
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
		// Dynamic value inside a slot-keyed compoundVariants class record.
		code:
			IMPORT +
			`sv({
				slots: { body: 'p-4' },
				variants: { size: { sm: 'text-sm' } },
				compoundVariants: [{ size: 'sm', class: { body: dynamic } }]
			});`,
		errors: 1
	},
	{
		// Unknown slot key makes a compoundVariants class record dynamic.
		code:
			IMPORT +
			`sv({
				slots: { body: 'p-4' },
				variants: { size: { sm: 'text-sm' } },
				compoundVariants: [{ size: 'sm', class: { header: 'font-bold' } }]
			});`,
		errors: 1
	},
	{
		// Without slots a compoundVariants class can't be a record.
		code:
			IMPORT +
			`sv({
				variants: { size: { sm: 'text-sm' } },
				compoundVariants: [{ size: 'sm', class: { base: 'font-bold' } }]
			});`,
		errors: 1
	},
	{
		// A compoundSlots class already targets slots — records stay dynamic.
		code:
			IMPORT +
			`sv({
				slots: { body: 'p-4' },
				compoundSlots: [{ slots: ['body'], class: { body: 'font-bold' } }]
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
		code: IMPORT + "sv({ base: isActive && 'px-4', variants: {} });",
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
		code:
			IMPORT + "sv({ base: isActive ? 'px-4' : 'px-2', variants: {} });",
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
		code: IMPORT + "sv({ base: `flex ${c ? 'a' : 'b'}`, variants: {} });",
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
		// A redeclared `var` has multiple
		// definitions — not a safe single value.
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
		code: IMPORT_CN + 'const { base } = obj;\ncn(base);',
		errors: 1
	},
	{
		// A `const` whose initializer is dynamic
		// is reported at the initializer.
		code: IMPORT_CN + 'const base = make();\ncn(base);',
		errors: 1
	},
	{
		// A reference cycle terminates and is reported as dynamic.
		code: IMPORT_CN + 'const a = b;\nconst b = a;\ncn(a);',
		errors: 1
	},
	{
		// A hoisted `const` config is validated as a config — dynamic values
		// inside it are reported.
		code:
			IMPORT +
			'const config = { base: dynamic, variants: {} };\nsv(config);',
		errors: 1
	},
	{
		// A hoisted config after cn-style leading arguments — the config is
		// still detached and the dynamic leading argument is reported.
		code:
			IMPORT +
			"const config = { base: 'flex', variants: {} };\nsv(dynamic, config);",
		errors: 1
	},
	{
		// A `const` alias of a tracked cn import stays tracked.
		code: IMPORT_CN + 'const cx = cn;\ncx(dynamic);',
		errors: 1
	},
	{
		// A chain of `const` aliases is followed to the import.
		code: IMPORT_CN + 'const a = cn;\nconst b = a;\nb(dynamic);',
		errors: 1
	},
	{
		// A `const` alias of a tracked sv import is validated as sv.
		code:
			IMPORT +
			'const styled = sv;\nstyled({ base: dynamic, variants: {} });',
		errors: 1
	},
	{
		// A `createSV()`-derived binding is validated as sv (dynamic config).
		code:
			IMPORT_CREATE_SV +
			'const customSV = createSV({ cacheSize: 512 });\ncustomSV({ base: dynamic, variants: {} });',
		errors: 1
	},
	{
		// A `createSV()`-derived binding used cn-style is validated as sv.
		code:
			IMPORT_CREATE_SV +
			'const customSV = createSV({ cacheSize: 512 });\ncustomSV(dynamic);',
		errors: 1
	},
	{
		// A `createSV` import alias produces a tracked binding.
		code:
			"import { createSV as factory } from 'slot-variants';\n" +
			'const customSV = factory({});\ncustomSV({ base: dynamic, variants: {} });',
		errors: 1
	},
	{
		// A `const` alias of a `createSV()`-derived binding stays tracked.
		code:
			IMPORT_CREATE_SV +
			'const customSV = createSV({});\nconst cx = customSV;\ncx({ base: dynamic, variants: {} });',
		errors: 1
	},
	{
		// The defaults of a createSV() factory
		// call are validated like a config.
		code: IMPORT_CREATE_SV + 'createSV({ base: dynamic });',
		errors: 1
	},
	{
		// A spread in a createSV() factory config is dynamic.
		code: IMPORT_CREATE_SV + "createSV({ ...rest, base: 'flex' });",
		errors: 1
	},
	{
		// A computed key in a createSV() factory config is dynamic.
		code: IMPORT_CREATE_SV + "createSV({ [k]: 'flex' });",
		errors: 1
	}
];