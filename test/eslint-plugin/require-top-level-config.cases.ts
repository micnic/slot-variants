import { IMPORT, IMPORT_CN, IMPORT_CREATE_SV, IMPORT_NS } from './helpers.ts';

export const REQUIRE_TOP_LEVEL_CONFIG_VALID = [
	// Config call at the module top level.
	IMPORT + "sv({ base: 'flex', variants: {} });",
	// Config call assigned to a top-level binding.
	IMPORT + "const button = sv({ base: 'flex', variants: {} });",
	// Config call exported from the top level.
	IMPORT + "export const button = sv({ base: 'flex', variants: {} });",
	// Inside a top-level block — still runs once at module load.
	IMPORT + "{ const b = sv({ base: 'flex', variants: {} }); }",
	// Inside a top-level conditional — runs at most once at load.
	IMPORT + "if (x) { sv({ base: 'flex', variants: {} }); }",
	// cn-style sv() (no config) nested in a function is fine.
	IMPORT + "function f() { return sv('flex', 'items-center'); }",
	// Zero-arg sv() nested in a function carries no config.
	IMPORT + 'function f() { return sv(); }',
	// cn() nested in a function never carries a config.
	IMPORT_CN + "function f() { return cn('flex'); }",
	// Config-shaped last arg in a cn-style call still counts as config,
	// but here it's at the top level.
	IMPORT + "sv('flex', { base: 'items-center', variants: {} });",
	// Without an import, the rule stays quiet even when nested.
	"function f() { return sv({ base: 'flex', variants: {} }); }",
	// Default-imported sv is not tracked.
	"import sv from 'slot-variants'; function f() { sv({ base: 'flex', variants: {} }); }",
	// Member-expression callee is not tracked.
	IMPORT + "function f() { return obj.sv({ base: 'flex' }); }",
	// A createSV() factory call compiles nothing, so nesting it is fine.
	IMPORT_CREATE_SV + "function f() { return createSV({ base: 'flex' }); }",
	// A namespace config call at the top level is fine.
	IMPORT_NS + "SV.sv({ base: 'flex', variants: {} });",
	// A `static` field initializer runs once, with the class definition.
	IMPORT + "class A { static button = sv({ base: 'flex', variants: {} }); }",
	// So does a static block.
	IMPORT + "class A { static { sv({ base: 'flex', variants: {} }); } }",
	// And an instance field's computed key: only its value runs per `new`.
	IMPORT + "class A { [sv({ base: 'flex', variants: {} })] = 1; }",
	// cn-style sv() in an instance field carries no config to compile.
	IMPORT + "class A { c = sv('flex', 'items-center'); }",
	// Nor does a cn() call.
	IMPORT_CN + "class A { c = cn('flex'); }",
	// A createSV() factory call in an instance field compiles nothing either.
	IMPORT_CREATE_SV + 'class A { make = createSV({ cacheSize: 512 }); }',
	// A `for` loop's initializer and the object a `for…in`/`for…of` loop
	// iterates are evaluated once.
	IMPORT + 'for (let b = sv({ variants: {} }); b; ) {}',
	IMPORT + 'for (const k in sv({ variants: {} })) {}',
	// A top-level immediately invoked function runs once.
	IMPORT + 'const b = (() => sv({ variants: {} }))();',
	IMPORT + 'const b = (function () { return sv({ variants: {} }); })();',
	// So does one invoked through `.call()`.
	IMPORT +
		'const b = (function () { return sv({ variants: {} }); }).call(this);',
	// `void 0` is `undefined`: neither key is set, so this is a class list.
	IMPORT + "function f() { return sv({ slots: void 0, base: 'x' }); }",
	// A spread no object literal can be read from leaves the call a class
	// list, as does an object that spreads itself.
	IMPORT + "function f() { return sv({ ...common, base: 'x' }); }",
	IMPORT +
		"function f() { const c = { ...c }; return sv({ ...c, base: 'x' }); }"
];

export const REQUIRE_TOP_LEVEL_CONFIG_INVALID = [
	{
		// An empty object is a config too, as `sv()` reads it at runtime.
		code: IMPORT + "function f() { return sv('flex', { variants: {} }); }",
		errors: [{ messageId: 'nested' }]
	},
	{
		code: IMPORT + 'const make = () => sv({ variants: {} });',
		errors: [{ messageId: 'nested' }]
	},
	{
		// Config call inside a function declaration.
		code:
			IMPORT +
			"function f() { return sv({ base: 'flex', variants: {} }); }",
		errors: [{ messageId: 'nested' }]
	},
	{
		// Config call inside an object method.
		code:
			IMPORT +
			"const o = { make() { return sv({ base: 'flex', variants: {} }); } };",
		errors: [{ messageId: 'nested' }]
	},
	{
		// A createSV()-derived binding's config
		// call is still bound by the rule.
		code:
			IMPORT_CREATE_SV +
			'const customSV = createSV({ cacheSize: 512 });\n' +
			"function f() { return customSV({ base: 'flex', variants: {} }); }",
		errors: [{ messageId: 'nested' }]
	},
	{
		// A namespace config call is bound by the rule too.
		code:
			IMPORT_NS +
			"function f() { return SV.sv({ base: 'flex', variants: {} }); }",
		errors: [{ messageId: 'nested' }]
	},
	{
		// An instance field initializer re-runs for every `new`, so it
		// rebuilds the compiled config just as a function body would.
		code:
			IMPORT + "class A { button = sv({ base: 'flex', variants: {} }); }",
		errors: [{ messageId: 'field' }]
	},
	{
		// The call needn't be the whole initializer.
		code:
			IMPORT +
			"class A { buttons = [sv({ base: 'flex', variants: {} })]; }",
		errors: [{ messageId: 'field' }]
	},
	{
		// A private instance field is no different.
		code:
			IMPORT +
			"class A { #button = sv({ base: 'flex', variants: {} }); }",
		errors: [{ messageId: 'field' }]
	},
	{
		// An arrow in the initializer is the innermost reason
		// — the call re-runs per invocation, not per instance.
		code:
			IMPORT +
			"class A { button = () => sv({ base: 'flex', variants: {} }); }",
		errors: [{ messageId: 'nested' }]
	},
	{
		// A `static` field is fine on its own, but not when the whole class is
		// rebuilt on every call.
		code:
			IMPORT +
			"function f() { return class { static button = sv({ base: 'flex', variants: {} }); }; }",
		errors: [{ messageId: 'nested' }]
	},
	{
		// An instance field of a class expression inside a function reports the
		// innermost reason.
		code:
			IMPORT +
			"function f() { return class { button = sv({ base: 'flex', variants: {} }); }; }",
		errors: [{ messageId: 'field' }]
	},
	{
		// A computed key isn't the field's initializer, so the function around
		// the class is the reason.
		code:
			IMPORT +
			"function f() { return class { [sv({ base: 'flex', variants: {} })] = 1; }; }",
		errors: [{ messageId: 'nested' }]
	},
	{
		// A loop body re-runs on every iteration, at the top level too.
		code: IMPORT + 'for (const s of sizes) { sv({ variants: {} }); }',
		errors: [{ messageId: 'loop' }]
	},
	{
		code: IMPORT + 'for (const k in o) sv({ variants: {} });',
		errors: [{ messageId: 'loop' }]
	},
	{
		code: IMPORT + 'while (x) { sv({ variants: {} }); }',
		errors: [{ messageId: 'loop' }]
	},
	{
		code: IMPORT + 'do { sv({ variants: {} }); } while (x);',
		errors: [{ messageId: 'loop' }]
	},
	{
		code: IMPORT + 'for (let i = 0; i < n; i++) { sv({ variants: {} }); }',
		errors: [{ messageId: 'loop' }]
	},
	{
		// A loop's test re-runs on every iteration as well.
		code: IMPORT + 'for (; sv({ variants: {} }); ) {}',
		errors: [{ messageId: 'loop' }]
	},
	{
		// The innermost reason wins: a loop inside a function, a function
		// inside a loop.
		code: IMPORT + 'function f() { while (x) { sv({ variants: {} }); } }',
		errors: [{ messageId: 'loop' }]
	},
	{
		code: IMPORT + 'while (x) { const f = () => sv({ variants: {} }); }',
		errors: [{ messageId: 'nested' }]
	},
	{
		// An immediately invoked function inherits where it is called from.
		code: IMPORT + 'while (x) { (() => sv({ variants: {} }))(); }',
		errors: [{ messageId: 'loop' }]
	},
	{
		code:
			IMPORT + 'function f() { return (() => sv({ variants: {} }))(); }',
		errors: [{ messageId: 'nested' }]
	},
	{
		// Nor is one whose method other than `.call()`/`.apply()` is called.
		code: IMPORT + '(() => sv({ variants: {} })).bind(null);',
		errors: [{ messageId: 'nested' }]
	},
	{
		code: IMPORT + "(() => sv({ variants: {} }))['call']();",
		errors: [{ messageId: 'nested' }]
	},
	{
		// A function passed to a call isn't invoked where it's written.
		code: IMPORT + 'list.map(() => sv({ variants: {} }));',
		errors: [{ messageId: 'nested' }]
	},
	{
		// A config built by spreading one with `slots` or `variants`.
		code:
			IMPORT +
			"const common = { variants: { size: { sm: 'p-1' } } };\nfunction f() { return sv({ ...common }); }",
		errors: [{ messageId: 'nested' }]
	},
	{
		code:
			IMPORT +
			"const inner = { slots: { a: 'p-1' } };\nconst outer = { ...inner };\nfunction f() { return sv({ ...outer, base: 'x' }); }",
		errors: [{ messageId: 'nested' }]
	}
];

const SVELTE_SCRIPT = "<script>import { sv } from 'slot-variants';</script>\n";

export const REQUIRE_TOP_LEVEL_CONFIG_SVELTE_VALID = [
	// A module script runs once, however many instances the component has.
	"<script module>import { sv } from 'slot-variants';\nconst b = sv({ base: 'p-2', variants: {} });</script>\n<b class={b()} />",
	// The same in Svelte 4's spelling.
	"<script context=\"module\">import { sv } from 'slot-variants';\nconst b = sv({ base: 'p-2', variants: {} });</script>\n<b class={b()} />"
];

export const REQUIRE_TOP_LEVEL_CONFIG_SVELTE_INVALID = [
	{
		// The instance script runs again for every component instance.
		code: "<script>import { sv } from 'slot-variants';\nconst b = sv({ base: 'p-2', variants: {} });</script>\n<b class={b()} />",
		errors: [{ messageId: 'instance' }]
	},
	{
		// Another attribute doesn't make it a module script.
		code: "<script lang=\"ts\">import { sv } from 'slot-variants';\nconst b = sv({ base: 'p-2', variants: {} });</script>",
		errors: [{ messageId: 'instance' }]
	},
	{
		// The innermost reason wins, here a function in the instance script.
		code: "<script>import { sv } from 'slot-variants';\nconst make = () => sv({ base: 'p-2', variants: {} });</script>",
		errors: [{ messageId: 'nested' }]
	},
	{
		// A markup expression is evaluated again on every render.
		code:
			SVELTE_SCRIPT + "<b class={sv({ base: 'p-2', variants: {} })()} />",
		errors: [{ messageId: 'template' }]
	},
	{
		code:
			SVELTE_SCRIPT +
			"{#if ok}<b>{sv({ base: 'p-2', variants: {} })()}</b>{/if}",
		errors: [{ messageId: 'template' }]
	},
	{
		// The innermost reason wins: a handler re-runs per call.
		code:
			SVELTE_SCRIPT +
			"<b onclick={() => sv({ base: 'p-2', variants: {} })} />",
		errors: [{ messageId: 'nested' }]
	}
];

const VUE_SCRIPT =
	"<script setup>import { sv } from 'slot-variants';</script>\n";

export const REQUIRE_TOP_LEVEL_CONFIG_VUE_VALID = [
	// A plain script runs once, however many instances the component has.
	"<script>import { sv } from 'slot-variants';\nconst b = sv({ base: 'p-2', variants: {} });</script>\n<script setup>const c = b();</script>\n<template><b :class=\"c\" /></template>",
	{
		// A script file has no `<script setup>` to be in.
		code: "import { sv } from 'slot-variants';\nconst b = sv({ base: 'p-2', variants: {} });",
		filename: 'button.js'
	}
];

export const REQUIRE_TOP_LEVEL_CONFIG_VUE_INVALID = [
	{
		// `<script setup>` runs again for every component instance.
		code: "<script setup>import { sv } from 'slot-variants';\nconst b = sv({ base: 'p-2', variants: {} });</script>\n<template><b :class=\"b()\" /></template>",
		errors: [{ messageId: 'instance' }]
	},
	{
		// A template expression is evaluated again on every render.
		code:
			VUE_SCRIPT +
			'<template><b :class="sv({ base: \'p-2\', variants: {} })()" /></template>',
		errors: [{ messageId: 'template' }]
	},
	{
		code:
			VUE_SCRIPT +
			"<template><b>{{ sv({ base: 'p-2', variants: {} })() }}</b></template>",
		errors: [{ messageId: 'template' }]
	}
];

// An `accessor` field, which only the TypeScript parser reads.
export const REQUIRE_TOP_LEVEL_CONFIG_TS_VALID = [
	{
		// A type-only wrapper around an immediately invoked function.
		code:
			IMPORT +
			'const b = ((() => sv({ variants: {} })) as () => void)();',
		filename: 'test.ts'
	},
	{
		code: IMPORT + 'class A { static accessor b = sv({ variants: {} }); }',
		filename: 'test.ts'
	}
];

export const REQUIRE_TOP_LEVEL_CONFIG_TS_INVALID = [
	{
		code: IMPORT + 'class A { accessor b = sv({ variants: {} }); }',
		filename: 'test.ts',
		errors: [{ messageId: 'field' }]
	}
];