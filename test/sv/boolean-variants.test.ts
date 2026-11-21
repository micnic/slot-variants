import t from 'tap';
import { sv, type VariantProps, type VariantValue } from '../../src/index.ts';

// sv() - boolean variants

// --- boolean variant type tests ---

// true/false record form — prop type should be boolean
const _boolRecordFn = sv('rounded-lg', {
	variants: {
		disabled: {
			true: 'opacity-50 cursor-not-allowed',
			false: 'cursor-pointer'
		}
	}
});

type BoolRecordProps = VariantProps<typeof _boolRecordFn>;

type AssertBoolRecord = BoolRecordProps extends {
	disabled?: boolean | null | undefined;
}
	? true
	: false;
const _assertBoolRecord: AssertBoolRecord = true;

// shorthand form (direct ClassValue) — prop type should also be boolean
const _boolShorthandFn = sv('rounded-lg', {
	variants: {
		disabled: 'opacity-50 cursor-not-allowed'
	}
});

type BoolShorthandProps = VariantProps<typeof _boolShorthandFn>;

type AssertBoolShorthand = BoolShorthandProps extends {
	disabled?: boolean | null | undefined;
}
	? true
	: false;
const _assertBoolShorthand: AssertBoolShorthand = true;

// mixed regular + boolean shorthand
const _mixedBoolFn = sv('rounded-lg', {
	variants: {
		size: {
			sm: 'text-sm',
			lg: 'text-lg'
		},
		disabled: 'opacity-50',
		loading: ['animate-spin', 'pointer-events-none']
	}
});

type MixedBoolProps = VariantProps<typeof _mixedBoolFn>;

type AssertMixedBool = MixedBoolProps extends {
	size?: 'sm' | 'lg' | null | undefined;
	disabled?: boolean | null | undefined;
	loading?: boolean | null | undefined;
}
	? true
	: false;
const _assertMixedBool: AssertMixedBool = true;

void _boolRecordFn;
void _assertBoolRecord;
// a record mixing a boolean key with named keys takes both booleans
const _mixedBooleanFn = sv('badge', {
	variants: {
		size: { true: 'a', big: 'b' },
		level: { 1: 'one', false: 'off' }
	}
});

type MixedSize = VariantValue<typeof _mixedBooleanFn, 'size'>;
type MixedLevel = VariantValue<typeof _mixedBooleanFn, 'level'>;
type AssertMixedSize = [MixedSize] extends [boolean | 'big']
	? [boolean | 'big'] extends [MixedSize]
		? true
		: false
	: false;
type AssertMixedLevel = [MixedLevel] extends [boolean | 1 | '1']
	? [boolean | 1 | '1'] extends [MixedLevel]
		? true
		: false
	: false;
const _assertMixedSize: AssertMixedSize = true;
const _assertMixedLevel: AssertMixedLevel = true;

void _mixedBooleanFn;
void _assertMixedSize;
void _assertMixedLevel;
void _boolShorthandFn;
void _assertBoolShorthand;
void _mixedBoolFn;
void _assertMixedBool;

t.test('boolean variant with true/false record', (t) => {
	const button = sv('rounded-lg font-medium', {
		variants: {
			disabled: {
				true: 'opacity-50 cursor-not-allowed',
				false: 'cursor-pointer'
			}
		}
	});

	t.equal(
		button({ disabled: true }),
		'rounded-lg font-medium opacity-50 cursor-not-allowed',
		'true applies disabled classes'
	);
	t.equal(
		button({ disabled: false }),
		'rounded-lg font-medium cursor-pointer',
		'false applies enabled classes'
	);

	t.end();
});

t.test('boolean variant with only false key', (t) => {
	const button = sv('rounded-lg', {
		variants: {
			disabled: {
				false: 'cursor-pointer'
			}
		}
	});

	t.equal(
		button({ disabled: true }),
		'rounded-lg',
		'true returns base when undefined'
	);
	t.equal(
		button({ disabled: false }),
		'rounded-lg cursor-pointer',
		'false applies defined class'
	);

	t.end();
});

t.test('boolean variant with only true key', (t) => {
	const button = sv('rounded-lg', {
		variants: {
			disabled: {
				true: 'opacity-50 cursor-not-allowed'
			}
		}
	});

	t.equal(
		button({ disabled: true }),
		'rounded-lg opacity-50 cursor-not-allowed',
		'true applies defined class'
	);
	t.equal(
		button({ disabled: false }),
		'rounded-lg',
		'false returns base when undefined'
	);

	t.end();
});

t.test('boolean variant shorthand with string', (t) => {
	const button = sv('rounded-lg font-medium', {
		variants: {
			disabled: 'opacity-50 cursor-not-allowed'
		}
	});

	t.equal(
		button({ disabled: true }),
		'rounded-lg font-medium opacity-50 cursor-not-allowed',
		'true applies shorthand classes'
	);
	t.equal(
		button({ disabled: false }),
		'rounded-lg font-medium',
		'false produces no extra classes'
	);

	t.end();
});

t.test('boolean variant shorthand with array', (t) => {
	const button = sv('rounded-lg', {
		variants: {
			loading: ['animate-spin', 'pointer-events-none']
		}
	});

	t.equal(
		button({ loading: true }),
		'rounded-lg animate-spin pointer-events-none',
		'true applies array shorthand'
	);
	t.equal(
		button({ loading: false }),
		'rounded-lg',
		'false produces no extra classes'
	);

	t.end();
});

t.test('boolean variant with default', (t) => {
	const button = sv('rounded-lg', {
		variants: {
			disabled: 'opacity-50 cursor-not-allowed'
		},
		defaultVariants: {
			disabled: true
		}
	});

	t.equal(
		button(),
		'rounded-lg opacity-50 cursor-not-allowed',
		'default true applies classes'
	);
	t.equal(
		button({ disabled: false }),
		'rounded-lg',
		'explicit false overrides default true'
	);

	t.end();
});

t.test('boolean variant with default false', (t) => {
	const button = sv('rounded-lg', {
		variants: {
			disabled: {
				true: 'opacity-50 cursor-not-allowed',
				false: 'cursor-pointer'
			}
		},
		defaultVariants: {
			disabled: false
		}
	});

	t.equal(
		button(),
		'rounded-lg cursor-pointer',
		'default false applies false classes'
	);
	t.equal(
		button({}),
		'rounded-lg cursor-pointer',
		'empty props uses default false'
	);
	t.equal(
		button({ disabled: true }),
		'rounded-lg opacity-50 cursor-not-allowed',
		'explicit true overrides default false'
	);

	t.end();
});

t.test('mixed regular and boolean shorthand variants', (t) => {
	const button = sv('rounded-lg', {
		variants: {
			size: {
				sm: 'px-2 py-1 text-sm',
				lg: 'px-6 py-3 text-lg'
			},
			disabled: 'opacity-50 cursor-not-allowed',
			loading: 'animate-pulse'
		}
	});

	t.equal(
		button({ size: 'sm', disabled: true }),
		'rounded-lg px-2 py-1 text-sm opacity-50 cursor-not-allowed',
		'regular + boolean shorthand'
	);
	t.equal(
		button({ size: 'lg', disabled: true, loading: true }),
		'rounded-lg px-6 py-3 text-lg opacity-50 cursor-not-allowed animate-pulse',
		'regular + two boolean shorthands'
	);
	t.equal(
		button({ size: 'sm', disabled: false, loading: false }),
		'rounded-lg px-2 py-1 text-sm',
		'both booleans false produce no extra classes'
	);

	t.end();
});