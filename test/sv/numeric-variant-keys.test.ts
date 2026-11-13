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

// level should accept numeric literal types
type AssertNumericVariant = NumericVariantProps extends {
	level?: 1 | 2 | 3 | null | undefined;
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
	level?: 1 | 2 | null | undefined;
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