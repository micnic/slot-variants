import t from 'tap';
import { sv } from '../../src/index.ts';

// sv() - introspection: explain()

t.test('explains a component without slots', (t) => {
	const button = sv('btn', {
		variants: {
			size: { sm: 'text-sm', lg: 'text-lg' },
			intent: { primary: 'bg-blue-500', danger: 'bg-red-500' }
		},
		defaultVariants: { intent: 'primary' },
		introspection: true
	});

	t.same(
		button.explain({ size: 'lg' }),
		{
			variants: {
				size: { value: 'lg', from: 'prop' },
				intent: { value: 'primary', from: 'default' }
			},
			slots: {
				base: {
					base: 'btn',
					variants: { size: 'text-lg', intent: 'bg-blue-500' },
					compounds: [],
					class: '',
					raw: 'btn text-lg bg-blue-500',
					result: 'btn text-lg bg-blue-500',
					dropped: []
				}
			}
		},
		'full trace'
	);

	t.end();
});

t.test('explain works without props', (t) => {
	const box = sv('flex', { variants: {}, introspection: true });

	t.same(
		box.explain(),
		{
			variants: {},
			slots: {
				base: {
					base: 'flex',
					variants: {},
					compounds: [],
					class: '',
					raw: 'flex',
					result: 'flex',
					dropped: []
				}
			}
		},
		'trace with only base'
	);

	t.end();
});

t.test('explain reports where each variant value came from', (t) => {
	const button = sv('btn', {
		variants: {
			size: { sm: 'text-sm', lg: 'text-lg' },
			intent: { primary: 'bg-blue-500', danger: 'bg-red-500' },
			rounded: { true: 'rounded-full', false: 'rounded-md' },
			tone: { soft: 'opacity-80' },
			shadow: { none: '', md: 'shadow-md' },
			outline: { true: 'border' }
		},
		presets: {
			cta: { size: 'lg', intent: 'danger' }
		},
		defaultVariants: {
			rounded: false,
			shadow: 'md',
			outline: ({ intent }) => intent === 'danger'
		},
		introspection: true
	});

	const { variants } = button.explain({
		preset: 'cta',
		size: 'sm',
		shadow: null
	});

	t.same(
		variants,
		{
			size: { value: 'sm', from: 'prop' },
			intent: { value: 'danger', from: 'preset' },
			rounded: { value: false, from: 'default' },
			tone: { value: undefined, from: 'unset' },
			shadow: { value: undefined, from: 'unset' },
			outline: { value: true, from: 'default' }
		},
		'prop, preset, static and function defaults, unset and null'
	);

	t.end();
});

t.test('explain omits variants that add no classes to a slot', (t) => {
	const button = sv('btn', {
		variants: {
			size: { sm: '', lg: 'text-lg' }
		},
		introspection: true
	});

	t.same(
		button.explain({ size: 'sm' }).slots.base.variants,
		{},
		'empty variant value is left out'
	);

	t.end();
});

t.test('explain lists matched compound variants by index', (t) => {
	const button = sv('btn', {
		variants: {
			size: { sm: 'text-sm', lg: 'text-lg' },
			intent: { primary: 'bg-blue-500', danger: 'bg-red-500' }
		},
		compoundVariants: [
			{ size: 'sm', intent: 'danger', class: 'italic' },
			{ size: 'lg', class: 'uppercase' },
			{ intent: ['primary', 'danger'], className: 'font-bold' }
		],
		introspection: true
	});

	t.same(
		button.explain({ size: 'lg', intent: 'primary' }).slots.base.compounds,
		[
			{ kind: 'compoundVariants', index: 1, class: 'uppercase' },
			{ kind: 'compoundVariants', index: 2, class: 'font-bold' }
		],
		'only matched entries, in config order'
	);

	t.end();
});

t.test('explain breaks down every slot', (t) => {
	const card = sv('border', {
		slots: {
			header: 'font-bold',
			body: 'py-4'
		},
		groups: {
			content: ['header', 'body']
		},
		variants: {
			size: {
				sm: { base: 'p-2', header: 'text-sm' },
				lg: { base: 'p-6', content: 'text-lg' }
			}
		},
		compoundVariants: [{ size: 'lg', class: { body: 'leading-loose' } }],
		compoundSlots: [
			{ slots: ['header', 'body'], class: 'px-6' },
			{ size: 'sm', slots: ['body'], class: 'text-xs' },
			{ size: 'lg', slots: ['content'], class: 'tracking-wide' }
		],
		introspection: true
	});

	t.same(
		card.explain({ size: 'lg' }).slots,
		{
			base: {
				base: 'border',
				variants: { size: 'p-6' },
				compounds: [],
				class: '',
				raw: 'border p-6',
				result: 'border p-6',
				dropped: []
			},
			header: {
				base: 'font-bold',
				variants: { size: 'text-lg' },
				compounds: [
					{ kind: 'compoundSlots', index: 0, class: 'px-6' },
					{ kind: 'compoundSlots', index: 2, class: 'tracking-wide' }
				],
				class: '',
				raw: 'font-bold text-lg px-6 tracking-wide',
				result: 'font-bold text-lg px-6 tracking-wide',
				dropped: []
			},
			body: {
				base: 'py-4',
				variants: { size: 'text-lg' },
				compounds: [
					{
						kind: 'compoundVariants',
						index: 0,
						class: 'leading-loose'
					},
					{ kind: 'compoundSlots', index: 0, class: 'px-6' },
					{ kind: 'compoundSlots', index: 2, class: 'tracking-wide' }
				],
				class: '',
				raw: 'py-4 text-lg leading-loose px-6 tracking-wide',
				result: 'py-4 text-lg leading-loose px-6 tracking-wide',
				dropped: []
			}
		},
		'per-slot breakdown with groups expanded'
	);

	t.end();
});

t.test('explain shows a string class on the base slot', (t) => {
	const card = sv('border', {
		slots: { header: 'font-bold' },
		introspection: true
	});

	const { slots } = card.explain({ class: ['shadow', { hidden: false }] });

	t.equal(slots.base.class, 'shadow', 'base gets the class');
	t.equal(slots.base.raw, 'border shadow', 'raw includes the class');
	t.equal(slots.header.class, '', 'other slots get none');
	t.equal(slots.header.raw, 'font-bold', 'other slots unchanged');

	t.end();
});

t.test('explain shows a className on a component without slots', (t) => {
	const button = sv('btn', { variants: {}, introspection: true });

	const { slots } = button.explain({ className: 'mt-2' });

	t.equal(slots.base.class, 'mt-2', 'className is used');
	t.equal(slots.base.result, 'btn mt-2', 'result includes it');

	t.end();
});

t.test('explain splits a slot-object class across slots and groups', (t) => {
	const card = sv('border', {
		slots: {
			header: 'font-bold',
			body: 'py-4'
		},
		groups: {
			content: ['header', 'body']
		},
		introspection: true
	});

	const { slots } = card.explain({
		class: { base: 'shadow', content: 'px-2', body: 'min-h-24' }
	});

	t.equal(slots.base.class, 'shadow', 'base slot class');
	t.equal(slots.header.class, 'px-2', 'group class');
	t.equal(slots.body.class, 'px-2 min-h-24', 'group and slot class');
	t.equal(slots.body.result, 'py-4 px-2 min-h-24', 'merged result');

	t.end();
});

t.test('explain handles a slot-object class without slots', (t) => {
	const button = sv('btn', { variants: {}, introspection: true });

	const { slots } = button.explain({ class: { base: 'mt-2' } });

	t.equal(slots.base.class, 'mt-2', 'base class from slot object');
	t.equal(slots.base.result, 'btn mt-2', 'result includes it');

	t.end();
});

t.test('explain lists tokens dropped by postProcess', (t) => {
	const keepLast = (className: string) => {
		const byPrefix = new Map<string, string>();

		for (const token of className.split(' ')) {
			byPrefix.set(token.split('-')[0] ?? token, token);
		}

		return [...byPrefix.values()].join(' ');
	};

	const button = sv('px-4 py-2', {
		variants: {
			size: { lg: 'px-6' }
		},
		postProcess: keepLast,
		introspection: true
	});

	const { slots } = button.explain({ size: 'lg', class: 'py-3 py-3' });

	t.equal(
		slots.base.raw,
		'px-4 py-2 px-6 py-3 py-3',
		'raw before postProcess'
	);
	t.equal(slots.base.result, 'px-6 py-3', 'post-processed result');
	t.same(slots.base.dropped, ['px-4', 'py-2'], 'dropped tokens, deduped');

	t.end();
});

t.test('explain result matches the real call', (t) => {
	const card = sv('border', {
		slots: { header: 'font-bold', body: 'py-4' },
		variants: {
			size: { sm: { header: 'text-sm' }, lg: { body: 'text-lg' } }
		},
		compoundSlots: [{ size: 'sm', slots: ['body'], class: 'px-2' }],
		postProcess: (className) => className.toUpperCase(),
		introspection: true
	});

	const props = { size: 'sm', class: { header: 'mt-1' } } as const;
	const result = card(props);
	const { slots } = card.explain(props);

	t.equal(slots.base.result, result.base, 'base');
	t.equal(slots.header.result, result.header, 'header');
	t.equal(slots.body.result, result.body, 'body');

	t.end();
});

t.test('explain does not read or fill the cache', (t) => {
	const button = sv('btn', {
		variants: {
			size: { sm: 'text-sm', lg: 'text-lg' }
		},
		introspection: true
	});

	button.explain({ size: 'sm' });

	t.equal(button.getCacheSize(), 0, 'cache untouched');

	t.end();
});

t.test('explain throws the same errors as a call', (t) => {
	const button = sv('btn', {
		variants: {
			size: { sm: 'text-sm', lg: 'text-lg' },
			intent: { primary: 'bg-blue-500' }
		},
		presets: {
			cta: { size: 'lg' }
		},
		requiredVariants: ['intent'],
		introspection: true
	});

	t.throws(
		// @ts-expect-error - intent is required, to test the runtime error
		() => button.explain({ size: 'sm' }),
		{ message: 'Missing required variant: "intent"' },
		'missing required variant'
	);

	t.throws(
		// @ts-expect-error - invalid value to test the runtime error
		() => button.explain({ intent: 'primary', size: 'xl' }),
		{ message: 'Invalid value "xl" for variant "size"' },
		'unknown value'
	);

	t.throws(
		// @ts-expect-error - invalid preset to test the runtime error
		() => button.explain({ intent: 'primary', preset: 'nope' }),
		{ message: 'Invalid preset "nope"' },
		'unknown preset'
	);

	t.end();
});

// --- explain type tests ---

const _exFn = sv('btn', {
	slots: { icon: 'size-4' },
	variants: {
		size: { sm: 'text-sm', lg: 'text-lg' },
		disabled: 'opacity-50'
	},
	requiredVariants: ['size'],
	introspection: true
});

const _exTrace = _exFn.explain({ size: 'sm' });

type AssertExSizeValue = (typeof _exTrace)['variants']['size']['value'] extends
	| 'sm'
	| 'lg'
	| undefined
	? true
	: false;
const _assertExSizeValue: AssertExSizeValue = true;

type AssertExDisabledValue =
	(typeof _exTrace)['variants']['disabled']['value'] extends
		| boolean
		| undefined
		? true
		: false;
const _assertExDisabledValue: AssertExDisabledValue = true;

type AssertExSlotKeys = keyof (typeof _exTrace)['slots'] extends 'base' | 'icon'
	? true
	: false;
const _assertExSlotKeys: AssertExSlotKeys = true;

type AssertExSlotVariantKeys =
	keyof (typeof _exTrace)['slots']['icon']['variants'] extends
		| 'size'
		| 'disabled'
		? true
		: false;
const _assertExSlotVariantKeys: AssertExSlotVariantKeys = true;

// Required variants are required here too, like in a call
const _exMissingSize = () =>
	// @ts-expect-error - size is required
	_exFn.explain({});