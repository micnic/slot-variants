import {
	IMPORT,
	IMPORT_CN,
	IMPORT_CREATE_SV,
	IMPORT_SV_CN,
	dup,
	restyle
} from './helpers.ts';

const RESTYLE_CARD = `const card = sv('border p-2', {
	slots: { header: 'font-bold px-4', body: 'py-4' },
	groups: { content: ['header', 'body'] },
	variants: {
		size: { sm: { content: 'text-sm' }, lg: { content: 'text-lg' } },
		flat: 'shadow-none'
	},
	compoundVariants: [{ size: 'lg', flat: true, class: 'gap-2' }],
	compoundSlots: [{ slots: ['header'], size: 'sm', class: 'tracking-wide' }],
	defaultVariants: { size: 'sm' }
});\n`;

// A multi-slot result produced with a value other than the default.
const RESTYLE_SIZED_CARD = `const card = sv({
	slots: { header: 'font-bold' },
	multiSlots: ['header'],
	variants: { size: { sm: { header: 'text-sm' }, lg: { header: 'text-lg' } } },
	defaultVariants: { size: 'lg' }
});
const r = card({ size: 'sm' });\n`;

// Groups that nothing ever targets, so their bucket stays empty.
const RESTYLE_PANEL = `const panel = sv({
	slots: { head: 'px-4', foot: 'py-2' },
	groups: { all: ['head', 'foot'] }
});\n`;

const RESTYLE_BUTTON = `const button = sv({
	base: 'p-2 rounded',
	variants: { size: { sm: 'text-sm', lg: 'mt-8' } },
	defaultVariants: { size: 'sm' }
});\n`;

// A preset and a default that select different values of one variant.
const RESTYLE_PRESET = `const b = sv({
	base: 'flex',
	variants: { size: { sm: 'p-2', lg: 'text-lg' } },
	defaultVariants: { size: 'sm' },
	presets: { big: { size: 'lg' } }
});\n`;

// A variant with no default, which a call leaves unset unless it passes it.
const RESTYLE_OPTIONAL = `const b = sv({
	base: 'flex',
	variants: { size: { sm: 'p-2', lg: 'text-lg' }, on: 'm-2' },
	compoundVariants: [{ size: 'sm', on: true, class: 'gap-2' }],
	presets: { small: { size: 'sm' } }
});\n`;

export const RESTYLE_VALID = [
	// A config's own `base` replaces the factory's, and a config that extends
	// another takes the factory's only where no parent sets one.
	IMPORT_CREATE_SV +
		"const mySv = createSV({ base: 'p-2' });\nconst b = mySv({ base: 'm-1', variants: {} });\nb({ class: 'p-4' });",
	IMPORT_CREATE_SV +
		"const mySv = createSV({ base: 'p-2' });\nconst b = mySv({ extend: parent, variants: {} });\nb({ class: 'p-4' });",
	IMPORT_CREATE_SV +
		"const mySv = createSV(defaults);\nconst b = mySv({ variants: {} });\nb({ class: 'p-4' });",
	IMPORT_CREATE_SV +
		"const mySv = createSV({ cacheSize: 1 });\nconst b = mySv({ variants: {} });\nb({ class: 'p-4' });",
	// A variant with no default stays unset when a call with readable props
	// doesn't pass it, so none of its values' classes apply.
	IMPORT + RESTYLE_OPTIONAL + "b({ class: 'p-4 m-4 gap-4' });",
	IMPORT + RESTYLE_OPTIONAL + "b({ size: undefined, class: 'p-4' });",
	IMPORT_SV_CN + RESTYLE_OPTIONAL + "cn(b(), 'p-4 m-4');",
	IMPORT_SV_CN +
		RESTYLE_OPTIONAL +
		"const props = { on: true };\ncn(b(props), 'p-4');",
	// The two branches of a ternary never render together.
	IMPORT_SV_CN +
		"const card = sv({ base: 'p-2', variants: {} });\nconst c = card();\ncn(on ? c : 'p-4');",
	IMPORT +
		"const card = sv({ base: 'p-2', variants: {} });\nconst c = card();\n<div className={on ? c.base : 'p-4'} />;",
	IMPORT_SV_CN +
		"const card = sv({ base: 'p-2', variants: {} });\nconst c = card();\ncn(a ? (b ? c : 'p-4') : 'm-1');",
	// A forwarded prop that replaces the styled value rather than joining it.
	IMPORT +
		'const button = sv({ base: \'p-2\', variants: {} });\nfunction Button({ className }) { return <button className={className ? className : button()} />; }\n<Button className="p-4" />;',
	// A preset's value replaces the default, and `null` unsets the variant.
	IMPORT + RESTYLE_PRESET + "b({ preset: 'big', class: 'p-4' });",
	IMPORT + RESTYLE_PRESET + "b({ size: null, class: 'p-4' });",
	IMPORT_SV_CN + RESTYLE_PRESET + "cn(b({ size: null }), 'p-4');",
	// A preset or variant left `undefined` is not passed, so the default
	// applies, and a config without presets applies no preset at all.
	IMPORT + RESTYLE_PRESET + "b({ preset: undefined, class: 'text-xl' });",
	IMPORT + RESTYLE_BUTTON + "button({ size: undefined, class: 'mt-4' });",
	IMPORT + RESTYLE_BUTTON + "button({ preset: name, class: 'mt-4' });",
	// A component forwarding a variant prop: an element that doesn't pass it
	// leaves the variant to its default.
	IMPORT +
		RESTYLE_BUTTON +
		'function Button({ className, size }) { return <button className={button({ size, class: className })} />; }\n<Button className="mt-4" />;',
	// `defaultVariants` and a call site's props are read through `const`
	// bindings, so the `lg` compound is known not to apply here.
	IMPORT_SV_CN +
		"const SIZE = 'sm';\nconst card = sv({ variants: { size: { sm: 'a', lg: 'b' } }, compoundVariants: [{ size: 'lg', class: 'p-4' }], defaultVariants: { size: SIZE } });\ncn(card(), 'p-2');",
	IMPORT_SV_CN +
		"const SIZE = 'sm';\nconst card = sv({ variants: { size: { sm: 'a', lg: 'b' } }, compoundVariants: [{ size: 'lg', class: 'p-4' }] });\ncn(card({ size: SIZE }), 'p-2');",
	// A wrapper bound to itself names no component, and lints without looping.
	IMPORT + 'const Loop = memo(Loop);\n<Loop className="p-4" />;',
	// No slot-variants import at all — nothing is tracked.
	"const card = sv({ base: 'p-2', variants: {} });\ncard({ class: 'p-4' });",
	// A call with no arguments, and one whose props carry no class override.
	IMPORT + RESTYLE_BUTTON + 'button();',
	IMPORT + RESTYLE_BUTTON + "button({ size: 'lg' });",
	// A spread props object, and a spread inside it — neither is readable.
	IMPORT + RESTYLE_BUTTON + 'button(...rest);',
	IMPORT + RESTYLE_BUTTON + 'button({ ...rest });',
	// A destructured binding is a property of the wrapper's result, not the
	// wrapped function.
	IMPORT +
		RESTYLE_BUTTON +
		'const { Button } = memo(function Button({ className }) { return <button className={button({ class: className })} />; });\n<Button className="p-4" />;',
	// An override that collides with nothing the call can render: `mt-8` only
	// ships with `size: 'lg'`, which defaultVariants rules out here.
	IMPORT + RESTYLE_BUTTON + "button({ class: 'mt-4' });",
	// A dynamic override is left alone, exactly like no-dynamic-classes does.
	IMPORT + RESTYLE_BUTTON + 'button({ class: extra });',
	// The same exclusion spelled out at the call site.
	IMPORT + RESTYLE_BUTTON + "button({ size: 'sm', class: 'mt-4' });",
	// A dynamic variant value leaves every variant entry in play, so the
	// override is compared against `mt-8` and `text-sm` both — `gap-1` hits
	// neither.
	IMPORT + RESTYLE_BUTTON + "button({ size: dynamic, class: 'gap-1' });",
	// Single-word utilities have no namespace unless exclusiveGroups says so.
	IMPORT +
		"const b = sv({ base: 'flex', variants: {} });\nb({ class: 'block' });",
	// The callee isn't a compiled variant function: a plain call, a config-less
	// `sv()` (which returns a string), and a `createSV()` factory.
	IMPORT + "other({ class: 'p-4' });",
	IMPORT + "const s = sv('p-2');\ns({ class: 'p-4' });",
	IMPORT_CREATE_SV + "const make = createSV({});\nmake({ class: 'p-4' });",
	// A callee that isn't an identifier at all.
	IMPORT + RESTYLE_BUTTON + "(0, button)({ class: 'p-4' });",
	// A `let` binding is never read through.
	IMPORT +
		"let card = sv({ base: 'p-2', variants: {} });\ncard({ class: 'p-4' });",
	// Slot reads that don't name a real slot, or can't be read statically.
	IMPORT_SV_CN + RESTYLE_CARD + "const c = card();\ncn(c.footer, 'px-8');",
	// A private field read is a member expression with no readable name.
	IMPORT_SV_CN + "class A { #s = 'p-2'; m() { return cn(this.#s, 'p-4'); } }",
	// A method call is not a variant-function call.
	IMPORT_SV_CN + RESTYLE_BUTTON + "console.log('p-4');",
	IMPORT_SV_CN + RESTYLE_CARD + "const c = card();\ncn(c[key], 'px-8');",
	// Destructured names that aren't a plain read of one slot: a computed key,
	// a default value, a rest element, and a `let` binding.
	IMPORT_SV_CN +
		RESTYLE_CARD +
		"const { [key]: h } = card();\ncn(h, 'px-8');",
	IMPORT_SV_CN +
		RESTYLE_CARD +
		"const { header = 'x' } = card();\ncn(header, 'px-8');",
	IMPORT_SV_CN +
		RESTYLE_CARD +
		"const { ...rest } = card();\ncn(rest, 'px-8');",
	IMPORT_SV_CN +
		RESTYLE_CARD +
		"let { header } = card();\ncn(header, 'px-8');",
	// A slotted result carries no classes of its own until a slot is read.
	IMPORT_SV_CN + RESTYLE_CARD + "cn(card(), 'p-4');",
	// A member read off something that isn't a call.
	IMPORT_SV_CN + "const o = { base: 'p-2' };\ncn(o.base, 'p-4');",
	// A slot function of a slot that isn't multi-slot still resolves to its
	// slot, but an unrelated call does not.
	IMPORT_SV_CN + RESTYLE_CARD + "cn(other().base, 'p-4');",
	// A variant function that hasn't been called yields no classes yet.
	IMPORT_SV_CN + RESTYLE_BUTTON + "cn(button, 'p-4');",
	// cn() with no slot-variants part is `no-conflicting-classes` territory.
	IMPORT_SV_CN + "cn('p-2', 'p-4');",
	// A substitution that isn't whitespace-isolated can't be tokenized, so the
	// surrounding text is skipped rather than guessed at.
	IMPORT_SV_CN + RESTYLE_CARD + 'const c = card();\ncn(`${c.base}p-4`);',
	// JSX positions with nothing to read.
	IMPORT + '<div className />;',
	IMPORT + '<div {...props} />;',
	IMPORT + '<div id="p-4" />;',
	IMPORT + RESTYLE_CARD + '<svg xlink:href="p-4" />;',
	// A namespaced tag names no component.
	IMPORT + RESTYLE_CARD + '<svg:rect className="p-4" />;',
	// A member of a name that isn't bound names no component.
	IMPORT + RESTYLE_CARD + '<Foo.Bar className="p-4" />;',
	// A host element whose class list has no slot-variants part.
	IMPORT + RESTYLE_CARD + '<div className="p-4 p-2" />;',
	// Components the rule can't read: imported, `let`-bound, not a function,
	// declared twice, and one that never forwards its class prop.
	IMPORT +
		RESTYLE_BUTTON +
		'import { Button } from \'./button.tsx\';\n<Button className="p-4" />;',
	IMPORT +
		RESTYLE_BUTTON +
		'let Button = () => null;\n<Button className="p-4" />;',
	IMPORT + RESTYLE_BUTTON + 'const Button = 5;\n<Button className="p-4" />;',
	IMPORT +
		RESTYLE_BUTTON +
		'var Button = () => null;\nvar Button = () => null;\n<Button className="p-4" />;',
	IMPORT +
		RESTYLE_BUTTON +
		'function Button() { return <button className={button()} />; }\n<Button className="p-4" />;',
	// The component forwards `class`, so a `className` attribute isn't the
	// prop it reads.
	IMPORT +
		RESTYLE_BUTTON +
		'function Button({ class: cls }) { return <button className={button({ class: cls })} />; }\n<Button className="p-4" />;',
	// A props-object read that doesn't name this function's parameter, a
	// destructured binding that shadows nothing, and a computed prop read.
	IMPORT +
		RESTYLE_BUTTON +
		'function Button(props) { return <button className={button({ class: other.className })} />; }\n<Button className="p-4" />;',
	IMPORT +
		RESTYLE_BUTTON +
		'function Button({ className }) { return <button className={button({ class: props.className })} />; }\n<Button className="p-4" />;',
	IMPORT +
		RESTYLE_BUTTON +
		'function Button(props) { return <button className={button({ class: props[key] })} />; }\n<Button className="p-4" />;',
	IMPORT +
		RESTYLE_BUTTON +
		'function Button(props) { return <button className={button({ class: props.title })} />; }\n<Button className="p-4" />;',
	// A rest element, a computed key and a renamed non-identifier target in the
	// props pattern are all skipped.
	IMPORT +
		RESTYLE_BUTTON +
		'function Button({ class: [cls], [key]: k, ...rest }) { return <button className={button({ class: rest })} />; }\n<Button className="p-4" />;',
	// An outer binding of the same name is not this function's parameter.
	IMPORT +
		RESTYLE_BUTTON +
		'const className = "x";\nfunction Button() { return <button className={button({ class: className })} />; }\n<Button className="p-4" />;',
	// A variant prefix is its own namespace, so `hover:p-4` doesn't collide
	// with an unprefixed `p-2`.
	IMPORT + RESTYLE_BUTTON + "button({ class: 'hover:p-4' });",
	// A props-object read through something that isn't the parameter itself.
	IMPORT +
		RESTYLE_BUTTON +
		'function Button(props) { return <button className={button({ class: props.style.className })} />; }\n<Button className="p-4" />;',
	// A binding that shadows the parameter inside a nested scope is not the
	// prop, in either spelling.
	IMPORT +
		RESTYLE_BUTTON +
		'function Button(props) { const f = () => { const props = {}; return button({ class: props.className }); }; return <button className={f()} />; }\n<Button className="p-4" />;',
	IMPORT +
		RESTYLE_BUTTON +
		'function Button({ className }) { const f = () => { const className = x; return button({ class: className }); }; return <button className={f()} />; }\n<Button className="p-4" />;',
	// A forwarded prop merged with nothing slot-variants produces is not a
	// forward worth recording — and a plain template is not a `cn()` list, so
	// its literals aren't classes the component applies through slot-variants.
	IMPORT_SV_CN +
		RESTYLE_BUTTON +
		'function Button({ className }) { return <button className={cn(className)} />; }\n<Button className="p-4" />;',
	IMPORT_SV_CN +
		RESTYLE_BUTTON +
		'function Button({ className }) { return <button className={`p-2 ${className}`} />; }\n<Button className="p-4" />;',
	// A dynamic value that is a declared binding but not a prop.
	IMPORT + RESTYLE_BUTTON + 'let extra;\nbutton({ class: extra });',
	// A wrapper call with no function among its arguments, and a props
	// parameter that is neither a pattern nor an identifier.
	IMPORT +
		RESTYLE_BUTTON +
		'const Button = wrap(...args, 5);\n<Button className="p-4" />;',
	IMPORT +
		RESTYLE_BUTTON +
		'function Button([className]) { return <button className={button({ class: className })} />; }\n<Button className="p-4" />;',
	// A derived props object needs a real props object among the call's
	// arguments: an unbound name, a binding that isn't one, and no identifier
	// at all leave the result untracked.
	IMPORT +
		RESTYLE_BUTTON +
		'const Button = (props) => { const [local] = splitProps(other, [\'class\']); return <button class={button({ class: local.class })} />; };\n<Button class="p-4" />;',
	IMPORT +
		RESTYLE_BUTTON +
		'const other = {};\nconst Button = (props) => { const [local] = splitProps(other, [\'class\']); return <button class={button({ class: local.class })} />; };\n<Button class="p-4" />;',
	IMPORT +
		RESTYLE_BUTTON +
		'const Button = (props) => { const [local] = splitProps(...rest); return <button class={button({ class: local.class })} />; };\n<Button class="p-4" />;',
	// Destructuring in the body needs the props object too: an unbound name
	// and a binding that isn't one aren't it.
	IMPORT +
		RESTYLE_BUTTON +
		'function Button(props) { const { className } = other; return <button className={button({ class: className })} />; }\n<Button className="p-4" />;',
	IMPORT +
		RESTYLE_BUTTON +
		'const other = {};\nfunction Button(props) { const { className } = other; return <button className={button({ class: className })} />; }\n<Button className="p-4" />;',
	// A property read that isn't a plain name.
	IMPORT_SV_CN +
		RESTYLE_BUTTON +
		'class A { #s; m(o) { return cn(button(), o.#s); } }'
];

// Svelte: a class attribute with no slot-variants substitution, and a
// directive rather than a plain attribute.
export const RESTYLE_SVELTE_VALID = [
	// Text glued to a substitution is part of the same class name.
	{
		code: `<script>import { sv } from 'slot-variants';\nconst card = sv({ base: 'p-2', variants: {} });\nconst c = card();</script>\n<div class="{c}p-4">y</div><div class="p-4{c}">z</div>`,
		filename: 'a.svelte'
	},
	{
		code: `<script>import { sv } from 'slot-variants';\nconst card = sv({ base: 'p-2', variants: {} });\nconst c = card();</script>\n<div class="m-1" id="x" class:active={on}>y</div>`,
		filename: 'a.svelte'
	},
	// A member of a namespace whose module can't be found, and a special
	// element, name no component.
	{
		code: `<script>import * as UI from './ui/Button.svelte';</script>\n<UI.Button class="p-4" /><svelte:element this="div" class="p-4" />`,
		filename: 'a.svelte'
	}
];

// Vue: a bound attribute that isn't `class`, an empty binding, a dynamic
// directive argument, a `v-if`, and a class object with no styled sibling.
export const RESTYLE_VUE_VALID = [
	{
		code: `<script setup>import { sv } from 'slot-variants';\nconst card = sv({ base: 'p-2', variants: {} });\nconst c = card();</script>\n<template><div :id="c" v-if="on" :class="{ 'p-4': on }">a</div></template>`,
		filename: 'a.vue'
	},
	{
		code: `<script setup>import { sv } from 'slot-variants';\nconst card = sv({ base: 'p-2', variants: {} });</script>\n<template><div :class="" :[key]="c" class>a</div></template>`,
		filename: 'a.vue'
	}
];

export const RESTYLE_INVALID = [
	// A preset not read in full may set a variant with no default, which is
	// then not taken to be unset.
	...[
		'bigPreset',
		'{ size: pick() }',
		'{ ...bigPreset }',
		"{ size: on ? 'lg' : 'sm' }"
	].map((preset) => ({
		code:
			IMPORT +
			`const b = sv({ variants: { size: { sm: 'm-1', lg: 'p-2' } }, presets: { big: ${preset} } });\nb({ preset: 'big', class: 'p-4' });`,
		errors: [restyle('p-4', 'p-2')]
	})),
	// A variant function called where `sv()` returns it.
	{
		code: IMPORT + "sv({ base: 'p-2', variants: {} })({ class: 'p-4' });",
		errors: [restyle('p-4', 'p-2')]
	},
	// A `createSV()` factory's `base` applies where the config sets none, after
	// the leading class arguments.
	{
		code:
			IMPORT_CREATE_SV +
			"const mySv = createSV({ base: 'p-2' });\nconst b = mySv({ variants: { on: 'm-2' } });\nb({ class: 'p-4' });",
		errors: [restyle('p-4', 'p-2')]
	},
	{
		code:
			IMPORT_CREATE_SV +
			"const mySv = createSV({ base: 'p-2' });\nconst b = mySv('flex', { variants: {} });\nb({ class: 'p-4' });",
		errors: [restyle('p-4', 'p-2')]
	},
	// A variant with no default may still be set: by a prop or a preset, by
	// props or a preset that can't be read in full, or by a parent in
	// `extend`.
	{
		code: IMPORT + RESTYLE_OPTIONAL + "b({ size: s, class: 'p-4' });",
		errors: [restyle('p-4', 'p-2')]
	},
	{
		code:
			IMPORT + RESTYLE_OPTIONAL + "b({ preset: 'small', class: 'p-4' });",
		errors: [restyle('p-4', 'p-2')]
	},
	{
		code: IMPORT + RESTYLE_OPTIONAL + "b({ preset: name, class: 'p-4' });",
		errors: [restyle('p-4', 'p-2')]
	},
	{
		code: IMPORT + RESTYLE_OPTIONAL + "b({ ...rest, class: 'p-4' });",
		errors: [restyle('p-4', 'p-2')]
	},
	{
		code:
			IMPORT +
			"const b = sv({ extend: parent, variants: { size: { sm: 'p-2' } } });\nb({ class: 'p-4' });",
		errors: [restyle('p-4', 'p-2')]
	},
	{
		code:
			IMPORT +
			"const b = sv({ variants: { size: { sm: 'p-2' } }, defaultVariants: { size: pick() } });\nb({ class: 'p-4' });",
		errors: [restyle('p-4', 'p-2')]
	},
	{
		code:
			IMPORT +
			"const b = sv({ variants: { size: { sm: 'p-2' } }, defaultVariants: { ...d } });\nb({ class: 'p-4' });",
		errors: [restyle('p-4', 'p-2')]
	},
	// The compound needs both values, so it applies once both are passed.
	{
		code:
			IMPORT +
			RESTYLE_OPTIONAL +
			"b({ size: 'sm', on: true, class: 'gap-4' });",
		errors: [restyle('gap-4', 'gap-2')]
	},
	// Slots destructured off a result, and a slot read by a string key.
	{
		code:
			IMPORT_SV_CN +
			"const card = sv('p-2', { slots: { header: 'font-bold' } });\nconst { base, header: title } = card();\ncn(title, 'font-normal');\ncn(base, 'p-4');",
		errors: [
			restyle('font-normal', 'font-bold', 'header'),
			restyle('p-4', 'p-2')
		]
	},
	{
		code:
			IMPORT_SV_CN +
			"const card = sv({ slots: { header: 'font-bold' } });\nconst c = card();\ncn(c['header'], 'font-normal');",
		errors: [restyle('font-normal', 'font-bold', 'header')]
	},
	// A multi-slot function destructured off a result.
	{
		code:
			IMPORT +
			"const list = sv({ slots: { item: 'px-2' }, multiSlots: ['item'] });\nconst { item } = list();\nitem({ class: 'px-4' });",
		errors: [restyle('px-4', 'px-2', 'item')]
	},
	// A ternary branch still renders with what surrounds the ternary.
	{
		code:
			IMPORT_SV_CN +
			"const card = sv({ base: 'p-2', variants: {} });\nconst c = card();\ncn(c, on ? 'p-4' : 'm-1');",
		errors: [restyle('p-4', 'p-2')]
	},
	{
		code:
			IMPORT_SV_CN +
			"const card = sv({ base: 'p-2', variants: {} });\nconst c = card();\ncn(on ? [c, 'p-4'] : 'm-1');",
		errors: [restyle('p-4', 'p-2')]
	},
	// A preset not known statically may set any variant value.
	{
		code: IMPORT + RESTYLE_PRESET + "b({ preset: name, class: 'p-4' });",
		errors: [restyle('p-4', 'p-2')]
	},
	{
		code:
			IMPORT + RESTYLE_PRESET + "b({ preset: name, class: 'text-xl' });",
		errors: [restyle('text-xl', 'text-lg')]
	},
	// So may a variant prop that can't be read, or props with a spread,
	// rather than falling back to the default.
	...[
		"button({ size: dynamic, class: 'mt-4' });",
		"button({ ...rest, class: 'mt-4' });",
		"const r = button({ size: dynamic });\n<div className={cn(r, 'mt-4')} />;",
		"function Button({ size }) { return <button className={button({ size, class: 'mt-4' })} />; }"
	].map((call) => ({
		code: IMPORT_SV_CN + RESTYLE_BUTTON + call,
		errors: [restyle('mt-4', 'mt-8')]
	})),
	// The same for a slot call, over the values its result was produced with.
	...[
		"r.header({ size: s, class: 'm-4' });",
		"r.header({ ...s, class: 'm-4' });"
	].map((call) => ({
		code:
			IMPORT +
			"const card = sv({ slots: { header: '' }, multiSlots: ['header'], variants: { size: { sm: { header: 'p-1' }, lg: { header: 'm-2' } } } });\nconst r = card({ size: 'sm' });\n" +
			call,
		errors: [restyle('m-4', 'm-2', 'header')]
	})),
	{
		// A config's spread object adds to its styles, defaults included.
		code:
			IMPORT +
			"const shared = { defaultVariants: { size: 'md' } };\nconst b = sv({ ...shared, variants: { size: { sm: 'p-1', md: 'p-2' } } });\nb({ class: 'p-3' });",
		errors: [restyle('p-3', 'p-2')]
	},
	{
		code: IMPORT + RESTYLE_PRESET + "b({ preset: 'nope', class: 'p-4' });",
		errors: [restyle('p-4', 'p-2')]
	},
	// A preset's value is applied, and a passed prop wins over it.
	{
		code:
			IMPORT + RESTYLE_PRESET + "b({ preset: 'big', class: 'text-xl' });",
		errors: [restyle('text-xl', 'text-lg')]
	},
	{
		code:
			IMPORT +
			RESTYLE_PRESET +
			"b({ preset: 'big', size: 'sm', class: 'p-4' });",
		errors: [restyle('p-4', 'p-2')]
	},
	// The runtime override, against base and against a named slot.
	{
		code: IMPORT + RESTYLE_CARD + "card({ class: 'p-4' });",
		errors: [restyle('p-4', 'p-2')]
	},
	{
		code: IMPORT + RESTYLE_CARD + "card({ className: 'border' });",
		errors: [dup('border')]
	},
	{
		code: IMPORT + RESTYLE_CARD + "card({ class: { header: 'px-8' } });",
		errors: [restyle('px-8', 'px-4', 'header')]
	},
	// `class` wins over `className` when a call passes both.
	{
		code:
			IMPORT +
			RESTYLE_CARD +
			"card({ class: 'p-4', className: 'px-8' });",
		errors: [restyle('p-4', 'p-2')]
	},
	// A group key targets every slot it names — the class is reported once, at
	// the first slot it collides in, rather than once per member slot.
	{
		code:
			IMPORT +
			RESTYLE_CARD +
			"card({ class: { content: 'text-base' } });",
		errors: [restyle('text-base', 'text-sm', 'header')]
	},
	{
		code: IMPORT + RESTYLE_CARD + "card({ class: { body: 'text-base' } });",
		errors: [restyle('text-base', 'text-sm', 'body')]
	},
	// A compoundSlots class is reachable under the default variants.
	{
		code:
			IMPORT +
			RESTYLE_CARD +
			"card({ class: { header: 'tracking-wide' } });",
		errors: [dup('tracking-wide', 'header')]
	},
	// A compoundVariants class needs both its matchers; `size: 'sm'` rules it
	// out, `size: 'lg'` lets it through.
	{
		code:
			IMPORT +
			RESTYLE_CARD +
			"card({ size: 'lg', flat: true, class: 'gap-4' });",
		errors: [restyle('gap-4', 'gap-2')]
	},
	// Fixing the variant the other way lets its own classes through.
	{
		code:
			IMPORT + RESTYLE_BUTTON + "button({ size: 'lg', class: 'mt-4' });",
		errors: [restyle('mt-4', 'mt-8')]
	},
	// Arrays, records, conditionals and logical operands in the override.
	{
		code: IMPORT + RESTYLE_BUTTON + "button({ class: ['mt-1', 'p-4'] });",
		errors: [restyle('p-4', 'p-2')]
	},
	{
		code: IMPORT + RESTYLE_BUTTON + "button({ class: { 'p-4': on } });",
		errors: [restyle('p-4', 'p-2')]
	},
	{
		code:
			IMPORT + RESTYLE_BUTTON + "button({ class: on ? 'p-4' : 'p-8' });",
		errors: [restyle('p-4', 'p-2'), restyle('p-8', 'p-2')]
	},
	{
		code: IMPORT + RESTYLE_BUTTON + "button({ class: on && 'p-4' });",
		errors: [restyle('p-4', 'p-2')]
	},
	// A hoisted const override, and a hoisted props object.
	{
		code:
			IMPORT +
			RESTYLE_BUTTON +
			"const extra = 'p-4';\nbutton({ class: extra });",
		errors: [restyle('p-4', 'p-2')]
	},
	{
		code:
			IMPORT +
			RESTYLE_BUTTON +
			"const props = { class: 'p-4' };\nbutton(props);",
		errors: [restyle('p-4', 'p-2')]
	},
	// Shorthand/longhand overlap: `px-8` covers what `p-2` sets.
	{
		code: IMPORT + RESTYLE_BUTTON + "button({ class: 'px-8' });",
		errors: [restyle('px-8', 'p-2')]
	},
	// Single-word utilities only collide once exclusiveGroups is on.
	{
		code:
			IMPORT +
			"const b = sv({ base: 'flex', variants: {} });\nb({ class: 'block' });",
		options: [{ exclusiveGroups: true }],
		errors: [restyle('block', 'flex')]
	},
	// A Tailwind v3 prefix is stripped before the namespace is read.
	{
		code:
			IMPORT +
			"const b = sv({ base: 'tw-p-2', variants: {} });\nb({ class: 'tw-p-4' });",
		options: [{ prefix: 'tw-' }],
		errors: [restyle('tw-p-4', 'tw-p-2')]
	},
	// A multi-slot slot function pins the slot its override targets, and its
	// own props refine the ones the result already fixed.
	{
		code:
			IMPORT +
			`const list = sv({
	slots: { item: 'px-2 py-1' },
	multiSlots: ['item'],
	variants: { active: 'bg-blue-100' }
});
const classes = list();
classes.item({ class: 'px-4' });`,
		errors: [restyle('px-4', 'px-2', 'item')]
	},
	// A slot call inherits the variant values the result was produced with;
	// `defaultVariants` only fill what neither call passes.
	{
		code: IMPORT + RESTYLE_SIZED_CARD + "r.header({ class: 'text-sm' });",
		errors: [dup('text-sm', 'header')]
	},
	{
		code: IMPORT + RESTYLE_SIZED_CARD + "r.header({ class: 'text-lg' });",
		errors: [restyle('text-lg', 'text-sm', 'header')]
	},
	// The slot call's own props still win over the result's.
	{
		code:
			IMPORT +
			RESTYLE_SIZED_CARD +
			"r.header({ size: 'lg', class: 'text-sm' });",
		errors: [restyle('text-sm', 'text-lg', 'header')]
	},
	// A slot function's own result is class-valued, under its slot.
	{
		code:
			IMPORT_SV_CN +
			`const list = sv({
	slots: { item: 'px-2 py-1' },
	multiSlots: ['item'],
	variants: { active: 'bg-blue-100' }
});
const classes = list();
cn(classes.item({ active: true }), 'px-4');`,
		errors: [restyle('px-4', 'px-2', 'item')]
	},
	// A slot whose group bucket was never written to still reads its own.
	{
		code:
			IMPORT_SV_CN +
			RESTYLE_PANEL +
			"const p = panel();\ncn(p.head, 'px-8');",
		errors: [restyle('px-8', 'px-4', 'head')]
	},
	// Two tokens of one overlap node that don't share a conflict key — they
	// differ in segment count, so only the overlap node unites them.
	{
		code:
			IMPORT +
			"const b = sv({ base: 'mt-4', variants: {} });\nb({ class: 'mt-safe-offset-4' });",
		errors: [restyle('mt-safe-offset-4', 'mt-4')]
	},
	// Classes written next to a slot read, in every shape a class list takes.
	{
		code:
			IMPORT_SV_CN +
			RESTYLE_CARD +
			"const c = card();\ncn(c.base, 'p-4');",
		errors: [restyle('p-4', 'p-2')]
	},
	{
		code:
			IMPORT_SV_CN +
			RESTYLE_CARD +
			'const c = card();\ncn(`${c.header} px-8`);',
		errors: [restyle('px-8', 'px-4', 'header')]
	},
	{
		code:
			IMPORT_SV_CN +
			RESTYLE_CARD +
			"const c = card();\ncn([c.body, 'py-8']);",
		errors: [restyle('py-8', 'py-4', 'body')]
	},
	{
		code:
			IMPORT_SV_CN +
			RESTYLE_CARD +
			"const c = card();\ncn(c.base, on && 'p-4');",
		errors: [restyle('p-4', 'p-2')]
	},
	{
		code:
			IMPORT_SV_CN +
			RESTYLE_CARD +
			"const c = card();\ncn(c.base, on ? 'p-4' : 'p-8');",
		errors: [restyle('p-4', 'p-2'), restyle('p-8', 'p-2')]
	},
	{
		code:
			IMPORT_SV_CN +
			RESTYLE_CARD +
			"const c = card();\ncn(c.base, { 'p-4': on });",
		errors: [restyle('p-4', 'p-2')]
	},
	// A spread argument is skipped; the literal beside it still counts.
	{
		code:
			IMPORT_SV_CN +
			RESTYLE_CARD +
			"const c = card();\ncn(c.base, ...rest, 'p-4');",
		errors: [restyle('p-4', 'p-2')]
	},
	// A config-less `sv()` call is a class list too, and its own result can be
	// the styled side once it's bound.
	{
		code: IMPORT + RESTYLE_CARD + "const c = card();\nsv(c.base, 'p-4');",
		errors: [restyle('p-4', 'p-2')]
	},
	{
		code:
			IMPORT_SV_CN +
			"const base = cn('p-2 rounded');\ncn(base, 'p-4');\ncn(base, 'p-8');",
		errors: [restyle('p-4', 'p-2'), restyle('p-8', 'p-2')]
	},
	// A slotless variant function's result is class-valued on its own.
	{
		code: IMPORT_SV_CN + RESTYLE_BUTTON + "cn(button(), 'p-4');",
		errors: [restyle('p-4', 'p-2')]
	},
	// Two styled parts in one list: the literal is reported once.
	{
		code:
			IMPORT_SV_CN +
			RESTYLE_CARD +
			"const c = card();\ncn(c.base, c.header, 'p-4');",
		errors: [restyle('p-4', 'p-2')]
	},
	// JSX: literals mixed with a slot read, on a host element.
	{
		code:
			IMPORT_SV_CN +
			RESTYLE_CARD +
			'const c = card();\n<div className={`${c.base} p-4`} />;',
		errors: [restyle('p-4', 'p-2')]
	},
	// An escape in the template text is read as the browser sees it.
	{
		code:
			IMPORT_SV_CN +
			RESTYLE_CARD +
			'const c = card();\n<div className={`${c.base} p\\x2d4`} />;',
		errors: [restyle('p-4', 'p-2')]
	},
	{
		code:
			IMPORT_SV_CN +
			RESTYLE_CARD +
			"const c = card();\n<div class={cn(c.header, 'px-8')} />;",
		errors: [restyle('px-8', 'px-4', 'header')]
	},
	// JSX: a same-file component that forwards its class prop, reached from a
	// destructured binding, a renamed one, and the props object.
	{
		code:
			IMPORT +
			RESTYLE_BUTTON +
			'function Button({ id, className }) { return <button id={id} className={button({ class: className })} />; }\n<Button className="p-4 rounded" />;',
		errors: [restyle('p-4', 'p-2'), dup('rounded')]
	},
	{
		code:
			IMPORT +
			RESTYLE_BUTTON +
			'const Button = ({ class: cls }) => <button className={button({ class: cls })} />;\n<Button class="p-4" />;',
		errors: [restyle('p-4', 'p-2')]
	},
	{
		code:
			IMPORT +
			RESTYLE_BUTTON +
			'function Button(props) { return <button className={button({ class: props.className })} />; }\n<Button className="p-4" />;',
		errors: [restyle('p-4', 'p-2')]
	},
	// A usage written above the component's own declaration still resolves.
	{
		code:
			IMPORT +
			RESTYLE_BUTTON +
			'const App = () => <Button className="p-4" />;\nfunction Button({ className }) { return <button className={button({ class: className })} />; }',
		errors: [restyle('p-4', 'p-2')]
	},
	// A wrapper between the component and the call (Solid's createMemo shape)
	// still attributes the forward to the component.
	{
		code:
			IMPORT +
			RESTYLE_BUTTON +
			'function Button(props) { const c = createMemo(() => button({ class: props.class })); return <button class={c()} />; }\n<Button class="p-4" />;',
		errors: [restyle('p-4', 'p-2')]
	},
	// Only the first forward a component makes is recorded.
	{
		code:
			IMPORT +
			RESTYLE_BUTTON +
			'function Button({ className }) { button({ class: className }); return <button className={button({ class: className, size: \'lg\' })} />; }\n<Button className="p-4" />;',
		errors: [restyle('p-4', 'p-2')]
	},
	// A slot-keyed override on a component reached through its own attribute
	// resolves against the slot the string targets.
	{
		code:
			IMPORT +
			RESTYLE_CARD +
			'function Card({ className }) { return <div className={card({ class: className }).base} />; }\n<Card className="border" />;',
		errors: [dup('border')]
	},
	// The prop forwarded as a sibling of the variant result in one class list
	// — a `cn()` call, and a template — rather than as its override.
	{
		code:
			IMPORT_SV_CN +
			RESTYLE_BUTTON +
			'function Button({ className, size }) { return <button className={cn(button({ size }), className)} />; }\n<Button className="p-4" />;',
		errors: [restyle('p-4', 'p-2')]
	},
	{
		code:
			IMPORT +
			RESTYLE_BUTTON +
			'function Button({ className }) { return <button className={`${button()} ${className}`} />; }\n<Button className="p-4" />;',
		errors: [restyle('p-4', 'p-2')]
	},
	// Inside a `cn()` list the literals are classes the component applies
	// itself, with no config at all.
	{
		code:
			IMPORT_CN +
			'function Button({ className }) { return <button className={cn("p-2 rounded", className)} />; }\n<Button className="p-4 rounded" />;',
		errors: [restyle('p-4', 'p-2'), dup('rounded')]
	},
	// A default value keeps the binding a prop.
	{
		code:
			IMPORT +
			RESTYLE_BUTTON +
			'function Button({ className = \'\' }) { return <button className={button({ class: className })} />; }\n<Button className="p-4" />;',
		errors: [restyle('p-4', 'p-2')]
	},
	// A component wrapped in `forwardRef()` / `memo()`, however deeply.
	{
		code:
			IMPORT +
			RESTYLE_BUTTON +
			'const Button = React.forwardRef(({ className }, ref) => <button ref={ref} className={button({ class: className })} />);\n<Button className="p-4" />;',
		errors: [restyle('p-4', 'p-2')]
	},
	{
		code:
			IMPORT +
			RESTYLE_BUTTON +
			'const Button = memo(forwardRef(function Button({ className }, ref) { return <button ref={ref} className={button({ class: className })} />; }));\n<Button className="p-4" />;',
		errors: [restyle('p-4', 'p-2')]
	},
	// A wrapper handed a component by name, a plain alias of one, and a
	// wrapper whose later argument is a function that isn't the component.
	{
		code:
			IMPORT +
			RESTYLE_BUTTON +
			'function ButtonImpl({ className }) { return <button className={button({ class: className })} />; }\nconst Button = memo(ButtonImpl);\n<Button className="p-4" />;',
		errors: [restyle('p-4', 'p-2')]
	},
	{
		code:
			IMPORT +
			RESTYLE_BUTTON +
			'const ButtonImpl = ({ className }) => <button className={button({ class: className })} />;\nconst Button = ButtonImpl;\n<Button className="p-4" />;',
		errors: [restyle('p-4', 'p-2')]
	},
	{
		code:
			IMPORT +
			RESTYLE_BUTTON +
			'function ButtonImpl({ className }) { return <button className={button({ class: className })} />; }\nconst Button = memo(ButtonImpl, (a, b) => a.id === b.id);\n<Button className="p-4" />;',
		errors: [restyle('p-4', 'p-2')]
	},
	// A props parameter with a default, destructured or taken whole.
	{
		code:
			IMPORT +
			RESTYLE_BUTTON +
			'function Button({ className } = {}) { return <button className={button({ class: className })} />; }\n<Button className="p-4" />;',
		errors: [restyle('p-4', 'p-2')]
	},
	{
		code:
			IMPORT +
			RESTYLE_BUTTON +
			'function Button(props = {}) { return <button className={button({ class: props.className })} />; }\n<Button className="p-4" />;',
		errors: [restyle('p-4', 'p-2')]
	},
	// Solid: the props object split or merged into another object.
	{
		code:
			IMPORT +
			RESTYLE_BUTTON +
			'const Button = (props) => { const [local, others] = splitProps(props, [\'class\']); return <button class={button({ class: local.class })} {...others} />; };\n<Button class="p-4" />;',
		errors: [restyle('p-4', 'p-2')]
	},
	{
		code:
			IMPORT +
			RESTYLE_BUTTON +
			'const Button = (props) => { const merged = mergeProps({ size: \'sm\' }, props); return <button class={button({ class: merged.class })} />; };\n<Button class="p-4" />;',
		errors: [restyle('p-4', 'p-2')]
	},
	// The props object destructured, or renamed, inside the component body.
	{
		code:
			IMPORT +
			RESTYLE_BUTTON +
			'function Button(props) { const { className } = props; return <button className={button({ class: className })} />; }\n<Button className="p-4" />;',
		errors: [restyle('p-4', 'p-2')]
	},
	{
		code:
			IMPORT +
			RESTYLE_BUTTON +
			'function Button(props) { const p = props; return <button className={button({ class: p.className })} />; }\n<Button className="p-4" />;',
		errors: [restyle('p-4', 'p-2')]
	}
];

export const RESTYLE_SVELTE_INVALID = [
	// Svelte: literal runs around a substitution, and a `class` attribute that
	// is a single substitution beside a static one.
	{
		code: `<script>import { sv } from 'slot-variants';\nconst card = sv({ base: 'p-2 rounded', variants: {} });\nconst c = card();</script>\n<div class="p-4 {c} rounded">y</div>`,
		filename: 'a.svelte',
		errors: [restyle('p-4', 'p-2'), dup('rounded')]
	},
	{
		code: `<script>import { sv, cn } from 'slot-variants';\nconst card = sv({ slots: { header: 'px-4' } });\nconst c = card();</script>\n<div class={cn(c.header, 'px-8')}>y</div>`,
		filename: 'a.svelte',
		errors: [restyle('px-8', 'px-4', 'header')]
	}
];

export const RESTYLE_VUE_INVALID = [
	// Vue: a static `class` merged with a `:class` binding on one element, an
	// array binding, a template binding, and a conditional inside one.
	{
		code: `<script setup>import { sv } from 'slot-variants';\nconst card = sv({ base: 'p-2', variants: {} });\nconst c = card();</script>\n<template><div class="p-4" :class="c">a</div></template>`,
		filename: 'a.vue',
		errors: [restyle('p-4', 'p-2')]
	},
	{
		code: `<script setup>import { sv } from 'slot-variants';\nconst card = sv({ base: 'p-2', variants: {} });\nconst c = card();</script>\n<template><div :class="[c, 'p-8']">a</div><div :class="\`\${c} p-6\`">b</div></template>`,
		filename: 'a.vue',
		errors: [restyle('p-8', 'p-2'), restyle('p-6', 'p-2')]
	},
	// Vue: an identifier the script never binds is left as itself.
	{
		code: `<script setup>import { sv } from 'slot-variants';\nconst card = sv({ base: 'p-2', variants: {} });\nconst c = card();</script>\n<template><div :class="[c, unknown, 'p-8']">a</div></template>`,
		filename: 'a.vue',
		errors: [restyle('p-8', 'p-2')]
	},
	// Vue: a `cn()` call and a variant call's override written inside the
	// template itself.
	{
		code: `<script setup>import { cn, sv } from 'slot-variants';\nconst card = sv({ base: 'p-2', variants: {} });\nconst c = card();</script>\n<template><div :class="cn(c, 'p-8')">a</div><div :class="card({ class: 'p-6' })">b</div></template>`,
		filename: 'a.vue',
		errors: [restyle('p-8', 'p-2'), restyle('p-6', 'p-2')]
	}
];