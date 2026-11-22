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

// A component whose variants come from its own props.
const RESTYLE_SIZED = `const sized = sv({
	base: 'p-2',
	variants: {
		size: { sm: 'text-sm', md: 'text-base' },
		tone: { red: 'bg-red-500' },
		flat: { true: 'shadow-none' }
	},
	defaultVariants: { size: 'md' }
});
function Sized({ size, tone, flat, className }) {
	return <b className={sized({ size, tone, flat, class: className })} />;
}\n`;

// The button above with a preset, and one whose values aren't known in full.
const RESTYLE_PRESET_BUTTON = `const button = sv({
	base: 'p-2 rounded',
	variants: { size: { sm: 'text-sm', lg: 'mt-8' } },
	defaultVariants: { size: 'sm' },
	presets: { big: { size: 'lg' }, odd: { ...extra, size: 'lg' } }
});\n`;

export const RESTYLE_VALID = [
	// A class a spread passes that an attribute after it replaces never
	// renders, and one a spread that can't be read in full may pass isn't
	// read.
	IMPORT_SV_CN +
		RESTYLE_BUTTON +
		`function Button({ className }) {
	const classes = cn(button(), className);
	return <button {...{ className: classes }} className="x" />;
}
function Plain({ className }) {
	return <button className={button({ class: className })} />;
}
<Button className="p-4" />;
<Plain {...{ className: 'p-4' }} className="x" />;
<Plain {...{ className: 'p-4', ...rest }} />;
<Plain {...{ id: 'p-4' }} />;`,
	// An object `splitProps()` picks holds only the props its key list names:
	// its spread carries no other, the rest carries none of them, an element
	// past the rest holds nothing, and a name it doesn't hold reads as no prop.
	IMPORT +
		RESTYLE_BUTTON +
		`function Picked(props) {
	const [local, others] = splitProps(props, ['class']);
	return <button class={button({ ...local, class: props.class })} />;
}
function Rest(props) {
	const [local, others] = splitProps(props, ['class', 'size']);
	return <button class={button(others)} />;
}
function Past(props) {
	const [local, others, extra] = splitProps(props, ['class']);
	return <button class={button(extra)} />;
}
function Missing(props) {
	const [local] = splitProps(props, ['size']);
	const { class: c } = local;
	return <button class={button({ class: c, size: local.tone })} />;
}
function Twice(props) {
	const [first] = splitProps(props, ['class', 'size']);
	const [second] = splitProps(first, ['size', 'tone']);
	return <button class={button(second)} />;
}
<Picked size="lg" class="mt-2" />;
<Picked {...unknown} class="mt-2" />;
<Rest class="p-4" />;
<Past class="p-4" />;
<Missing class="p-4" />;
<Twice class="p-4" />;`,
	// A spread of an object literal is read where it's written: its `size`
	// replaces the one ahead of it, and the one after it replaces its own.
	IMPORT +
		RESTYLE_BUTTON +
		`const big = { size: 'lg' };
button({ size: 'sm', ...big, class: 'text-base' });
button({ ...big, size: 'sm', class: 'mt-2' });`,
	// A component's rest spread written after a prop may replace it, so the
	// element's `size` applies; a rest that leaves the class out carries none.
	IMPORT +
		RESTYLE_BUTTON +
		`function Button({ className, ...rest }) {
	return <button className={button({ size: 'sm', ...rest, class: className })} />;
}
function Bare({ className, class: c, ...rest }) {
	return <button className={button(rest)} />;
}
<Button size="lg" className="text-base" />;
<Bare className="p-4" class="p-4" />;`,
	// A spread of anything but the component's props carries no class of an
	// element's, and a computed key tells nothing of what it passes.
	IMPORT +
		RESTYLE_BUTTON +
		`function Button(props) {
	return <button className={button({ ...other, ...props.nested, [key]: props })} />;
}
function Nested(props) {
	return <button className={button({ ...props.nested })} />;
}
<Button className="p-4" />;
<Nested className="p-4" />;`,
	// A binding assigned to again no longer holds the element's prop, nor
	// does a props object.
	IMPORT +
		RESTYLE_BUTTON +
		`function Button({ className }) {
	className = 'fixed';
	return <button className={button({ class: className })} />;
}
function Whole(props) {
	props = normalize(props);
	return <button className={button({ class: props.className })} />;
}
<Button className="p-4" />;
<Whole className="p-4" />;`,
	// A class written after the spread is the one that applies, so only the
	// prop it reads by name is forwarded.
	IMPORT +
		RESTYLE_BUTTON +
		`function Button(props) {
	return <button className={button({ ...props, class: props.className })} />;
}
<Button class="p-4" />;`,
	// A slot function destructured off its own call names nothing.
	IMPORT_SV_CN + "const { item } = item();\ncn(item(), 'p-2');",
	// A `const` holding itself is left unread rather than walked forever.
	IMPORT_SV_CN +
		"const b = sv({ base: 'p-2', variants: {} });\nconst list = ['m-4', list];\nconst t = `a ${t}`;\nconst c = cn('b', c);\nb({ class: list });\ncn(t, c);",
	// `$attrs` outside a Vue template is no forward.
	IMPORT_SV_CN +
		'const tag = sv({ base: \'m-1\', variants: {} });\nfunction Tag() { return <i className={cn(tag(), $attrs.class)} />; }\n<Tag className="m-2" />;',
	// An element's variant props select the classes a component applies: a
	// variant with no default stays unset unless passed, and `null` unsets
	// one.
	IMPORT +
		RESTYLE_SIZED +
		'<Sized className="bg-blue-500 shadow-lg" />;\n<Sized size={null} className="text-lg" />;',
	// A destructured prop's `null` default unsets its variant.
	IMPORT +
		RESTYLE_SIZED +
		'function Nulled({ size = null, className }) { return <b className={sized({ size, class: className })} />; }\n<Nulled className="text-lg" />;',
	// The two sides of an `||` or `??` never render together.
	IMPORT_SV_CN +
		RESTYLE_BUTTON +
		"cn(button() || 'p-4');\ncn(x ?? 'mt-8', button());",
	IMPORT_SV_CN +
		RESTYLE_BUTTON +
		'function Button({ className }) { return <button className={className || button()} />; }\n<Button className="p-4" />;',
	// Only literals inside the `cn()` list are merged with the prop.
	IMPORT_SV_CN +
		'function Inner({ className }) { return <div className={`${cn(\'x\', className)} m-2`} />; }\n<Inner className="m-4" />;',
	// A slot call's preset replaces the outer call's, whose values are lost.
	IMPORT +
		"const card = sv({ slots: { header: '' }, multiSlots: ['header'], variants: { size: { sm: { header: 'm-1' }, lg: { header: 'p-2' } }, tone: { red: { header: 'text-red' } } }, presets: { big: { size: 'lg' }, compact: { tone: 'red' } }, defaultVariants: { size: 'sm' } });\nconst r = card({ preset: 'big' });\nr.header({ preset: 'compact', class: 'p-4' });",
	// A slot call's preset can't change a variant the outer call passes.
	IMPORT +
		"const card = sv({ slots: { header: '' }, multiSlots: ['header'], variants: { size: { sm: { header: 'm-1' }, lg: { header: 'p-2' } } }, presets: { big: { size: 'lg' } }, defaultVariants: { size: 'sm' } });\nconst r = card({ size: 'sm' });\nr.header({ preset: 'big', class: 'p-4' });",
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
		// A \`v-bind\` object that can't be read in full, one with no class, a
		// bound attribute, and another directive pass no class.
		code: `<script setup>import { sv } from 'slot-variants';\nconst card = sv({ base: 'p-2', variants: {} });\nconst c = card();</script>\n<template><div v-bind="{ class: 'p-4', ...rest }" :class="c">a</div><div v-bind="{ id: 'p-4' }" :class="c">b</div><div v-bind:title="'p-4'" v-on="handlers" :class="c">c</div><div v-bind="attrs" :class="c">d</div></template>`,
		filename: 'a.vue'
	},
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
	{
		// A class an object spread into an element's attributes passes is
		// read as a class attribute: a \`const\` class list forwarding the
		// component's class, and a class passed to a component, through a
		// \`const\` or after an attribute it then replaces.
		code:
			IMPORT_SV_CN +
			RESTYLE_BUTTON +
			`function Button({ className }) {
	const classes = cn(button(), className);
	return <button {...{ className: classes }} />;
}
function Plain({ className }) {
	return <button className={button({ class: className })} />;
}
const attrs = { className: 'p-6' };
<Button className="p-4" />;
<Plain {...attrs} />;
<Plain className="x" {...{ className: 'p-8' }} />;
<Plain {...{ className: 'p-1' }} {...other} />;`,
		errors: [
			restyle('p-6', 'p-2'),
			restyle('p-4', 'p-2'),
			restyle('p-8', 'p-2'),
			restyle('p-1', 'p-2')
		]
	},
	{
		// An object `splitProps()` picks carries the props it names, bound to
		// a name or destructured, those of an element's own spread included;
		// a key list that can't be read in full may name any, and a rest
		// carries what its own source does.
		code:
			IMPORT +
			RESTYLE_BUTTON +
			`function Picked(props) {
	const [local, others] = splitProps(props, ['class']);
	return <button class={button({ ...local, class: props.class })} />;
}
function Destructured(props) {
	const [{ class: cls }, others] = splitProps(props, ['class']);
	return <button class={button({ class: cls })} />;
}
function Unread(props) {
	const [local, others] = splitProps(props, keys);
	return <button class={button(local)} />;
}
function Partly(props) {
	const [local, , others = {}] = splitProps(props, ['size', key], [, 'x']);
	return <button class={button({ ...local, class: props.class })} />;
}
function Both(props) {
	const [local, others] = splitProps(props, ['size']);
	return <button class={button({ ...local, ...others })} />;
}
function FromRest({ size, ...rest }) {
	const [local] = splitProps(rest, ['size', 'class']);
	return <button class={button(local)} />;
}
function Sized(props) {
	const [local] = splitProps(props, ['size']);
	return <button class={button({ ...local, class: props.class })} />;
}
<Picked size="lg" class="text-lg" />;
<Sized {...unknown} class="mt-6" />;
<Destructured class="p-4" />;
<Unread class="p-6" />;
<Partly size="lg" class="mt-2" />;
<Both size="lg" class="mt-4" />;
<FromRest size="lg" class="p-1 mt-1" />;`,
		errors: [
			restyle('text-lg', 'text-sm'),
			restyle('mt-6', 'mt-8'),
			restyle('p-4', 'p-2'),
			restyle('p-6', 'p-2'),
			restyle('mt-2', 'mt-8'),
			restyle('mt-4', 'mt-8'),
			restyle('p-1', 'p-2')
		]
	},
	{
		// A spread of an object literal is read where it's written, its
		// class included, through a `const` or inline.
		code:
			IMPORT +
			RESTYLE_BUTTON +
			`const big = { size: 'lg' };
const extra = { class: 'p-4' };
button({ size: 'sm', ...big, class: 'mt-2' });
button({ ...extra });
button({ ...{ class: 'p-6' } });`,
		errors: [
			restyle('p-4', 'p-2'),
			restyle('mt-2', 'mt-8'),
			restyle('p-6', 'p-2')
		]
	},
	{
		// A prop written ahead of a spread that can't be read may be
		// replaced by it, so it takes any of its values.
		code:
			IMPORT +
			RESTYLE_BUTTON +
			`button({ size: 'sm', ...other, class: 'mt-2' });
button({ size: 'sm', [key]: 1, class: 'mt-4' });`,
		errors: [restyle('mt-2', 'mt-8'), restyle('mt-4', 'mt-8')]
	},
	{
		// A component's rest spread written after a prop replaces it with
		// the element's, and leaves it alone when the element passes none.
		code:
			IMPORT +
			RESTYLE_BUTTON +
			`function Button({ className, ...rest }) {
	return <button className={button({ size: 'sm', ...rest, class: className })} />;
}
<Button size="lg" className="mt-2" />;
<Button className="text-base" />;`,
		errors: [restyle('mt-2', 'mt-8'), restyle('text-base', 'text-sm')]
	},
	{
		// The class reaches a call through the props it's handed whole,
		// spread, or as the rest of them, under either name.
		code:
			IMPORT +
			RESTYLE_BUTTON +
			`function Whole(props) {
	return <button className={button(props)} />;
}
function Spread(props) {
	return <button className={button({ ...props })} />;
}
const Rest = ({ children, ...rest }) => <button className={button(rest)} />;
const Named = ({ class: c, ...rest }) => <button className={button(rest)} />;
<Whole className="p-4" />;
<Spread class="p-6" />;
<Rest className="p-8" />;
<Named className="p-1" class="p-3" />;`,
		errors: [
			restyle('p-4', 'p-2'),
			restyle('p-6', 'p-2'),
			restyle('p-8', 'p-2'),
			restyle('p-1', 'p-2')
		]
	},
	{
		// A class written ahead of the spread applies unless the element
		// passes one, so both are checked; a component reading one by name
		// as well keeps that one for it.
		code:
			IMPORT +
			RESTYLE_BUTTON +
			`function Fallback(props) {
	return <button className={button({ class: 'p-4', ...props })} />;
}
function Both(props) {
	return <><i className={button({ class: props.className })} /><b className={button(props)} /></>;
}
function Reversed(props) {
	return <><b className={button(props)} /><i className={button({ class: props.className })} /></>;
}
<Fallback className="p-6" />;
<Both className="p-8" />;
<Reversed className="p-1" />;`,
		errors: [
			restyle('p-4', 'p-2'),
			restyle('p-6', 'p-2'),
			restyle('p-8', 'p-2'),
			restyle('p-1', 'p-2')
		]
	},
	{
		// A slot function's own prop replaces the outer call's, whatever
		// that spreads.
		code:
			IMPORT +
			`const list = sv({
	slots: { item: 'px-2' },
	multiSlots: ['item'],
	variants: { size: { sm: { item: 'text-sm' }, lg: { item: 'mt-8' } } },
	defaultVariants: { size: 'sm' }
});
const classes = list({ size: 'sm', ...other });
classes.item({ size: 'lg', class: 'mt-2' });
classes.item({ size: undefined, class: 'mt-4' });`,
		errors: [
			restyle('mt-2', 'mt-8', 'item'),
			restyle('mt-4', 'mt-8', 'item')
		]
	},
	{
		// A nullish `class` falls back to `className`, as at runtime.
		code:
			IMPORT +
			RESTYLE_BUTTON +
			`button({ class: undefined, className: 'p-4' });
button({ class: null, className: 'p-6' });
button({ class: 'm-1', className: 'p-8' });`,
		errors: [restyle('p-4', 'p-2'), restyle('p-6', 'p-2')]
	},
	{
		// A component naming a preset that isn't known in full: the preset
		// may set any variant, its defaults included.
		code:
			IMPORT +
			`const button = sv({ base: 'p-2', variants: { size: { sm: 'text-sm', lg: 'mt-8' }, tone: { a: 'gap-1', b: 'm-1' } }, defaultVariants: { size: 'sm', tone: 'b' }, presets: { odd: { ...extra, size: 'lg' } } });
function Button({ className }) {
	return <button className={button({ preset: 'odd', class: className })} />;
}
<Button className="gap-4" />;
<Button className="text-lg" />;`,
		errors: [restyle('gap-4', 'gap-1')]
	},
	{
		// Solid: an object merged above the props forces its values over the
		// element's, while `omit()` and the rest of `splitProps()` leave out
		// the props they name.
		code:
			IMPORT +
			RESTYLE_PRESET_BUTTON +
			`function Forced(props) {
	const merged = mergeProps(props, { size: 'lg', tone: undefined });
	return <button class={button({ size: merged.size, class: merged.class })} />;
}
function Destructured(props) {
	const { size, class: cls } = mergeProps({ size: 'sm' }, props, { size: 'lg' });
	return <button class={button({ size, class: cls })} />;
}
function Omitted(props) {
	const others = omit(props, 'class', name, 'size');
	return <button class={button({ ...others, class: props.class })} />;
}
function Split(props) {
	const [local, others] = splitProps(props, ['class', 'size']);
	return <button class={button({ ...others, class: local.class })} />;
}
function Picked(props) {
	const [local, sized, ...more] = splitProps(props, ['class'], ['size']);
	return <button class={button({ ...sized, class: local.class })} />;
}
function Holed(props) {
	const [, others] = splitProps(props, ['size']);
	return <button class={button({ ...others, class: props.class })} />;
}
<Forced size="sm" class="mt-2" />;
<Forced size="sm" class="text-lg" />;
<Destructured size="sm" class="mt-2" />;
<Omitted size="lg" class="mt-2" />;
<Omitted size="lg" class="text-lg" />;
<Split size="lg" class="mt-2" />;
<Split size="lg" class="text-lg" />;
<Picked size="lg" class="mt-2" />;
<Holed size="lg" class="text-lg" />;
function Computed(props) {
	return <button class={button({ size: props['size'], class: props.class })} />;
}
function Other(props) {
	return <button class={button({ size: options.size, class: props.class })} />;
}
<Computed size="sm" class="mt-2" />;
<Other size="sm" class="mt-2" />;`,
		errors: [
			restyle('mt-2', 'mt-8'),
			restyle('mt-2', 'mt-8'),
			restyle('text-lg', 'text-sm'),
			restyle('text-lg', 'text-sm'),
			restyle('mt-2', 'mt-8'),
			restyle('text-lg', 'text-sm'),
			restyle('mt-2', 'mt-8'),
			restyle('mt-2', 'mt-8')
		]
	},
	{
		// A rest of the props leaves out the props its pattern destructures,
		// unless another spread carries them; one leaving out `preset` passes
		// none on.
		code:
			IMPORT +
			RESTYLE_PRESET_BUTTON +
			`function Rest({ className, size, ...rest }) {
	return <button data-size={size} className={button({ ...rest, class: className })} />;
}
function Body(props) {
	const { size, ...rest } = props;
	return <button data-size={size} className={button({ ...rest, ...props, class: props.className })} />;
}
function NoPreset({ className, preset, ...rest }) {
	return <button data-preset={preset} className={button({ ...rest, class: className })} />;
}
<Rest size="lg" className="mt-2" />;
<Rest size="lg" className="text-lg" />;
<Rest {...other} className="text-lg" />;
<Body size="lg" className="mt-2" />;
<NoPreset preset="big" className="text-lg" />;`,
		errors: [
			restyle('text-lg', 'text-sm'),
			restyle('text-lg', 'text-sm'),
			restyle('mt-2', 'mt-8'),
			restyle('text-lg', 'text-sm')
		]
	},
	{
		// A variant read from a prop with no default is passed as `undefined`
		// by an element leaving the prop out, so the element's preset sets
		// it; an element passing it, or a prop default, still wins.
		code:
			IMPORT +
			RESTYLE_PRESET_BUTTON +
			`function Button({ preset, size, className }) {
	return <button className={button({ preset, size, class: className })} />;
}
function Sized({ preset, size = 'sm', className }) {
	return <button className={button({ preset, size, class: className })} />;
}
<Button preset="big" className="mt-2" />;
<Button preset="big" className="text-lg" />;
<Button preset={name} className="text-lg" />;
<Button preset="big" size="sm" className="text-lg" />;
<Sized preset="big" className="text-lg" />;`,
		errors: [
			restyle('mt-2', 'mt-8'),
			restyle('text-lg', 'text-sm'),
			restyle('text-lg', 'text-sm'),
			restyle('text-lg', 'text-sm')
		]
	},
	{
		// A spread or later attribute passing `undefined` takes back a prop
		// passed before it, leaving the default.
		code:
			IMPORT +
			RESTYLE_SIZED +
			`<Sized size="sm" {...{ size: undefined }} className="text-lg" />;
<Sized size="sm" size={undefined} className="text-sm" />;`,
		errors: [
			restyle('text-lg', 'text-base'),
			restyle('text-sm', 'text-base')
		]
	},
	{
		// A slot object held in a `const` targets its slots, and a key naming
		// a slot is no `cn()` class.
		code:
			IMPORT +
			`const card = sv('border p-2', { slots: { header: 'font-bold px-4', 'p-4': 'm-2' } });
const o = { header: 'px-8' };
const k = { 'p-4': 'm-1' };
card({ class: o });
card({ class: k });`,
		errors: [
			restyle('px-8', 'px-4', 'header'),
			restyle('m-1', 'm-2', 'p-4')
		]
	},
	{
		// A config declaring only the `base` slot still takes slot objects,
		// and its result is a string.
		code:
			IMPORT_SV_CN +
			`const c = sv({ slots: { base: 'p-2' }, variants: { a: { x: { base: 'm-1' } } } });
c({ a: 'x', class: 'm-2' });
cn(c(), 'p-4');`,
		errors: [restyle('m-2', 'm-1'), restyle('p-4', 'p-2')]
	},
	// An element's variant props select the classes a component applies:
	// static text, a static expression and a bare boolean attribute are read;
	// `undefined` or a namespaced attribute leaves the default; a spread that
	// can't be read, or a value that can't be, may select any.
	{
		code:
			IMPORT +
			RESTYLE_SIZED +
			`<Sized size="sm" className="text-sm" />;
<Sized size={'sm'} className="text-lg" />;
<Sized flat className="shadow-lg" />;
<Sized size={undefined} className="text-xl" />;
<Sized {...rest} a:size="sm" className="text-2xl" />;
<Sized size={pick()} className="text-3xl" />;`,
		errors: [
			dup('text-sm'),
			restyle('text-lg', 'text-sm'),
			restyle('shadow-lg', 'shadow-none'),
			restyle('text-xl', 'text-base'),
			restyle('text-2xl', 'text-sm'),
			restyle('text-3xl', 'text-sm')
		]
	},
	// A destructured prop's default stands in for a prop the element doesn't
	// pass, or passes as `undefined`; an `undefined` default leaves the
	// config's, and one that can't be read may select any value.
	{
		code:
			IMPORT +
			RESTYLE_SIZED +
			`function Defaulted({ size = 'sm', tone = 'red', flat = pick(), className }) {
	return <b className={sized({ size, tone, flat, class: className })} />;
}
function Undef({ size = undefined, className }) {
	return <b className={sized({ size, class: className })} />;
}
<Defaulted className="text-lg" />;
<Defaulted size={undefined} className="bg-blue-500" />;
<Defaulted size="md" className="shadow-lg" />;
<Undef className="text-xl" />;`,
		errors: [
			restyle('text-lg', 'text-sm'),
			restyle('bg-blue-500', 'bg-red-500'),
			restyle('shadow-lg', 'shadow-none'),
			restyle('text-xl', 'text-base')
		]
	},
	// Solid: the objects `mergeProps()` merges below the props are their
	// defaults, through a `splitProps()` view too; a pattern's own default
	// wins over them.
	{
		code:
			IMPORT +
			RESTYLE_SIZED +
			`const DEFAULTS = { size: 'sm' };
function Solid(props) {
	const merged = mergeProps(DEFAULTS, props);
	const [local] = splitProps(merged, ['class', 'size']);
	return <b class={sized({ size: local.size, class: local.class })} />;
}
function Pattern(props) {
	const { size = 'md', tone, class: cls } = mergeProps({ size: 'sm', tone: 'red' }, props);
	return <b class={sized({ size, tone, class: cls })} />;
}
<Solid class="text-lg" />;
<Solid size="md" class="text-xl" />;
<Pattern class="text-2xl bg-blue-500" />;`,
		errors: [
			restyle('text-lg', 'text-sm'),
			restyle('text-xl', 'text-base'),
			restyle('text-2xl', 'text-base'),
			restyle('bg-blue-500', 'bg-red-500')
		]
	},
	// A props object read; and a variant read from another component's prop,
	// which an element of this one can't pass, or from no prop, which may
	// select any value, as in a direct call.
	{
		code:
			IMPORT +
			RESTYLE_SIZED +
			`function Member(props) {
	return <b className={sized({ size: props.size, class: props.className })} />;
}
function Outer({ size }) {
	const Inner = ({ className }) => <b className={sized({ size, class: className })} />;
	return <Inner size="sm" className="text-lg" />;
}
function Picked({ className }) {
	return <b className={sized({ size: pick(), class: className })} />;
}
<Member size="sm" className="text-xl" />;
<Picked size="md" className="text-2xl" />;`,
		errors: [
			restyle('text-lg', 'text-sm'),
			restyle('text-xl', 'text-sm'),
			restyle('text-2xl', 'text-sm')
		]
	},
	// The left side of an `||` or `??` renders too.
	{
		code:
			IMPORT_SV_CN +
			RESTYLE_BUTTON +
			"cn(button() || '', 'p-4');\ncn(x ?? button(), 'p-6');",
		errors: [restyle('p-4', 'p-2'), restyle('p-6', 'p-2')]
	},
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
	// A slot call's preset sets the variants the outer call's own props leave
	// alone, and may set any of them when its name or those props can't be
	// read.
	...(
		[
			['card()', "'big'", 'p-4', 'p-2'],
			["card({ class: 'x' })", "'big'", 'p-4', 'p-2'],
			["card({ size: 'sm' })", "'big'", 'm-4', 'm-1'],
			["card({ size: 'sm' })", 'name', 'm-4', 'm-1'],
			["card({ size: 'sm', tone: 'red' })", 'name', 'm-4', 'm-1'],
			['card()', 'name', 'p-4', 'p-2'],
			['card({ ...p })', "'big'", 'p-4', 'p-2'],
			// A slot call's preset replaces the outer call's.
			["card({ preset: 'big' })", "'compact'", 'm-4', 'm-1']
		] as const
	).map(([outer, preset, cls, other]) => ({
		code:
			IMPORT +
			`const card = sv({ slots: { header: '' }, multiSlots: ['header'], variants: { size: { sm: { header: 'm-1' }, lg: { header: 'p-2' } }, tone: { red: { header: 'text-red' } } }, presets: { big: { size: 'lg' }, compact: { tone: 'red' } }, defaultVariants: { size: 'sm' } });\nconst r = ${outer};\nr.header({ preset: ${preset}, class: '${cls}' });`,
		errors: [restyle(cls, other, 'header')]
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

// A component spreading its props into the call passes on the ones an element
// passes, its preset included; one the call passes itself stays.
RESTYLE_INVALID.push(
	...[
		'function Button({ className, ...rest }) { return <button className={button({ ...rest, class: className })} />; }',
		'function Button(props) { return <button className={button({ ...props, class: props.className })} />; }'
	].map((component) => ({
		code: `${IMPORT}${RESTYLE_PRESET_BUTTON}${component}
<Button size="lg" className="text-lg" />;
<Button size="lg" className="mt-2" />;
<Button className="text-xl" />;
<Button preset="big" className="mt-3" />;`,
		errors: [
			restyle('mt-2', 'mt-8'),
			restyle('text-xl', 'text-sm'),
			restyle('mt-3', 'mt-8')
		]
	})),
	{
		code: `${IMPORT}${RESTYLE_PRESET_BUTTON}function Button({ className, ...rest }) { return <button className={button({ ...rest, size: 'sm', preset: 'big', class: className })} />; }
<Button size="lg" preset="odd" className="text-lg" />;`,
		errors: [restyle('text-lg', 'text-sm')]
	},
	// A spread of anything else, a computed key, or a variant or preset read
	// from no prop may set any variant the call doesn't pass itself.
	...[
		'button({ ...other, class: className })',
		'button({ ...pick(), class: className })',
		'button({ [key]: value, class: className })',
		"button({ size: big ? 'lg' : 'sm', class: className })",
		'button({ preset: pick(), class: className })'
	].map((call) => ({
		code: `${IMPORT}${RESTYLE_PRESET_BUTTON}function Button({ className, big }) { return <button className={${call}} />; }
<Button big className="mt-2" />;`,
		errors: [restyle('mt-2', 'mt-8')]
	})),
	// A preset read from a prop takes the one the element passes: a known one
	// sets its values, and one that can't be read, an unknown one or one not
	// known in full may set any value. A default on the prop isn't followed.
	{
		code: `${IMPORT}${RESTYLE_PRESET_BUTTON}function Button({ preset, className }) { return <button className={button({ preset, class: className })} />; }
function Fallback({ preset = 'big', className }) { return <button className={button({ preset, class: className })} />; }
<Button preset="big" className="text-lg" />;
<Button preset="big" className="mt-2" />;
<Button className="text-xl" />;
<Button preset={name} className="mt-3" />;
<Button preset="nope" className="mt-4" />;
<Button preset="odd" className="mt-5" />;
<Button preset="odd" className="text-2xl" />;
<Fallback className="mt-6" />;`,
		errors: [
			restyle('mt-2', 'mt-8'),
			restyle('text-xl', 'text-sm'),
			restyle('mt-3', 'mt-8'),
			restyle('mt-4', 'mt-8'),
			restyle('mt-5', 'mt-8'),
			restyle('mt-6', 'mt-8')
		]
	},
	// An element spread passes the props of an object literal, and may pass
	// any prop otherwise, over the props written before it.
	{
		code: `${IMPORT}${RESTYLE_PRESET_BUTTON}function Button({ size, className }) { return <button className={button({ size, class: className })} />; }
<Button {...{ size: 'lg' }} className="text-lg" />;
<Button {...{ size: 'lg' }} className="mt-2" />;
<Button {...o} className="mt-3" />;
<Button {...o} size="sm" className="mt-4" />;
<Button size="sm" {...o} className="mt-5" />;`,
		errors: [
			restyle('mt-2', 'mt-8'),
			restyle('mt-3', 'mt-8'),
			restyle('mt-5', 'mt-8')
		]
	},
	{
		// The same for a component spreading its props into the call.
		code: `${IMPORT}${RESTYLE_PRESET_BUTTON}function Button({ className, ...rest }) { return <button className={button({ ...rest, class: className })} />; }
<Button {...o} className="mt-2" />;`,
		errors: [restyle('mt-2', 'mt-8')]
	}
);

// A class list held by a `const` is read in full where it's used: the prop
// forwarded into it, and a slot-variants part inside it, its literals still
// checked as one part. A `let` isn't followed, so its own list forwards.
RESTYLE_INVALID.push(
	...[
		"const merged = cn('flex', className); return <button className={button({ class: merged })} />;",
		"const extra = cn('flex', className); return <button className={cn(button(), extra)} />;",
		'const merged = cn(button(), className); return <button className={merged} />;',
		"const merged = cn(on ? className : 'x', 'flex'); return <button className={button({ class: merged })} />;"
	].map((body) => ({
		code: `${IMPORT_SV_CN}${RESTYLE_BUTTON}function Button({ className, on }) { ${body} }
<Button on className="p-4" />;`,
		errors: [restyle('p-4', 'p-2')]
	})),
	{
		code: `${IMPORT_SV_CN}${RESTYLE_BUTTON}function Button({ className }) { let merged = cn('flex', className); return <button className={button({ class: merged })} />; }
<Button className="flex" />;`,
		errors: [dup('flex')]
	}
);

// Every position a component forwards its class into is checked, as any of
// them may render; one forwarding `class` and `className` keeps the first.
RESTYLE_INVALID.push(
	...[
		'<span className={wrap({ class: className })}><button className={button({ class: className })} /></span>',
		'href ? <a className={wrap({ class: className })} /> : <button className={button({ class: className })} />'
	].map((markup) => ({
		code: `${IMPORT}${RESTYLE_BUTTON}const wrap = sv({ base: 'm-1', variants: {} });
function Button({ className, href }) { return ${markup}; }
<Button className="p-4 m-2" />;`,
		errors: [restyle('p-4', 'p-2'), restyle('m-2', 'm-1')]
	})),
	{
		code: `${IMPORT}${RESTYLE_BUTTON}const wrap = sv({ base: 'm-1', variants: {} });
function Button(props) { return <span className={button({ class: props.class })}><b className={wrap({ class: props.className })} /></span>; }
<Button class="p-4" />;
<Button className="m-2" />;`,
		errors: [restyle('p-4', 'p-2')]
	}
);

// A config spreading one object twice takes its keys where it's spread last,
// as at runtime, through another spread too.
RESTYLE_INVALID.push(
	...[
		"const shared = { base: 'p-2' };\nconst b = sv({ ...shared, base: 'm-2', ...shared, variants: {} });",
		"const root = { base: 'p-2' };\nconst a = { ...root };\nconst c = { ...root };\nconst b = sv({ ...a, base: 'm-2', ...c, variants: {} });"
	].map((config) => ({
		code: `${IMPORT}${config}\nb({ class: 'm-4' });\nb({ class: 'p-4' });`,
		errors: [restyle('p-4', 'p-2')]
	}))
);

// A component extending others applies their classes too: their base, their
// variant values, and the slots its own values name. Presets and defaults are
// merged as `extend` merges them, and a parent that can't be read leaves the
// presets open.
const RESTYLE_EXTENDED = `const parent = sv({
	base: 'flex',
	slots: { icon: 'w-4' },
	groups: { all: ['base', 'icon'] },
	variants: { size: { sm: 'p-2', lg: 'm-2' } },
	presets: { big: { size: 'lg' }, wide: { size: 'lg' } }
});
const other = sv({ base: 'block', variants: {}, presets: { wide: { size: 'sm' } } });
const child = sv({
	extend: [parent, other, parent],
	slots: { label: 'font-bold' },
	groups: { all: ['label'] },
	variants: { size: { sm: { base: 'text-sm', icon: 'h-4' }, lg: 'gap-2' } },
	defaultVariants: { size: 'sm' }
});\n`;

// A variant no layer of a component read in full gives a default stays
// unset; any layer's default, or one that can't be read, may set it.
RESTYLE_VALID.push(
	`${IMPORT}const parent = sv({ base: 'flex', variants: {} });
const child = sv({ extend: parent, variants: { size: { sm: 'p-2', lg: 'm-2' } } });
const grand = sv({ extend: child, variants: {}, defaultVariants: { size: undefined } });
child({ class: 'p-4' });
grand({ class: 'p-4' });`
);

RESTYLE_INVALID.push(
	{
		code: `${IMPORT}const parent = sv({ variants: { size: { sm: 'p-2', lg: 'm-2' } }, defaultVariants: { size: 'sm' } });
const loose = sv({ variants: { size: { sm: 'p-2', lg: 'm-2' } } });
const dynamic = sv({ variants: {}, defaultVariants: pick() });
const open = sv({ extend: unknown, variants: {} });
const a = sv({ extend: parent, variants: { size: { xl: 'gap-2' } } });
const b = sv({ extend: loose, variants: {}, defaultVariants: { size: 'sm' } });
const c = sv({ extend: dynamic, variants: { size: { sm: 'p-2' } } });
const d = sv({ extend: open, variants: { size: { sm: 'p-2' } } });
a({ class: 'p-4' });
b({ class: 'p-4' });
c({ class: 'p-4' });
d({ class: 'p-4' });`,
		errors: [
			restyle('p-4', 'p-2'),
			restyle('p-4', 'p-2'),
			restyle('p-4', 'p-2'),
			restyle('p-4', 'p-2')
		]
	},
	{
		code: `${IMPORT}${RESTYLE_EXTENDED}child({ class: 'p-4' });
child({ preset: 'big', class: 'text-lg' });
child({ preset: 'big', class: 'gap-4 m-4' });
child({ preset: 'wide', class: 'p-6' });
child({ class: { icon: 'w-6 h-6', all: 'font-normal' } });`,
		errors: [
			restyle('p-4', 'p-2'),
			restyle('gap-4', 'gap-2'),
			restyle('m-4', 'm-2'),
			restyle('p-6', 'p-2'),
			restyle('w-6', 'w-4', 'icon'),
			restyle('h-6', 'h-4', 'icon'),
			restyle('font-normal', 'font-bold', 'label')
		]
	},
	{
		code: `${IMPORT}import { imported } from './imported';
const child = sv({ extend: [imported, ...more], variants: { size: { sm: 'p-2', lg: 'm-2' }, tone: { a: 'mt-1', b: 'mb-1' } }, presets: { big: { size: 'sm' } }, defaultVariants: { size: 'sm', tone: 'a' } });
const looped = sv({ extend: looped, base: 'p-2', variants: {} });
child({ preset: 'any', class: 'm-4' });
child({ preset: 'big', class: 'mb-3' });
looped({ class: 'p-4' });`,
		errors: [
			restyle('m-4', 'm-2'),
			restyle('mb-3', 'mb-1'),
			restyle('p-4', 'p-2')
		]
	}
);

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
	{
		// Vue merges the class a \`v-bind\` object passes with the element's.
		code: `<script setup>import { sv } from 'slot-variants';\nconst card = sv({ base: 'p-2', variants: {} });\nconst c = card();</script>\n<template><div v-bind="{ class: c }" class="p-4">a</div><div v-bind="{ class: 'p-6' }" :class="c">b</div></template>`,
		filename: 'a.vue',
		errors: [restyle('p-4', 'p-2'), restyle('p-6', 'p-2')]
	},
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