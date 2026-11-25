import t from 'tap';
import { sv } from '../../src/index.ts';

// sv() - compiled variant functions

t.test('compound matcher "undefined" matches an unset variant', (t) => {
	const button = sv('btn', {
		variants: {
			state: {
				undefined: 'is-undefined',
				on: 'is-on'
			}
		},
		compoundVariants: [{ state: 'undefined', class: 'matched' }]
	});

	t.equal(button(), 'btn matched', 'unset variant matches');
	t.equal(
		button({ state: 'undefined' }),
		'btn is-undefined matched',
		'"undefined" value matches'
	);
	t.equal(button({ state: 'on' }), 'btn is-on', 'other value does not match');

	t.end();
});

t.test('variant combinations beyond a safe integer still resolve', (t) => {
	const values = {
		a: 'a',
		b: 'b',
		c: 'c',
		d: 'd',
		e: 'e',
		f: 'f',
		g: 'g',
		h: 'h',
		i: 'i',
		j: 'j'
	};

	const button = sv('btn', {
		variants: {
			v0: values,
			v1: values,
			v2: values,
			v3: values,
			v4: values,
			v5: values,
			v6: values,
			v7: values,
			v8: values,
			v9: values,
			v10: values,
			v11: values,
			v12: values,
			v13: values,
			v14: values,
			v15: { ...values, k: 'k' }
		},
		defaultVariants: { v0: 'a' },
		introspection: true
	});

	t.equal(button(), 'btn a', 'defaults resolve');
	t.equal(button({ v0: 'b', v15: 'k' }), 'btn b k', 'props resolve');

	t.equal(button.getCacheSize(), 0, 'results are not cached');

	t.end();
});

t.test('variant values given as other types resolve like strings', (t) => {
	const button = sv('btn', {
		variants: {
			size: { 1: 'size-1', 2: 'size-2', 1.5: 'size-1.5' },
			active: { true: 'active', false: 'inactive' }
		}
	});

	t.equal(button({ size: 1 }), 'btn size-1', 'integer value');
	t.equal(button({ size: 1.5 }), 'btn size-1.5', 'decimal value');
	t.equal(button({ size: 2 }), 'btn size-2', 'another integer value');
	t.equal(button({ active: true }), 'btn active', 'boolean true');
	t.equal(button({ active: false }), 'btn inactive', 'boolean false');

	t.end();
});

t.test('variant value named after an object method is invalid', (t) => {
	const button = sv('btn', {
		variants: { size: { sm: 'text-sm', lg: 'text-lg' } }
	});

	t.throws(
		// @ts-expect-error - passing an invalid value to test the runtime check
		() => button({ size: 'toString' }),
		{ message: 'Invalid value "toString" for variant "size"' },
		'inherited property name is not a value'
	);

	t.end();
});

t.test('a record mixing a boolean key with others takes both booleans', (t) => {
	const card = sv({
		slots: { header: 'h' },
		variants: { tone: { true: 'a', header: 'b' } }
	});

	t.equal(card({ tone: true }).base, 'a', '`true` names the true key');
	t.equal(card({ tone: 'header' }).base, 'b', 'a slot name is a plain value');
	t.equal(card({ tone: false }).base, '', '`false` applies nothing');

	const badge = sv('badge', {
		variants: { size: { true: 'a', big: 'b' } }
	});

	t.equal(badge({ size: 'big' }), 'badge b', 'without slots too');
	t.equal(badge({ size: false }), 'badge', 'and `false` is accepted there');

	const off = sv('x', { variants: { tone: { false: 'f', sm: 's' } } });

	t.equal(off({ tone: false }), 'x f', 'a false key with named keys');
	t.equal(off({ tone: true }), 'x', '`true` applies nothing');

	const only = sv('x', { variants: { on: { true: 'a' } } });

	t.equal(only({ on: false }), 'x', 'a true-only record still takes false');

	t.end();
});

t.test('a mixed boolean record in introspection', (t) => {
	const badge = sv('badge', {
		variants: { size: { true: 'a', big: 'b' } },
		introspection: true
	});

	t.strictSame(
		badge.getVariantValues('size'),
		[true, 'big', false],
		'the added boolean comes last'
	);
	t.equal(badge.getMaxEntries(), 4, 'three values plus unset');

	t.end();
});

t.test('compounds match the added boolean of a mixed record', (t) => {
	const badge = sv('badge', {
		variants: {
			size: { true: 'a', big: 'b' },
			tone: { red: 'r' }
		},
		compoundVariants: [{ size: false, tone: 'red', class: 'c' }]
	});

	t.equal(badge({ size: false, tone: 'red' }), 'badge r c', 'false matches');
	t.equal(badge({ size: true, tone: 'red' }), 'badge a r', 'true does not');

	t.end();
});

t.test('variants named after object members resolve like any other', (t) => {
	// TypeScript checks an object literal's inherited members against the
	// declared ones, so a literal leaving out `toString` doesn't match a type
	// declaring it — those spots carry a `@ts-expect-error`, as a JavaScript
	// caller would write them.
	const plain = sv('btn', {
		variants: {
			toString: { a: 'ts-a' },
			constructor: { x: 'ctor-x' }
		}
	});

	t.equal(plain(), 'btn', 'unset when not passed');
	t.equal(
		plain({ toString: 'a', constructor: 'x' }),
		'btn ts-a ctor-x',
		'passed values apply'
	);

	const variants = {
		toString: { a: 'ts-a', b: 'ts-b' },
		size: { sm: 'sm', lg: 'lg' }
	};

	t.equal(
		sv('btn', { variants, defaultVariants: { toString: 'b' } })(),
		'btn ts-b',
		'a static default applies'
	);
	t.equal(
		sv('btn', { variants, defaultVariants: { toString: () => 'a' } })(),
		'btn ts-a',
		'a function default applies'
	);

	const preset = sv('btn', {
		variants,
		presets: {
			named: { toString: 'b' },
			// @ts-expect-error - the inherited `toString` is checked
			sized: { size: 'lg' }
		}
	});

	t.equal(
		// @ts-expect-error - the inherited `toString` is checked
		preset({ preset: 'named' }),
		'btn ts-b',
		'a preset value applies'
	);
	t.equal(
		// @ts-expect-error - the inherited `toString` is checked
		preset({ preset: 'sized' }),
		'btn lg',
		'a preset that skips the variant leaves it unset'
	);

	t.throws(
		// @ts-expect-error - omitting a required variant
		() => sv('btn', { variants, requiredVariants: ['toString'] })({}),
		{ message: 'Missing required variant: "toString"' },
		'a required variant is reported missing'
	);

	const compound = sv('btn', {
		variants,
		compoundVariants: [{ toString: 'a', size: 'sm', class: 'both' }]
	});

	t.equal(
		compound({ toString: 'a', size: 'sm' }),
		'btn ts-a sm both',
		'a compound matching it applies'
	);
	t.equal(
		// @ts-expect-error - the inherited `toString` is checked
		compound({ size: 'sm' }),
		'btn sm',
		'a compound matching it is skipped when unset'
	);

	t.end();
});

t.test('missing required variants are reported in listed order', (t) => {
	const button = sv('btn', {
		variants: {
			size: { sm: 'text-sm', lg: 'text-lg' },
			color: { red: 'red', blue: 'blue' }
		},
		requiredVariants: ['color', 'size']
	});

	t.throws(
		// @ts-expect-error - omitting required variants for the runtime check
		() => button(),
		{ message: 'Missing required variant: "color"' },
		'first listed required variant is reported'
	);

	t.end();
});

t.test('function defaults run once per call', (t) => {
	let calls = 0;

	const button = sv('btn', {
		variants: {
			size: { sm: 'text-sm', lg: 'text-lg' },
			tone: { soft: 'soft', loud: 'loud' }
		},
		defaultVariants: {
			tone: ({ size }) => {
				calls++;

				if (size === 'lg') {
					return 'loud';
				}

				return 'soft';
			}
		}
	});

	t.equal(button({ size: 'lg' }), 'btn text-lg loud', 'default uses props');
	t.equal(button({ size: 'sm' }), 'btn text-sm soft', 'default re-evaluated');
	t.equal(calls, 2, 'one evaluation per call');

	t.end();
});