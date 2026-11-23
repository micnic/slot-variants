import t from 'tap';
import { sv, type VariantProps } from '../../src/index.ts';

// sv() - numeric variant keys

// --- numeric variant type tests ---

const _numericVariantFn = sv('font-bold', {
	variants: {
		level: {
			1: 'text-4xl',
			2: 'text-3xl',
			3: 'text-2xl'
		}
	}
});

type NumericVariantProps = VariantProps<typeof _numericVariantFn>;

// level should accept numeric literal types, and their string forms
type AssertNumericVariant = NumericVariantProps extends {
	level?: 1 | 2 | 3 | '1' | '2' | '3' | null | undefined;
}
	? true
	: false;
const _assertNumericVariant: AssertNumericVariant = true;

// mixed numeric + string variant keys
const _mixedKeysFn = sv('font-bold', {
	variants: {
		level: {
			1: 'text-4xl',
			2: 'text-3xl'
		},
		intent: {
			primary: 'text-blue-500',
			danger: 'text-red-500'
		}
	}
});

type MixedKeysProps = VariantProps<typeof _mixedKeysFn>;

type AssertMixedKeys = MixedKeysProps extends {
	level?: 1 | 2 | '1' | '2' | null | undefined;
	intent?: 'primary' | 'danger' | null | undefined;
}
	? true
	: false;
const _assertMixedKeys: AssertMixedKeys = true;

void _numericVariantFn;
void _assertNumericVariant;
void _mixedKeysFn;
void _assertMixedKeys;

t.test('numeric variant keys', (t) => {
	const heading = sv('font-bold', {
		variants: {
			level: {
				1: 'text-4xl',
				2: 'text-3xl',
				3: 'text-2xl'
			}
		}
	});

	t.equal(heading({ level: 1 }), 'font-bold text-4xl', 'level 1');
	t.equal(heading({ level: 2 }), 'font-bold text-3xl', 'level 2');
	t.equal(heading({ level: 3 }), 'font-bold text-2xl', 'level 3');

	t.end();
});

t.test('numeric variant with default', (t) => {
	const heading = sv('font-bold', {
		variants: {
			level: {
				1: 'text-4xl',
				2: 'text-3xl',
				3: 'text-2xl'
			}
		},
		defaultVariants: {
			level: 1
		}
	});

	t.equal(heading(), 'font-bold text-4xl', 'uses numeric default');
	t.equal(
		heading({}),
		'font-bold text-4xl',
		'uses numeric default with empty props'
	);
	t.equal(
		heading({ level: 3 }),
		'font-bold text-2xl',
		'explicit numeric value overrides default'
	);

	t.end();
});

t.test('mixed numeric and string variant keys', (t) => {
	const heading = sv('font-bold', {
		variants: {
			level: {
				1: 'text-4xl',
				2: 'text-3xl'
			},
			intent: {
				primary: 'text-blue-500',
				danger: 'text-red-500'
			}
		},
		defaultVariants: {
			level: 1,
			intent: 'primary'
		}
	});

	t.equal(
		heading(),
		'font-bold text-4xl text-blue-500',
		'both defaults applied'
	);
	t.equal(
		heading({ level: 2, intent: 'danger' }),
		'font-bold text-3xl text-red-500',
		'both overridden'
	);

	t.end();
});

t.test('throws for invalid numeric variant value', (t) => {
	const heading = sv('font-bold', {
		variants: {
			level: {
				1: 'text-4xl',
				2: 'text-3xl'
			}
		}
	});

	t.throws(
		// @ts-expect-error - intentionally passing invalid variant value
		() => heading({ level: 5 }),
		{ message: 'Invalid value "5" for variant "level"' },
		'throws for out-of-range numeric value'
	);

	t.end();
});

t.test('number keys take their string as well', (t) => {
	const heading = sv('font-bold', {
		variants: { level: { 1: 'text-4xl', 2: 'text-3xl' } }
	});

	t.equal(heading({ level: '1' }), 'font-bold text-4xl', 'string form');
	t.equal(heading({ level: 2 }), 'font-bold text-3xl', 'number form');
	t.throws(
		// @ts-expect-error '3' is no value of the variant
		() => heading({ level: '3' }),
		'an unknown string form'
	);

	t.end();
});

t.test('quoted numeric keys take their number as well', (t) => {
	const heading = sv({
		variants: { level: { '1': 'text-4xl', '2': 'text-2xl', '07': 'x' } },
		introspection: true
	});
	const values: (1 | 2 | '07')[] = heading.getVariantValues('level');

	t.same(values, [1, 2, '07'], 'numbers for the canonical keys');
	t.equal(heading({ level: 1 }), 'text-4xl', 'a number');
	t.equal(heading({ level: '2' }), 'text-2xl', 'the key itself');
	t.throws(
		// @ts-expect-error - only a canonical key is read as a number
		() => heading({ level: 7 }),
		{ message: 'Invalid value "7" for variant "level"' },
		'a padded key is no number'
	);

	t.end();
});
t.test('a quoted numeric key leaves the other keys listed', (t) => {
	const button = sv({
		variants: { size: { sm: 'text-sm', '1': 'text-xs' } },
		introspection: true
	});
	const values = button.getVariantValues('size');
	// Typed with both kinds of key, as listed at runtime
	const listed: typeof values = [1, 'sm'];

	t.same(values, listed, 'the number and the other key');

	t.end();
});
