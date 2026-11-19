import t from 'tap';
import { createSV, sv, type VariantProps } from '../../src/index.ts';

// sv() - extend

t.test('appends base classes after the parent ones', (t) => {
	const parent = sv('btn', { base: 'font-medium' });
	const child = sv({ extend: parent, base: 'inline-flex' });

	t.equal(child(), 'btn font-medium inline-flex', 'parent base first');

	t.end();
});

t.test('child base args follow the parent base classes', (t) => {
	const parent = sv('btn', {});
	const child = sv('gap-2', ['px-4'], { extend: parent, base: 'flex' });

	t.equal(child(), 'btn gap-2 px-4 flex', 'base args then base field');

	t.end();
});

t.test('child base classes follow the parent base slot', (t) => {
	const parent = sv({ base: 'p-base', slots: { base: 'p-slot', icon: 'i' } });

	t.equal(
		sv({ extend: parent, base: 'c-base' })().base,
		'p-base p-slot c-base',
		'child base field after the parent base slot'
	);
	t.equal(
		sv('c-arg', { extend: parent })().base,
		'p-base p-slot c-arg',
		'child base args after the parent base slot'
	);
	t.equal(
		sv({ extend: parent, base: 'c-base', slots: { base: 'c-slot' } })()
			.base,
		'p-base p-slot c-base c-slot',
		'child base field then child base slot'
	);

	t.end();
});

t.test('keeps the parent base when the child has none', (t) => {
	const parent = sv('btn', {});
	const child = sv({ extend: parent });

	t.equal(child(), 'btn', 'inherited base only');

	t.end();
});

t.test('merges variants and their values', (t) => {
	const parent = sv('btn', {
		variants: {
			size: { sm: 'text-sm', lg: 'text-lg' },
			intent: { primary: 'bg-blue-500' }
		},
		defaultVariants: { size: 'sm' }
	});
	const child = sv({
		extend: parent,
		variants: {
			size: { sm: 'p-1', xl: ['text-xl', 'p-4'] },
			round: { true: 'rounded-full' }
		}
	});

	t.equal(
		child(),
		'btn text-sm p-1',
		'value in both is joined, parent first'
	);
	t.equal(child({ size: 'lg' }), 'btn text-lg', 'parent-only value kept');
	t.equal(child({ size: 'xl' }), 'btn text-xl p-4', 'child-only value kept');
	t.equal(
		child({ intent: 'primary', round: true }),
		'btn text-sm p-1 bg-blue-500 rounded-full',
		'variants from both sides'
	);

	t.end();
});

t.test('merges a boolean shorthand with a value record', (t) => {
	const parent = sv('btn', {
		variants: { disabled: 'opacity-50', loading: { true: 'cursor-wait' } }
	});
	const child = sv({
		extend: parent,
		variants: {
			disabled: { true: 'cursor-not-allowed', false: 'cursor-pointer' },
			loading: 'animate-pulse'
		}
	});

	t.equal(
		child({ disabled: true, loading: true }),
		'btn opacity-50 cursor-not-allowed cursor-wait animate-pulse',
		'shorthand stands for its true value'
	);
	t.equal(child({ disabled: false }), 'btn cursor-pointer', 'false value');

	t.end();
});

t.test('merges slots and per-slot variant values', (t) => {
	const parent = sv('border', {
		slots: { header: 'font-bold', body: 'py-4' },
		variants: {
			size: {
				sm: { header: 'text-sm' },
				lg: 'p-6'
			}
		}
	});
	const child = sv('shadow', {
		extend: parent,
		slots: { body: 'px-4', footer: 'pt-2' },
		variants: {
			size: {
				sm: 'p-2',
				lg: { header: 'text-lg', footer: 'text-lg' }
			}
		}
	});

	t.same(
		child({ size: 'sm' }),
		{
			base: 'border shadow p-2',
			header: 'font-bold text-sm',
			body: 'py-4 px-4',
			footer: 'pt-2'
		},
		'class value merges into base, per-slot object kept'
	);
	t.same(
		child({ size: 'lg' }),
		{
			base: 'border shadow p-6',
			header: 'font-bold text-lg',
			body: 'py-4 px-4',
			footer: 'pt-2 text-lg'
		},
		'per-slot objects from both sides'
	);

	t.end();
});

t.test('merges per-slot values that both set a slot', (t) => {
	const parent = sv('border', {
		slots: { header: 'font-bold' },
		variants: { size: { sm: { header: 'text-sm' } } }
	});
	const child = sv({
		extend: parent,
		variants: { size: { sm: { header: 'leading-tight' } } }
	});

	t.equal(
		child({ size: 'sm' }).header,
		'font-bold text-sm leading-tight',
		'slot classes joined, parent first'
	);

	t.end();
});

t.test('an undefined value on either side adds nothing', (t) => {
	const parent = sv('border', {
		slots: { header: 'font-bold', body: undefined },
		variants: { size: { sm: undefined, lg: 'text-lg' } }
	});
	const child = sv({
		extend: parent,
		slots: { header: undefined, body: 'py-4' },
		variants: { size: { sm: 'text-sm', lg: undefined } }
	});

	t.same(
		child({ size: 'sm' }),
		{ base: 'border text-sm', header: 'font-bold', body: 'py-4' },
		'undefined parent value takes the child one'
	);
	t.equal(child({ size: 'lg' }).base, 'border text-lg', 'undefined child');

	t.end();
});

t.test('merges variants named like Object.prototype members', (t) => {
	const parent = sv('btn', { variants: { toString: { a: 'text-a' } } });
	const child = sv({
		extend: parent,
		variants: { toString: { b: 'text-b' }, valueOf: { c: 'text-c' } }
	});

	// Every prototype-named variant is passed, as TypeScript checks a literal's
	// inherited members against the declared ones
	t.equal(
		child({ toString: 'a', valueOf: 'c' }),
		'btn text-a text-c',
		'inherited value'
	);
	t.equal(child({ toString: 'b', valueOf: 'c' }), 'btn text-b text-c', 'own');

	t.end();
});

t.test('child defaults win over parent defaults', (t) => {
	const parent = sv('btn', {
		variants: {
			size: { sm: 'text-sm', lg: 'text-lg' },
			intent: { primary: 'bg-blue-500', danger: 'bg-red-500' }
		},
		defaultVariants: { size: 'sm', intent: 'primary' }
	});
	const child = sv({ extend: parent, defaultVariants: { size: 'lg' } });

	t.equal(child(), 'btn text-lg bg-blue-500', 'merged defaults');

	t.end();
});

t.test('concatenates compound variants and slots, parent first', (t) => {
	const parent = sv('border', {
		slots: { header: 'font-bold' },
		variants: { size: { sm: 'p-2', lg: 'p-6' } },
		compoundVariants: [{ size: 'lg', class: 'uppercase' }],
		compoundSlots: [{ slots: ['header'], class: 'px-2' }]
	});
	const child = sv({
		extend: parent,
		compoundVariants: [{ size: 'lg', class: 'tracking-wide' }],
		compoundSlots: [{ size: 'lg', slots: ['header'], class: 'px-6' }]
	});

	t.same(
		child({ size: 'lg' }),
		{
			base: 'border p-6 uppercase tracking-wide',
			header: 'font-bold px-2 px-6'
		},
		'compounds from both sides'
	);

	t.end();
});

t.test('keeps compound entries when only one side has them', (t) => {
	const parent = sv('btn', {
		variants: { size: { lg: 'text-lg' } },
		compoundVariants: [{ size: 'lg', class: 'uppercase' }]
	});
	const child = sv({ extend: parent });
	const plain = sv('btn', { variants: { size: { lg: 'text-lg' } } });
	const grandchild = sv({
		extend: plain,
		compoundVariants: [{ size: 'lg', class: 'italic' }]
	});

	t.equal(child({ size: 'lg' }), 'btn text-lg uppercase', 'parent only');
	t.equal(grandchild({ size: 'lg' }), 'btn text-lg italic', 'child only');

	t.end();
});

t.test('unions groups, joining a group in both', (t) => {
	const parent = sv('border', {
		slots: { header: 'font-bold', body: 'py-4', footer: 'pt-2' },
		groups: { content: ['header', 'body'], edges: ['header'] }
	});
	const child = sv({
		extend: parent,
		groups: { content: ['body', 'footer'], all: ['base', 'footer'] }
	});

	t.same(
		child({ class: { content: 'px-4', edges: 'mt-1', all: 'm-0' } }),
		{
			base: 'border m-0',
			header: 'font-bold px-4 mt-1',
			body: 'py-4 px-4',
			footer: 'pt-2 px-4 m-0'
		},
		'merged groups'
	);

	t.end();
});

t.test('unions presets, merging a preset in both', (t) => {
	const parent = sv('btn', {
		variants: {
			size: { sm: 'text-sm', lg: 'text-lg' },
			intent: { primary: 'bg-blue-500', danger: 'bg-red-500' }
		},
		presets: {
			cta: { size: 'lg', intent: 'primary' },
			subtle: { size: 'sm' }
		}
	});
	const child = sv({
		extend: parent,
		presets: { cta: { intent: 'danger' }, alert: { intent: 'danger' } }
	});

	t.equal(child({ preset: 'cta' }), 'btn text-lg bg-red-500', 'merged');
	t.equal(child({ preset: 'subtle' }), 'btn text-sm', 'parent only');
	t.equal(child({ preset: 'alert' }), 'btn bg-red-500', 'child only');

	t.end();
});

t.test('unions required variants', (t) => {
	const parent = sv('btn', {
		variants: {
			size: { sm: 'text-sm' },
			intent: { primary: 'bg-blue-500' }
		},
		requiredVariants: ['intent']
	});
	const child = sv({
		extend: parent,
		variants: { tone: { soft: 'opacity-80' } },
		requiredVariants: ['tone']
	});

	t.throws(
		// @ts-expect-error - inherited required variant missing
		() => child({ tone: 'soft' }),
		{ message: 'Missing required variant: "intent"' },
		'inherited requirement'
	);
	t.throws(
		// @ts-expect-error - own required variant missing
		() => child({ intent: 'primary' }),
		{ message: 'Missing required variant: "tone"' },
		'own requirement'
	);
	t.equal(
		child({ intent: 'primary', tone: 'soft' }),
		'btn bg-blue-500 opacity-80',
		'both passed'
	);

	t.end();
});

t.test('resolves requiredVariants: true on each side', (t) => {
	const parent = sv('btn', {
		variants: { size: { sm: 'text-sm' } },
		requiredVariants: true
	});
	const child = sv({
		extend: parent,
		variants: { tone: { soft: 'opacity-80' } }
	});
	const strict = sv({
		extend: parent,
		variants: { tone: { soft: 'opacity-80' } },
		requiredVariants: true
	});

	t.equal(child({ size: 'sm' }), 'btn text-sm', 'parent true covers its own');
	t.throws(
		// @ts-expect-error - tone is required by the child's true
		() => strict({ size: 'sm' }),
		{ message: 'Missing required variant: "tone"' },
		'child true covers every variant'
	);

	t.end();
});

t.test('requiredVariants: true with no variants requires nothing', (t) => {
	const parent = sv('btn', {});
	const child = sv({ extend: parent, requiredVariants: true });

	t.equal(child(), 'btn', 'nothing to require');

	t.end();
});

t.test('a child default lifts an inherited requirement', (t) => {
	const parent = sv('btn', {
		variants: { intent: { primary: 'bg-blue-500', danger: 'bg-red-500' } },
		requiredVariants: ['intent']
	});
	const child = sv({
		extend: parent,
		defaultVariants: { intent: 'danger' },
		requiredVariants: false
	});

	t.equal(child(), 'btn bg-red-500', 'default used, no longer required');

	t.end();
});

t.test('a child requirement drops an inherited default', (t) => {
	const parent = sv('btn', {
		variants: { size: { sm: 'text-sm', lg: 'text-lg' } },
		defaultVariants: { size: 'sm' }
	});
	const child = sv({ extend: parent, requiredVariants: ['size'] });

	t.throws(
		// @ts-expect-error - size is required by the child
		() => child(),
		{ message: 'Missing required variant: "size"' },
		'no longer defaulted'
	);
	t.equal(child({ size: 'lg' }), 'btn text-lg', 'passed value used');

	t.end();
});

t.test('a later parent requirement drops an earlier default', (t) => {
	const defaulted = sv('btn', {
		variants: { size: { sm: 'text-sm', lg: 'text-lg' } },
		defaultVariants: { size: 'sm' }
	});
	const required = sv({
		variants: { size: { sm: 'p-1', lg: 'p-4' } },
		requiredVariants: ['size']
	});
	const child = sv({ extend: [defaulted, required] });

	t.throws(
		// @ts-expect-error - size is required by the later parent
		() => child(),
		{ message: 'Missing required variant: "size"' },
		'the later requirement wins'
	);
	t.equal(child({ size: 'lg' }), 'btn text-lg p-4', 'passed value used');

	t.end();
});

t.test('createSV requiredVariants: true drops inherited defaults', (t) => {
	const strict = createSV({ requiredVariants: true });
	const parent = sv('btn', {
		variants: { size: { sm: 'text-sm', lg: 'text-lg' } },
		defaultVariants: { size: 'sm' }
	});
	const child = strict({ extend: parent });

	t.throws(
		// @ts-expect-error - every variant is required by the factory default
		() => child(),
		{ message: 'Missing required variant: "size"' },
		'factory requirement wins over the parent default'
	);
	t.equal(child({ size: 'lg' }), 'btn text-lg', 'passed value used');

	t.end();
});

t.test('unions multi slots, resolving true on each side', (t) => {
	const parent = sv('border', {
		slots: { header: 'font-bold', body: 'py-4' },
		multiSlots: ['header'],
		variants: { size: { sm: { header: 'text-sm', body: 'text-sm' } } }
	});
	const child = sv({ extend: parent, slots: { footer: 'pt-2' } });
	const all = sv({
		extend: parent,
		slots: { footer: 'pt-2' },
		multiSlots: true
	});
	const fromTrue = sv('border', {
		slots: { header: 'font-bold' },
		multiSlots: true
	});
	const extended = sv({ extend: fromTrue, slots: { footer: 'pt-2' } });

	const result = child();

	t.equal(typeof result.header, 'function', 'inherited multi slot');
	t.equal(result.header({ size: 'sm' }), 'font-bold text-sm', 'slot fn');
	t.equal(result.footer, 'pt-2', 'other slots stay strings');
	t.equal(typeof all().footer, 'function', 'child true covers all slots');
	t.equal(typeof extended().header, 'function', 'parent true resolved');
	t.equal(extended().footer, 'pt-2', 'parent true only covers its slots');

	t.end();
});

t.test('a parent group in multi slots covers only its own slots', (t) => {
	const parent = sv({
		slots: { a: 'a', b: 'b' },
		groups: { g: ['a'] },
		multiSlots: ['g']
	});
	const child = sv({
		extend: parent,
		slots: { c: 'c' },
		groups: { g: ['c'] }
	});
	const own = sv({ extend: parent, slots: { c: 'c' }, multiSlots: ['g'] });
	const result = child();

	t.equal(typeof result.a, 'function', 'the group slot it had');
	t.equal(result.c, 'c', 'a slot the child adds to the group');
	t.equal(typeof own().a, 'function', 'a child naming the group');

	t.end();
});

t.test('inherits behaviour options unless the child sets them', (t) => {
	const upper = (className: string) => className.toUpperCase();
	const lower = (className: string) => className.toLowerCase();
	const parent = sv('Btn', {
		variants: { size: { sm: 'Text-Sm' } },
		cacheSize: 1,
		introspection: true,
		postProcess: upper
	});
	const child = sv({ extend: parent });
	const own = sv({
		extend: parent,
		cacheSize: 4,
		introspection: false,
		postProcess: lower
	});

	t.equal(child({ size: 'sm' }), 'BTN TEXT-SM', 'postProcess inherited');
	t.same(child.variantKeys, ['size'], 'introspection inherited');
	child();
	t.equal(child.getCacheSize(), 1, 'cacheSize inherited');
	t.equal(own({ size: 'sm' }), 'btn text-sm', 'own postProcess');
	t.notOk('variantKeys' in own, 'own introspection');

	t.end();
});

t.test('extends several parents left to right', (t) => {
	const sized = sv('btn', {
		variants: { size: { sm: 'text-sm', lg: 'text-lg' } },
		defaultVariants: { size: 'sm' },
		introspection: true
	});
	const toned = sv('inline-flex', {
		variants: {
			size: { sm: 'p-1', lg: 'px-4' },
			tone: { soft: 'opacity-80' }
		},
		defaultVariants: { size: 'lg' }
	});
	const child = sv({ extend: [sized, toned], base: 'gap-2' });

	t.equal(child(), 'btn inline-flex gap-2 text-lg px-4', 'later parent wins');
	t.equal(
		child({ size: 'sm', tone: 'soft' }),
		'btn inline-flex gap-2 text-sm p-1 opacity-80',
		'values joined in parent order'
	);
	t.notOk('variantKeys' in child, 'last parent decides introspection');

	t.end();
});

t.test('merges a shared ancestor once', (t) => {
	const root = sv('a', {
		variants: { s: { x: 'ax' } },
		compoundVariants: [{ s: 'x', class: 'cmp' }]
	});
	const left = sv({ extend: root, base: 'b' });
	const right = sv({ extend: root, base: 'c' });

	t.equal(
		sv({ extend: [left, right] })({ s: 'x' }),
		'a b c ax cmp',
		'diamond'
	);
	t.equal(
		sv({ extend: [root, left] })({ s: 'x' }),
		'a b ax cmp',
		'a parent that also extends an earlier one'
	);
	t.equal(
		sv({ extend: [root, root] })({ s: 'x' }),
		'a ax cmp',
		'the same parent twice'
	);

	t.end();
});

t.test('types merge a shared ancestor once', (t) => {
	const required = sv({
		variants: { size: { sm: 's' } },
		requiredVariants: ['size']
	});
	const lifted = sv({ extend: required, defaultVariants: { size: 'sm' } });
	const plain = sv({ extend: required, base: 'p' });

	t.equal(
		sv({ extend: [lifted, plain] })(),
		'p s',
		'a default one parent gives stays'
	);

	const defaulted = sv({
		variants: { size: { sm: 's' } },
		defaultVariants: { size: 'sm' }
	});
	const requiring = sv({ extend: defaulted, requiredVariants: ['size'] });
	const other = sv({ extend: defaulted, base: 'o' });
	const diamond = sv({ extend: [requiring, other] });
	const repeated = sv({ extend: [requiring, defaulted] });

	t.throws(
		// @ts-expect-error - the first parent's requirement stays
		() => diamond(),
		{ message: 'Missing required variant: "size"' },
		'a requirement one parent adds stays'
	);
	t.throws(
		// @ts-expect-error - the repeated parent adds nothing
		() => repeated(),
		{ message: 'Missing required variant: "size"' },
		'a parent repeated after its child adds nothing'
	);

	const shown = sv({ variants: { size: { sm: 's' } }, introspection: true });
	const hidden = sv({ extend: shown, introspection: false });
	const merged = sv({ extend: [hidden, shown] });

	// @ts-expect-error - introspection stays off
	void merged.getVariantValues;
	t.notOk('getVariantValues' in merged, 'introspection stays off');

	t.end();
});

t.test('a parent requiring every variant keeps to its own', (t) => {
	const toned = sv({ variants: { tone: { soft: 'opacity-80' } } });
	const sized = sv({
		variants: { size: { sm: 'text-sm' } },
		slots: { icon: 'size-4' },
		requiredVariants: true,
		multiSlots: true
	});
	const child = sv({ extend: [toned, sized] });
	const { base, icon } = child({ size: 'sm' });

	t.equal(base(), 'text-sm', 'tone stays optional');
	t.equal(icon(), 'size-4', 'slots of the parent are multi slots');

	t.end();
});

t.test('an empty extend list is the same as none', (t) => {
	const button = sv('btn', {
		extend: [],
		variants: { size: { sm: 'text-sm' } }
	});

	t.equal(button({ size: 'sm' }), 'btn text-sm', 'plain component');

	t.end();
});

t.test('grandchildren inherit the merged config', (t) => {
	const root = sv('btn', { variants: { size: { sm: 'text-sm' } } });
	const middle = sv('inline-flex', {
		extend: root,
		variants: { size: { sm: 'p-1' } }
	});
	const leaf = sv({ extend: middle, variants: { size: { sm: 'gap-1' } } });

	t.equal(leaf({ size: 'sm' }), 'btn inline-flex text-sm p-1 gap-1', 'chain');

	t.end();
});

t.test('introspection reports the merged config', (t) => {
	const parent = sv('btn', {
		variants: { size: { sm: 'text-sm' } },
		compoundVariants: [{ size: 'sm', class: 'italic' }]
	});
	const child = sv({
		extend: parent,
		base: 'flex',
		variants: { tone: { soft: 'opacity-80' } },
		introspection: true
	});

	t.equal(child.base, 'btn flex', 'merged base');
	t.same(child.variantKeys, ['size', 'tone'], 'merged variant keys');
	t.same(
		child.compoundVariants,
		[{ size: 'sm', class: 'italic' }],
		'inherited compounds'
	);

	t.end();
});

t.test('explain shows inherited classes', (t) => {
	const parent = sv('btn', { variants: { size: { sm: 'text-sm' } } });
	const child = sv({
		extend: parent,
		variants: { size: { sm: 'p-1' } },
		introspection: true
	});

	t.same(
		child.explain({ size: 'sm' }).slots.base.variants,
		{ size: 'text-sm p-1' },
		'merged variant value'
	);

	t.end();
});

t.test('throws when extend names something other than a component', (t) => {
	const notComponent = () => 'btn';

	t.throws(
		// @ts-expect-error - not an sv() component
		() => sv({ extend: notComponent }),
		{ message: 'extend must be an sv() component' },
		'plain function'
	);
	t.throws(
		// @ts-expect-error - not an sv() component
		() => sv({ extend: [notComponent] }),
		{ message: 'extend must be an sv() component' },
		'in a list'
	);

	t.end();
});

t.test('validates the merged config', (t) => {
	const parent = sv('btn', {
		variants: { size: { sm: 'text-sm' } },
		requiredVariants: ['size']
	});

	t.throws(
		() =>
			sv({
				extend: parent,
				// @ts-expect-error - own required variant with a default
				defaultVariants: { size: 'sm' },
				requiredVariants: ['size']
			}),
		{ message: /size/ },
		'own requirement with a default'
	);

	t.end();
});

t.test('createSV defaults sit below the parents', (t) => {
	const upper = (className: string) => className.toUpperCase();
	const lower = (className: string) => className.toLowerCase();
	const factory = createSV({ base: 'Factory', postProcess: lower });
	const parent = sv('Btn', { postProcess: upper });
	const bare = sv({});

	t.equal(factory({ extend: parent })(), 'BTN', 'parent postProcess kept');
	t.equal(
		factory({ extend: bare })(),
		'factory',
		'factory fills what nobody sets'
	);

	t.end();
});

t.test('createSV list defaults apply to the child side', (t) => {
	const strict = createSV({ requiredVariants: true, multiSlots: true });
	const parent = sv('btn', {
		slots: { icon: 'size-4' },
		variants: { size: { sm: 'text-sm' } }
	});
	const child = strict({
		extend: parent,
		variants: { tone: { soft: 'opacity-80' } }
	});

	t.throws(
		// @ts-expect-error - every variant is required by the factory default
		() => child({ tone: 'soft' }),
		{ message: 'Missing required variant: "size"' },
		'factory true covers the merged variants'
	);
	t.equal(
		typeof child({ size: 'sm', tone: 'soft' }).icon,
		'function',
		'factory multiSlots covers the merged slots'
	);

	t.end();
});

t.test('a component built with createSV can be extended', (t) => {
	const factory = createSV({ postProcess: (value) => `${value}!` });
	const parent = factory('btn', {});
	const child = sv({ extend: parent, base: 'flex' });

	t.equal(child(), 'btn flex!', 'factory postProcess inherited');

	t.end();
});

// --- extend type tests ---

const _tParent = sv('btn', {
	slots: { icon: 'size-4' },
	groups: { parts: ['base', 'icon'] },
	variants: {
		size: { sm: 'text-sm', lg: 'text-lg' },
		intent: { primary: 'bg-blue-500', danger: 'bg-red-500' }
	},
	presets: { cta: { size: 'lg' } },
	requiredVariants: ['intent'],
	multiSlots: ['icon']
});

const _tChild = sv({
	extend: _tParent,
	slots: { label: 'truncate' },
	variants: {
		size: { xl: { icon: 'size-6', label: 'text-xl' } },
		round: { true: 'rounded-full' }
	},
	compoundVariants: [{ size: 'lg', intent: 'danger', class: { icon: 'x' } }],
	compoundSlots: [{ preset: 'cta', slots: ['parts', 'label'], class: 'y' }],
	defaultVariants: { size: 'xl' }
});

type TChildProps = VariantProps<typeof _tChild>;

type AssertTSize =
	Exclude<TChildProps['size'], null | undefined> extends 'sm' | 'lg' | 'xl'
		? 'xl' extends TChildProps['size']
			? true
			: false
		: false;
const _assertTSize: AssertTSize = true;

type AssertTRound = TChildProps['round'] extends boolean | null | undefined
	? true
	: false;
const _assertTRound: AssertTRound = true;

// Without presets, an inherited required variant stays required
const _tReq = sv('btn', {
	variants: { intent: { primary: 'bg-blue-500', danger: 'bg-red-500' } },
	requiredVariants: ['intent']
});
const _tReqChild = sv({
	extend: _tReq,
	variants: { size: { sm: 'text-sm' } },
	defaultVariants: { size: 'sm' }
});

type AssertTIntentRequired = undefined extends VariantProps<
	typeof _tReqChild
>['intent']
	? false
	: true;
const _assertTIntentRequired: AssertTIntentRequired = true;

type TChildResult = ReturnType<typeof _tChild>;

type AssertTSlots = keyof TChildResult extends 'base' | 'icon' | 'label'
	? 'label' extends keyof TChildResult
		? true
		: false
	: false;
const _assertTSlots: AssertTSlots = true;

type AssertTMultiSlot = TChildResult['icon'] extends string ? false : true;
const _assertTMultiSlot: AssertTMultiSlot = true;

// An inherited required variant with a child default is no longer required
const _tLifted = sv({
	extend: _tReq,
	defaultVariants: { intent: 'danger' }
});

type AssertTLifted = undefined extends VariantProps<typeof _tLifted>['intent']
	? true
	: false;
const _assertTLifted: AssertTLifted = true;

// Several parents merge their variants
const _tOther = sv({ variants: { tone: { soft: 'opacity-80' } } });
const _tMulti = sv({ extend: [_tParent, _tOther] });

type AssertTMulti = 'tone' extends keyof VariantProps<typeof _tMulti>
	? true
	: false;
const _assertTMulti: AssertTMulti = true;

// Introspection is inherited from the last parent
const _tIntro = sv({ variants: { size: { sm: 'a' } }, introspection: true });
const _tIntroChild = sv({ extend: _tIntro });

type AssertTIntro = 'variantKeys' extends keyof typeof _tIntroChild
	? true
	: false;
const _assertTIntro: AssertTIntro = true;

const _tErrors = () => {
	sv({
		extend: _tParent,
		// @ts-expect-error - unknown inherited variant value
		compoundVariants: [{ size: 'xx', class: 'x' }]
	});
	sv({
		extend: _tParent,
		// @ts-expect-error - unknown variant
		defaultVariants: { nope: 'x' }
	});
	sv({
		extend: _tParent,
		// @ts-expect-error - unknown slot
		variants: { size: { sm: { nope: 'x' } } }
	});
	// @ts-expect-error - intent is still required
	_tReqChild({ size: 'sm' });
};

void _tParent;
void _tChild;
void _assertTSize;
void _assertTRound;
void _tReq;
void _tReqChild;
void _assertTIntentRequired;
void _assertTSlots;
void _assertTMultiSlot;
void _tLifted;
void _assertTLifted;
void _tOther;
void _tMulti;
void _assertTMulti;
void _tIntro;
void _tIntroChild;
void _assertTIntro;
void _tErrors;