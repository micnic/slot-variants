import t from 'tap';
import { sv, type VariantProps } from '../src/index.ts';

// =============================================================================
// sv() - base only (no config)
// =============================================================================

t.test('base only with string', (t) => {
	t.equal(sv('flex'), 'flex', 'single class');
	t.equal(
		sv('flex items-center gap-2'),
		'flex items-center gap-2',
		'multiple classes in one string'
	);
	t.equal(sv(''), '', 'empty string');

	t.end();
});

t.test('base only with array', (t) => {
	t.equal(
		sv(['flex', 'items-center', 'gap-2']),
		'flex items-center gap-2',
		'flat array'
	);
	t.equal(
		sv(['flex', ['items-center', 'gap-2']]),
		'flex items-center gap-2',
		'nested array'
	);

	t.end();
});

t.test('base only with object', (t) => {
	t.equal(
		sv({ flex: true, hidden: false, 'items-center': true }),
		'flex items-center',
		'object with mixed truthy/falsy'
	);

	t.end();
});

t.test('base only with mixed ClassValue', (t) => {
	t.equal(
		sv(['flex', { 'items-center': true, hidden: false }, 'gap-2']),
		'flex items-center gap-2',
		'array with nested object'
	);

	t.end();
});

// =============================================================================
// sv() - variants (no slots)
// =============================================================================

// --- variant type tests ---

const _singleVariantFn = sv('rounded-lg', {
	variants: {
		size: {
			sm: 'text-sm',
			md: 'text-base',
			lg: 'text-lg'
		}
	}
});

type SingleVariantProps = VariantProps<typeof _singleVariantFn>;

// size should be optional and accept only 'sm' | 'md' | 'lg'
type AssertSingleVariant = SingleVariantProps extends {
	size?: 'sm' | 'md' | 'lg' | undefined;
}
	? true
	: false;
const _assertSingleVariant: AssertSingleVariant = true;

// class/className should not be in VariantProps
type AssertNoClass = 'class' extends keyof SingleVariantProps ? false : true;
type AssertNoClassName = 'className' extends keyof SingleVariantProps
	? false
	: true;
const _assertNoClass: AssertNoClass = true;
const _assertNoClassName: AssertNoClassName = true;

const _multiVariantFn = sv('rounded-lg', {
	variants: {
		size: {
			sm: 'text-sm',
			lg: 'text-lg'
		},
		intent: {
			primary: 'bg-blue-500',
			danger: 'bg-red-500'
		}
	}
});

type MultiVariantProps = VariantProps<typeof _multiVariantFn>;

// both variants should be optional with correct union types
type AssertMultiVariant = MultiVariantProps extends {
	size?: 'sm' | 'lg' | undefined;
	intent?: 'primary' | 'danger' | undefined;
}
	? true
	: false;
const _assertMultiVariant: AssertMultiVariant = true;

// VariantProps with exclusion should omit specified variants
type ExcludedVariantProps = VariantProps<typeof _multiVariantFn, 'intent'>;

type AssertExcludedVariant = ExcludedVariantProps extends {
	size?: 'sm' | 'lg' | undefined;
}
	? true
	: false;
const _assertExcludedVariant: AssertExcludedVariant = true;

type AssertIntentExcluded = 'intent' extends keyof ExcludedVariantProps
	? false
	: true;
const _assertIntentExcluded: AssertIntentExcluded = true;

void _singleVariantFn;
void _assertSingleVariant;
void _assertNoClass;
void _assertNoClassName;
void _multiVariantFn;
void _assertMultiVariant;
void _assertExcludedVariant;
void _assertIntentExcluded;

t.test('single variant', (t) => {
	const button = sv('rounded-lg font-medium', {
		variants: {
			size: {
				sm: 'px-2 py-1 text-sm',
				md: 'px-4 py-2 text-base',
				lg: 'px-6 py-3 text-lg'
			}
		}
	});

	t.equal(
		button({ size: 'sm' }),
		'rounded-lg font-medium px-2 py-1 text-sm',
		'applies sm variant'
	);
	t.equal(
		button({ size: 'md' }),
		'rounded-lg font-medium px-4 py-2 text-base',
		'applies md variant'
	);
	t.equal(
		button({ size: 'lg' }),
		'rounded-lg font-medium px-6 py-3 text-lg',
		'applies lg variant'
	);

	t.end();
});

t.test('multiple variants', (t) => {
	const button = sv('rounded-lg font-medium', {
		variants: {
			size: {
				sm: 'px-2 py-1 text-sm',
				lg: 'px-6 py-3 text-lg'
			},
			intent: {
				primary: 'bg-blue-500 text-white',
				danger: 'bg-red-500 text-white'
			}
		}
	});

	t.equal(
		button({ size: 'sm', intent: 'primary' }),
		'rounded-lg font-medium px-2 py-1 text-sm bg-blue-500 text-white',
		'sm + primary'
	);
	t.equal(
		button({ size: 'lg', intent: 'danger' }),
		'rounded-lg font-medium px-6 py-3 text-lg bg-red-500 text-white',
		'lg + danger'
	);

	t.end();
});

t.test('variant with only one prop provided', (t) => {
	const button = sv('rounded-lg', {
		variants: {
			size: {
				sm: 'text-sm',
				lg: 'text-lg'
			},
			intent: {
				primary: 'bg-blue-500',
				danger: 'bg-red-500'
			}
		}
	});

	t.equal(
		button({ size: 'sm' }),
		'rounded-lg text-sm',
		'only size provided, intent skipped'
	);
	t.equal(
		button({ intent: 'danger' }),
		'rounded-lg bg-red-500',
		'only intent provided, size skipped'
	);

	t.end();
});

t.test('variant with no props', (t) => {
	const button = sv('rounded-lg', {
		variants: {
			size: {
				sm: 'text-sm',
				lg: 'text-lg'
			}
		}
	});

	t.equal(button(), 'rounded-lg', 'no props returns base only');
	t.equal(button({}), 'rounded-lg', 'empty props returns base only');

	t.end();
});

t.test('variant with empty variants object', (t) => {
	const button = sv('rounded-lg', {
		variants: {}
	});

	t.equal(button(), 'rounded-lg', 'empty variants with no props');
	t.equal(button({}), 'rounded-lg', 'empty variants with empty props');

	t.end();
});

t.test('variant with ClassRecord value', (t) => {
	const button = sv('rounded-lg', {
		variants: {
			state: {
				active: { 'bg-blue-500': true, 'font-bold': true },
				disabled: { 'opacity-50': true, 'cursor-not-allowed': true }
			}
		}
	});

	t.equal(
		button({ state: 'active' }),
		'rounded-lg bg-blue-500 font-bold',
		'active state ClassRecord'
	);
	t.equal(
		button({ state: 'disabled' }),
		'rounded-lg opacity-50 cursor-not-allowed',
		'disabled state ClassRecord'
	);

	t.end();
});

t.test('variant with array value', (t) => {
	const button = sv('rounded-lg', {
		variants: {
			size: {
				sm: ['px-2', 'py-1', 'text-sm'],
				lg: ['px-6', 'py-3', 'text-lg']
			}
		}
	});

	t.equal(
		button({ size: 'sm' }),
		'rounded-lg px-2 py-1 text-sm',
		'sm array variant'
	);
	t.equal(
		button({ size: 'lg' }),
		'rounded-lg px-6 py-3 text-lg',
		'lg array variant'
	);

	t.end();
});

t.test('variant with nested array value', (t) => {
	const button = sv('rounded-lg', {
		variants: {
			size: {
				sm: ['px-2', 'py-1', ['text-sm', 'leading-tight']],
				lg: ['px-6', 'py-3', ['text-lg', 'leading-loose']]
			}
		}
	});

	t.equal(
		button({ size: 'sm' }),
		'rounded-lg px-2 py-1 text-sm leading-tight',
		'flattens nested arrays in sm variant'
	);
	t.equal(
		button({ size: 'lg' }),
		'rounded-lg px-6 py-3 text-lg leading-loose',
		'flattens nested arrays in lg variant'
	);

	t.end();
});

t.test('throws for invalid variant value', (t) => {
	const button = sv('rounded-lg', {
		variants: {
			size: {
				sm: 'text-sm',
				lg: 'text-lg'
			}
		}
	});

	t.throws(
		// @ts-expect-error - intentionally passing invalid variant value
		() => button({ size: 'xl' }),
		{ message: 'Invalid value "xl" for variant "size"' },
		'throws for unknown variant value'
	);

	t.end();
});

// =============================================================================
// sv() - default variants
// =============================================================================

// --- default variant type tests ---

// VariantProps should be the same regardless of defaults (all optional)
const _defaultVariantFn = sv('rounded-lg', {
	variants: {
		size: {
			sm: 'text-sm',
			md: 'text-base',
			lg: 'text-lg'
		},
		intent: {
			primary: 'bg-blue-500',
			danger: 'bg-red-500'
		}
	},
	defaultVariants: {
		size: 'md',
		intent: 'primary'
	}
});

type DefaultVariantProps = VariantProps<typeof _defaultVariantFn>;

// defaults do not make props required - they remain optional
type AssertDefaultVariantProps = DefaultVariantProps extends {
	size?: 'sm' | 'md' | 'lg' | undefined;
	intent?: 'primary' | 'danger' | undefined;
}
	? true
	: false;
const _assertDefaultVariantProps: AssertDefaultVariantProps = true;

// the function can be called with no arguments when defaults exist
const _defaultCallNoArgs: string = _defaultVariantFn();
const _defaultCallEmpty: string = _defaultVariantFn({});

void _defaultVariantFn;
void _assertDefaultVariantProps;
void _defaultCallNoArgs;
void _defaultCallEmpty;

t.test('default variant applied when no props', (t) => {
	const button = sv('rounded-lg font-medium', {
		variants: {
			size: {
				sm: 'px-2 py-1 text-sm',
				md: 'px-4 py-2 text-base',
				lg: 'px-6 py-3 text-lg'
			}
		},
		defaultVariants: {
			size: 'md'
		}
	});

	t.equal(
		button(),
		'rounded-lg font-medium px-4 py-2 text-base',
		'uses default when no props'
	);
	t.equal(
		button({}),
		'rounded-lg font-medium px-4 py-2 text-base',
		'uses default with empty props'
	);

	t.end();
});

t.test('explicit prop overrides default variant', (t) => {
	const button = sv('rounded-lg', {
		variants: {
			size: {
				sm: 'px-2 py-1 text-sm',
				lg: 'px-6 py-3 text-lg'
			}
		},
		defaultVariants: {
			size: 'sm'
		}
	});

	t.equal(
		button({ size: 'lg' }),
		'rounded-lg px-6 py-3 text-lg',
		'explicit prop overrides default'
	);

	t.end();
});

t.test('explicit undefined does not override default variant', (t) => {
	const button = sv('rounded-lg', {
		variants: {
			size: {
				sm: 'text-sm',
				lg: 'text-lg'
			},
			intent: {
				primary: 'bg-blue-500',
				danger: 'bg-red-500'
			}
		},
		defaultVariants: {
			size: 'sm',
			intent: 'primary'
		}
	});

	t.equal(
		button({ size: undefined }),
		'rounded-lg text-sm bg-blue-500',
		'undefined size falls back to default'
	);
	t.equal(
		button({ size: undefined, intent: 'danger' }),
		'rounded-lg text-sm bg-red-500',
		'undefined size uses default, explicit intent overrides'
	);
	t.equal(
		button({ size: 'lg', intent: undefined }),
		'rounded-lg text-lg bg-blue-500',
		'explicit size overrides, undefined intent uses default'
	);

	t.end();
});

t.test('defaults for multiple variants', (t) => {
	const button = sv('rounded-lg', {
		variants: {
			size: {
				sm: 'text-sm',
				lg: 'text-lg'
			},
			intent: {
				primary: 'bg-blue-500',
				danger: 'bg-red-500'
			}
		},
		defaultVariants: {
			size: 'sm',
			intent: 'primary'
		}
	});

	t.equal(
		button(),
		'rounded-lg text-sm bg-blue-500',
		'both defaults applied'
	);
	t.equal(
		button({ size: 'lg' }),
		'rounded-lg text-lg bg-blue-500',
		'override one, other uses default'
	);
	t.equal(
		button({ size: 'lg', intent: 'danger' }),
		'rounded-lg text-lg bg-red-500',
		'both overridden'
	);

	t.end();
});

t.test('partial defaults leave other variants unset', (t) => {
	const button = sv('rounded-lg', {
		variants: {
			size: {
				sm: 'text-sm',
				lg: 'text-lg'
			},
			intent: {
				primary: 'bg-blue-500',
				danger: 'bg-red-500'
			}
		},
		defaultVariants: {
			size: 'sm'
		}
	});

	t.equal(
		button(),
		'rounded-lg text-sm',
		'only size default applied, intent skipped'
	);
	t.equal(
		button({ intent: 'danger' }),
		'rounded-lg text-sm bg-red-500',
		'size default + explicit intent'
	);

	t.end();
});

// =============================================================================
// sv() - boolean variants
// =============================================================================

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
	disabled?: boolean | undefined;
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
	disabled?: boolean | undefined;
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
	size?: 'sm' | 'lg' | undefined;
	disabled?: boolean | undefined;
	loading?: boolean | undefined;
}
	? true
	: false;
const _assertMixedBool: AssertMixedBool = true;

void _boolRecordFn;
void _assertBoolRecord;
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

// =============================================================================
// sv() - numeric variant keys
// =============================================================================

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
	level?: 1 | 2 | 3 | undefined;
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
	level?: 1 | 2 | undefined;
	intent?: 'primary' | 'danger' | undefined;
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
	t.equal(heading({}), 'font-bold text-4xl', 'uses numeric default with empty props');
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

// =============================================================================
// sv() - slots
// =============================================================================

// --- slot type tests ---

// return type should be a record with base + slot keys
const _slotFn = sv('border rounded-lg', {
	slots: {
		header: 'px-4 py-2 font-bold',
		body: 'px-4 py-4',
		footer: 'px-4 py-2 border-t'
	}
});

type SlotReturn = ReturnType<typeof _slotFn>;

type AssertSlotReturn = SlotReturn extends {
	base: string;
	header: string;
	body: string;
	footer: string;
}
	? true
	: false;
const _assertSlotReturn: AssertSlotReturn = true;

// with slots + variants, VariantProps still works the same
const _slotVariantFn = sv('border rounded-lg', {
	slots: {
		header: 'font-bold',
		body: 'py-4'
	},
	variants: {
		size: {
			sm: { base: 'p-2', header: 'text-sm' },
			lg: { base: 'p-6', header: 'text-lg' }
		}
	}
});

type SlotVariantProps = VariantProps<typeof _slotVariantFn>;

type AssertSlotVariantProps = SlotVariantProps extends {
	size?: 'sm' | 'lg' | undefined;
}
	? true
	: false;
const _assertSlotVariantProps: AssertSlotVariantProps = true;

// boolean shorthand with slots — slot object as shorthand value
const _slotBoolFn = sv('border', {
	slots: {
		header: 'font-bold',
		body: 'py-4'
	},
	variants: {
		highlighted: {
			base: 'ring-2 ring-blue-500',
			header: 'bg-blue-100'
		}
	}
});

type SlotBoolProps = VariantProps<typeof _slotBoolFn>;

type AssertSlotBool = SlotBoolProps extends {
	highlighted?: boolean | undefined;
}
	? true
	: false;
const _assertSlotBool: AssertSlotBool = true;

void _slotFn;
void _assertSlotReturn;
void _slotVariantFn;
void _assertSlotVariantProps;
void _slotBoolFn;
void _assertSlotBool;

t.test('empty slots object returns string not record', (t) => {
	const box = sv('border rounded-lg', {
		slots: {}
	});

	const result = box();
	t.equal(typeof result, 'string', 'returns string for empty slots');
	t.equal(result, 'border rounded-lg', 'returns base class');

	t.end();
});

t.test('slots return record with base + slot keys', (t) => {
	const card = sv('border rounded-lg shadow-md', {
		slots: {
			header: 'px-4 py-2 font-bold border-b',
			body: 'px-4 py-4',
			footer: 'px-4 py-2 border-t'
		}
	});

	const result = card();
	t.same(result, {
		base: 'border rounded-lg shadow-md',
		header: 'px-4 py-2 font-bold border-b',
		body: 'px-4 py-4',
		footer: 'px-4 py-2 border-t'
	});

	t.end();
});

t.test('slots with base slot in config', (t) => {
	const card = sv('border', {
		slots: {
			base: 'rounded-lg shadow-md',
			header: 'font-bold',
			body: 'py-4'
		}
	});

	const result = card();
	t.equal(result.base, 'border rounded-lg shadow-md', 'base merged from both');
	t.equal(result.header, 'font-bold', 'header slot');
	t.equal(result.body, 'py-4', 'body slot');

	t.end();
});

t.test('slots with variant applied to specific slots', (t) => {
	const card = sv('border rounded-lg', {
		slots: {
			header: 'font-bold',
			body: 'py-4'
		},
		variants: {
			size: {
				sm: {
					base: 'p-2',
					header: 'text-sm',
					body: 'text-xs'
				},
				lg: {
					base: 'p-6',
					header: 'text-xl',
					body: 'text-base'
				}
			}
		}
	});

	const sm = card({ size: 'sm' });
	t.equal(sm.base, 'border rounded-lg p-2', 'sm base');
	t.equal(sm.header, 'font-bold text-sm', 'sm header');
	t.equal(sm.body, 'py-4 text-xs', 'sm body');

	const lg = card({ size: 'lg' });
	t.equal(lg.base, 'border rounded-lg p-6', 'lg base');
	t.equal(lg.header, 'font-bold text-xl', 'lg header');
	t.equal(lg.body, 'py-4 text-base', 'lg body');

	t.end();
});

t.test('slots with variant applied to only some slots', (t) => {
	const card = sv('border rounded-lg', {
		slots: {
			header: 'font-bold',
			body: 'py-4',
			footer: 'border-t'
		},
		variants: {
			size: {
				sm: { base: 'p-2', header: 'text-sm' },
				lg: { base: 'p-6', header: 'text-xl' }
			}
		}
	});

	const result = card({ size: 'sm' });
	t.equal(result.base, 'border rounded-lg p-2', 'base affected');
	t.equal(result.header, 'font-bold text-sm', 'header affected');
	t.equal(result.body, 'py-4', 'body unchanged');
	t.equal(result.footer, 'border-t', 'footer unchanged');

	t.end();
});

t.test('slots with boolean shorthand targeting slots', (t) => {
	const card = sv('border rounded-lg', {
		slots: {
			header: 'font-bold',
			body: 'py-4'
		},
		variants: {
			highlighted: {
				base: 'ring-2 ring-blue-500',
				header: 'bg-blue-100'
			}
		}
	});

	const on = card({ highlighted: true });
	t.equal(on.base, 'border rounded-lg ring-2 ring-blue-500', 'highlighted base');
	t.equal(on.header, 'font-bold bg-blue-100', 'highlighted header');
	t.equal(on.body, 'py-4', 'body unchanged');

	const off = card({ highlighted: false });
	t.equal(off.base, 'border rounded-lg', 'not highlighted base');
	t.equal(off.header, 'font-bold', 'not highlighted header');

	t.end();
});

t.test('slots with boolean true/false record variant with slot-object values', (t) => {
	const card = sv('border rounded-lg', {
		slots: {
			header: 'font-bold',
			body: 'py-4'
		},
		variants: {
			disabled: {
				true: { base: 'opacity-50', header: 'text-gray-400' },
				false: { base: 'opacity-100', header: 'text-black' }
			}
		}
	});

	const on = card({ disabled: true });
	t.equal(on.base, 'border rounded-lg opacity-50', 'disabled true base');
	t.equal(on.header, 'font-bold text-gray-400', 'disabled true header');
	t.equal(on.body, 'py-4', 'disabled true body unchanged');

	const off = card({ disabled: false });
	t.equal(off.base, 'border rounded-lg opacity-100', 'disabled false base');
	t.equal(off.header, 'font-bold text-black', 'disabled false header');
	t.equal(off.body, 'py-4', 'disabled false body unchanged');

	t.end();
});

t.test('slots with throws for invalid variant value', (t) => {
	const card = sv('border', {
		slots: {
			header: 'font-bold',
			body: 'py-4'
		},
		variants: {
			size: {
				sm: { base: 'p-2' },
				lg: { base: 'p-6' }
			}
		}
	});

	t.throws(
		// @ts-expect-error - intentionally passing invalid variant value
		() => card({ size: 'xl' }),
		{ message: 'Invalid value "xl" for variant "size"' },
		'throws for invalid variant value with slots'
	);

	t.end();
});

// =============================================================================
// sv() - compound variants
// =============================================================================

t.test('compound variant matches when conditions met', (t) => {
	const button = sv('rounded-lg font-medium', {
		variants: {
			size: {
				sm: 'px-2 py-1 text-sm',
				lg: 'px-6 py-3 text-lg'
			},
			intent: {
				primary: 'bg-blue-500 text-white',
				danger: 'bg-red-500 text-white'
			}
		},
		compoundVariants: [
			{
				size: 'sm',
				intent: 'primary',
				class: 'uppercase tracking-wide'
			}
		]
	});

	t.equal(
		button({ size: 'sm', intent: 'primary' }),
		'rounded-lg font-medium px-2 py-1 text-sm bg-blue-500 text-white uppercase tracking-wide',
		'compound matches sm+primary'
	);
	t.equal(
		button({ size: 'lg', intent: 'primary' }),
		'rounded-lg font-medium px-6 py-3 text-lg bg-blue-500 text-white',
		'compound does not match lg+primary'
	);
	t.equal(
		button({ size: 'sm', intent: 'danger' }),
		'rounded-lg font-medium px-2 py-1 text-sm bg-red-500 text-white',
		'compound does not match sm+danger'
	);

	t.end();
});

t.test('compound variant with array matching', (t) => {
	const button = sv('rounded-lg', {
		variants: {
			size: {
				sm: 'text-sm',
				md: 'text-base',
				lg: 'text-lg'
			}
		},
		compoundVariants: [
			{
				size: ['sm', 'md'],
				class: 'font-normal'
			}
		]
	});

	t.equal(
		button({ size: 'sm' }),
		'rounded-lg text-sm font-normal',
		'matches sm in array'
	);
	t.equal(
		button({ size: 'md' }),
		'rounded-lg text-base font-normal',
		'matches md in array'
	);
	t.equal(
		button({ size: 'lg' }),
		'rounded-lg text-lg',
		'does not match lg'
	);

	t.end();
});

t.test('compound variant with className instead of class', (t) => {
	const button = sv('rounded-lg', {
		variants: {
			size: {
				sm: 'text-sm',
				lg: 'text-lg'
			}
		},
		compoundVariants: [
			{
				size: 'sm',
				className: 'shadow-sm'
			}
		]
	});

	t.equal(
		button({ size: 'sm' }),
		'rounded-lg text-sm shadow-sm',
		'className applied on match'
	);
	t.equal(
		button({ size: 'lg' }),
		'rounded-lg text-lg',
		'className not applied on mismatch'
	);

	t.end();
});

t.test('compound variant with slots — slot-specific class', (t) => {
	const card = sv('border rounded-lg', {
		slots: {
			header: 'font-bold',
			body: 'py-4'
		},
		variants: {
			variant: {
				primary: {
					base: 'border-blue-500',
					header: 'text-blue-700'
				},
				danger: {
					base: 'border-red-500',
					header: 'text-red-700'
				}
			},
			size: {
				sm: { base: 'p-2' },
				lg: { base: 'p-6' }
			}
		},
		compoundVariants: [
			{
				variant: 'primary',
				size: 'lg',
				class: {
					base: 'shadow-xl',
					body: 'min-h-32'
				}
			}
		]
	});

	const match = card({ variant: 'primary', size: 'lg' });
	t.equal(match.base, 'border rounded-lg border-blue-500 p-6 shadow-xl', 'compound base');
	t.equal(match.header, 'font-bold text-blue-700', 'header unchanged');
	t.equal(match.body, 'py-4 min-h-32', 'compound body');

	const noMatch = card({ variant: 'danger', size: 'lg' });
	t.equal(noMatch.base, 'border rounded-lg border-red-500 p-6', 'no compound base');
	t.equal(noMatch.body, 'py-4', 'no compound body');

	t.end();
});

t.test('compound variant with boolean shorthand', (t) => {
	const button = sv('rounded-lg', {
		variants: {
			size: {
				sm: 'text-sm',
				lg: 'text-lg'
			},
			loading: 'animate-pulse'
		},
		compoundVariants: [
			{
				size: 'sm',
				loading: true,
				class: 'scale-95'
			}
		]
	});

	t.equal(
		button({ size: 'sm', loading: true }),
		'rounded-lg text-sm animate-pulse scale-95',
		'compound matches sm+loading'
	);
	t.equal(
		button({ size: 'lg', loading: true }),
		'rounded-lg text-lg animate-pulse',
		'compound does not match lg+loading'
	);
	t.equal(
		button({ size: 'sm', loading: false }),
		'rounded-lg text-sm',
		'compound does not match sm+not loading'
	);

	t.end();
});

t.test('compound variant with false boolean condition', (t) => {
	const button = sv('rounded-lg', {
		variants: {
			size: {
				sm: 'text-sm',
				lg: 'text-lg'
			},
			disabled: {
				true: 'opacity-50',
				false: 'cursor-pointer'
			}
		},
		compoundVariants: [
			{
				disabled: false,
				size: 'sm',
				class: 'hover:scale-105'
			}
		]
	});

	t.equal(
		button({ size: 'sm', disabled: false }),
		'rounded-lg text-sm cursor-pointer hover:scale-105',
		'compound matches when disabled is false'
	);
	t.equal(
		button({ size: 'sm', disabled: true }),
		'rounded-lg text-sm opacity-50',
		'compound does not match when disabled is true'
	);
	t.equal(
		button({ size: 'lg', disabled: false }),
		'rounded-lg text-lg cursor-pointer',
		'compound does not match when size is lg'
	);

	t.end();
});

t.test('compound variant with numeric keys', (t) => {
	const heading = sv('font-bold', {
		variants: {
			level: {
				1: 'text-4xl',
				2: 'text-3xl',
				3: 'text-2xl'
			},
			intent: {
				primary: 'text-blue-500',
				danger: 'text-red-500'
			}
		},
		compoundVariants: [
			{
				level: 1,
				intent: 'primary',
				class: 'underline decoration-2'
			}
		]
	});

	t.equal(
		heading({ level: 1, intent: 'primary' }),
		'font-bold text-4xl text-blue-500 underline decoration-2',
		'compound matches level 1 + primary'
	);
	t.equal(
		heading({ level: 2, intent: 'primary' }),
		'font-bold text-3xl text-blue-500',
		'compound does not match level 2'
	);

	t.end();
});

t.test('compound variant with numeric array matching', (t) => {
	const heading = sv('font-bold', {
		variants: {
			level: {
				1: 'text-4xl',
				2: 'text-3xl',
				3: 'text-2xl'
			}
		},
		compoundVariants: [
			{
				level: [1, 2],
				class: 'tracking-tight'
			}
		]
	});

	t.equal(
		heading({ level: 1 }),
		'font-bold text-4xl tracking-tight',
		'matches level 1 in array'
	);
	t.equal(
		heading({ level: 2 }),
		'font-bold text-3xl tracking-tight',
		'matches level 2 in array'
	);
	t.equal(
		heading({ level: 3 }),
		'font-bold text-2xl',
		'does not match level 3'
	);

	t.end();
});

t.test('compound variant with no variant conditions (vacuous match)', (t) => {
	const button = sv('rounded-lg', {
		variants: {
			size: {
				sm: 'text-sm',
				lg: 'text-lg'
			}
		},
		compoundVariants: [
			{
				class: 'always-applied'
			}
		]
	});

	t.equal(
		button({ size: 'sm' }),
		'rounded-lg text-sm always-applied',
		'vacuous compound applied with sm'
	);
	t.equal(
		button({ size: 'lg' }),
		'rounded-lg text-lg always-applied',
		'vacuous compound applied with lg'
	);

	t.end();
});

t.test('compound variant matches via default variant value', (t) => {
	const button = sv('rounded-lg', {
		variants: {
			size: {
				sm: 'text-sm',
				lg: 'text-lg'
			},
			intent: {
				primary: 'bg-blue-500',
				danger: 'bg-red-500'
			}
		},
		defaultVariants: {
			size: 'sm'
		},
		compoundVariants: [
			{
				size: 'sm',
				intent: 'primary',
				class: 'uppercase'
			}
		]
	});

	t.equal(
		button({ intent: 'primary' }),
		'rounded-lg text-sm bg-blue-500 uppercase',
		'default size triggers compound match'
	);
	t.equal(
		button({ intent: 'danger' }),
		'rounded-lg text-sm bg-red-500',
		'default size does not trigger mismatched compound'
	);
	t.equal(
		button({ size: 'lg', intent: 'primary' }),
		'rounded-lg text-lg bg-blue-500',
		'explicit override prevents compound match'
	);

	t.end();
});

t.test('multiple compound variants', (t) => {
	const button = sv('rounded-lg', {
		variants: {
			size: {
				sm: 'text-sm',
				lg: 'text-lg'
			},
			intent: {
				primary: 'bg-blue-500',
				danger: 'bg-red-500'
			}
		},
		compoundVariants: [
			{
				size: 'sm',
				intent: 'primary',
				class: 'shadow-sm'
			},
			{
				size: 'lg',
				intent: 'danger',
				class: 'shadow-lg ring-2 ring-red-300'
			}
		]
	});

	t.equal(
		button({ size: 'sm', intent: 'primary' }),
		'rounded-lg text-sm bg-blue-500 shadow-sm',
		'first compound matches'
	);
	t.equal(
		button({ size: 'lg', intent: 'danger' }),
		'rounded-lg text-lg bg-red-500 shadow-lg ring-2 ring-red-300',
		'second compound matches'
	);
	t.equal(
		button({ size: 'sm', intent: 'danger' }),
		'rounded-lg text-sm bg-red-500',
		'neither compound matches'
	);

	t.end();
});

t.test('multiple compound variants matching simultaneously', (t) => {
	const button = sv('rounded-lg', {
		variants: {
			size: {
				sm: 'text-sm',
				lg: 'text-lg'
			},
			intent: {
				primary: 'bg-blue-500',
				danger: 'bg-red-500'
			}
		},
		compoundVariants: [
			{
				size: 'sm',
				class: 'font-medium'
			},
			{
				intent: 'primary',
				class: 'shadow-md'
			}
		]
	});

	t.equal(
		button({ size: 'sm', intent: 'primary' }),
		'rounded-lg text-sm bg-blue-500 font-medium shadow-md',
		'both compounds match and both classes applied'
	);
	t.equal(
		button({ size: 'sm', intent: 'danger' }),
		'rounded-lg text-sm bg-red-500 font-medium',
		'only first compound matches'
	);
	t.equal(
		button({ size: 'lg', intent: 'primary' }),
		'rounded-lg text-lg bg-blue-500 shadow-md',
		'only second compound matches'
	);

	t.end();
});

// =============================================================================
// 8. Compound Slots
// =============================================================================

t.test('compound slot applies class to multiple slots unconditionally', (t) => {
	const card = sv('relative', {
		slots: {
			header: 'font-bold',
			body: 'text-base',
			footer: 'text-sm'
		},
		compoundSlots: [
			{
				slots: ['header', 'footer'],
				class: 'px-4 py-2'
			}
		]
	});

	t.same(card(), {
		base: 'relative',
		header: 'font-bold px-4 py-2',
		body: 'text-base',
		footer: 'text-sm px-4 py-2'
	});

	t.end();
});

t.test('compound slot applies class to base and named slots', (t) => {
	const card = sv('relative', {
		slots: {
			header: 'font-bold',
			body: 'text-base'
		},
		compoundSlots: [
			{
				slots: ['base', 'header', 'body'],
				class: 'border border-gray-200'
			}
		]
	});

	t.same(card(), {
		base: 'relative border border-gray-200',
		header: 'font-bold border border-gray-200',
		body: 'text-base border border-gray-200'
	});

	t.end();
});

t.test('compound slot conditional on variant match', (t) => {
	const card = sv('rounded-lg', {
		slots: {
			header: 'font-bold',
			body: 'text-base'
		},
		variants: {
			variant: {
				outlined: 'border',
				filled: 'bg-gray-100'
			}
		},
		compoundSlots: [
			{
				variant: 'outlined',
				slots: ['base', 'header'],
				class: 'border-gray-300'
			}
		]
	});

	t.same(card({ variant: 'outlined' }), {
		base: 'rounded-lg border border-gray-300',
		header: 'font-bold border-gray-300',
		body: 'text-base'
	});
	t.same(card({ variant: 'filled' }), {
		base: 'rounded-lg bg-gray-100',
		header: 'font-bold',
		body: 'text-base'
	});

	t.end();
});

t.test('compound slot with className instead of class', (t) => {
	const nav = sv('flex', {
		slots: {
			link: 'text-sm',
			icon: 'w-4 h-4'
		},
		compoundSlots: [
			{
				slots: ['link', 'icon'],
				className: 'text-blue-500 hover:text-blue-700'
			}
		]
	});

	t.same(nav(), {
		base: 'flex',
		link: 'text-sm text-blue-500 hover:text-blue-700',
		icon: 'w-4 h-4 text-blue-500 hover:text-blue-700'
	});

	t.end();
});

t.test('compound slot with array condition matching', (t) => {
	const table = sv('w-full', {
		slots: {
			cell: 'p-2',
			header: 'font-semibold'
		},
		variants: {
			size: {
				sm: 'text-sm',
				md: 'text-base',
				lg: 'text-lg'
			}
		},
		compoundSlots: [
			{
				size: ['sm', 'md'],
				slots: ['cell', 'header'],
				class: 'px-3'
			}
		]
	});

	t.same(table({ size: 'sm' }), {
		base: 'w-full text-sm',
		cell: 'p-2 px-3',
		header: 'font-semibold px-3'
	});
	t.same(table({ size: 'md' }), {
		base: 'w-full text-base',
		cell: 'p-2 px-3',
		header: 'font-semibold px-3'
	});
	t.same(table({ size: 'lg' }), {
		base: 'w-full text-lg',
		cell: 'p-2',
		header: 'font-semibold'
	});

	t.end();
});

t.test('multiple compound slots', (t) => {
	const dialog = sv('fixed inset-0', {
		slots: {
			overlay: 'bg-black/50',
			content: 'bg-white rounded-lg',
			title: 'text-lg font-bold',
			actions: 'flex gap-2'
		},
		variants: {
			size: {
				sm: 'max-w-sm',
				lg: 'max-w-lg'
			}
		},
		compoundSlots: [
			{
				slots: ['content', 'title', 'actions'],
				class: 'px-6'
			},
			{
				size: 'sm',
				slots: ['title', 'actions'],
				class: 'text-sm'
			}
		]
	});

	t.same(dialog({ size: 'sm' }), {
		base: 'fixed inset-0 max-w-sm',
		overlay: 'bg-black/50',
		content: 'bg-white rounded-lg px-6',
		title: 'text-lg font-bold px-6 text-sm',
		actions: 'flex gap-2 px-6 text-sm'
	});
	t.same(dialog({ size: 'lg' }), {
		base: 'fixed inset-0 max-w-lg',
		overlay: 'bg-black/50',
		content: 'bg-white rounded-lg px-6',
		title: 'text-lg font-bold px-6',
		actions: 'flex gap-2 px-6'
	});

	t.end();
});

t.test('compound slot with boolean shorthand variant condition', (t) => {
	const card = sv('border rounded-lg', {
		slots: {
			header: 'font-bold',
			body: 'py-4'
		},
		variants: {
			highlighted: 'ring-2'
		},
		compoundSlots: [
			{
				highlighted: true,
				slots: ['header', 'body'],
				class: 'bg-yellow-50'
			}
		]
	});

	t.same(card({ highlighted: true }), {
		base: 'border rounded-lg ring-2',
		header: 'font-bold bg-yellow-50',
		body: 'py-4 bg-yellow-50'
	});
	t.same(card({ highlighted: false }), {
		base: 'border rounded-lg',
		header: 'font-bold',
		body: 'py-4'
	});

	t.end();
});

// =============================================================================
// sv() - class/className override
// =============================================================================

t.test('class prop appends to base without slots', (t) => {
	const button = sv('rounded-lg font-medium', {
		variants: {
			size: {
				sm: 'text-sm',
				lg: 'text-lg'
			}
		}
	});

	t.equal(
		button({ size: 'sm', class: 'mt-4 mx-auto' }),
		'rounded-lg font-medium text-sm mt-4 mx-auto',
		'class appended after variant classes'
	);

	t.end();
});

t.test('className prop appends to base without slots', (t) => {
	const button = sv('rounded-lg font-medium', {
		variants: {
			size: {
				sm: 'text-sm',
				lg: 'text-lg'
			}
		}
	});

	t.equal(
		button({ size: 'lg', className: 'mt-4 mx-auto' }),
		'rounded-lg font-medium text-lg mt-4 mx-auto',
		'className appended after variant classes'
	);

	t.end();
});

t.test('class prop with no variants', (t) => {
	const box = sv('flex items-center', {});

	t.equal(
		box({ class: 'gap-4 p-2' }),
		'flex items-center gap-4 p-2',
		'class appended to base'
	);

	t.end();
});

t.test('class prop as array in non-slot mode', (t) => {
	const button = sv('rounded-lg', {
		variants: {
			size: {
				sm: 'text-sm',
				lg: 'text-lg'
			}
		}
	});

	t.equal(
		button({ size: 'sm', class: ['mt-4', 'mx-auto'] }),
		'rounded-lg text-sm mt-4 mx-auto',
		'class array appended'
	);

	t.end();
});

t.test('class prop as ClassRecord in non-slot mode', (t) => {
	const button = sv('rounded-lg', {
		variants: {
			size: {
				sm: 'text-sm',
				lg: 'text-lg'
			}
		}
	});

	t.equal(
		button({ size: 'sm', class: { 'mt-4': true, 'mx-auto': true, hidden: false } }),
		'rounded-lg text-sm mt-4 mx-auto',
		'class record appended with truthy keys'
	);

	t.end();
});

t.test('class prop as string appends to base slot with slots', (t) => {
	const card = sv('border rounded-lg', {
		slots: {
			header: 'font-bold',
			body: 'py-4'
		}
	});

	t.same(card({ class: 'shadow-xl' }), {
		base: 'border rounded-lg shadow-xl',
		header: 'font-bold',
		body: 'py-4'
	});

	t.end();
});

t.test('class prop as slot object targets specific slots', (t) => {
	const card = sv('border rounded-lg', {
		slots: {
			header: 'font-bold',
			body: 'py-4'
		}
	});

	t.same(
		card({
			class: {
				base: 'shadow-xl',
				header: 'text-blue-700',
				body: 'min-h-24'
			}
		}),
		{
			base: 'border rounded-lg shadow-xl',
			header: 'font-bold text-blue-700',
			body: 'py-4 min-h-24'
		}
	);

	t.end();
});

t.test('className prop as slot object targets specific slots', (t) => {
	const card = sv('border rounded-lg', {
		slots: {
			header: 'font-bold',
			body: 'py-4'
		}
	});

	t.same(
		card({
			className: {
				base: 'shadow-xl',
				body: 'bg-gray-50'
			}
		}),
		{
			base: 'border rounded-lg shadow-xl',
			header: 'font-bold',
			body: 'py-4 bg-gray-50'
		}
	);

	t.end();
});

t.test('class prop with variants and slots combined', (t) => {
	const card = sv('border rounded-lg', {
		slots: {
			header: 'font-bold',
			body: 'py-4'
		},
		variants: {
			size: {
				sm: { base: 'p-2', header: 'text-sm' },
				lg: { base: 'p-6', header: 'text-xl' }
			}
		}
	});

	t.same(
		card({
			size: 'sm',
			class: { base: 'mx-auto', header: 'underline' }
		}),
		{
			base: 'border rounded-lg p-2 mx-auto',
			header: 'font-bold text-sm underline',
			body: 'py-4'
		}
	);

	t.end();
});

t.test('class prop appended after compound variants', (t) => {
	const button = sv('rounded-lg', {
		variants: {
			size: {
				sm: 'text-sm',
				lg: 'text-lg'
			},
			intent: {
				primary: 'bg-blue-500',
				danger: 'bg-red-500'
			}
		},
		compoundVariants: [
			{
				size: 'sm',
				intent: 'primary',
				class: 'shadow-sm'
			}
		]
	});

	t.equal(
		button({ size: 'sm', intent: 'primary', class: 'mt-8' }),
		'rounded-lg text-sm bg-blue-500 shadow-sm mt-8',
		'class after compound variant classes'
	);

	t.end();
});

// =============================================================================
// sv() - required variants
// =============================================================================

// --- required variant type tests ---

// required variant makes the prop non-optional
const _requiredFn = sv('rounded-lg', {
	variants: {
		size: {
			sm: 'text-sm',
			lg: 'text-lg'
		},
		intent: {
			primary: 'bg-blue-500',
			danger: 'bg-red-500'
		}
	},
	requiredVariants: ['size']
});

type RequiredProps = VariantProps<typeof _requiredFn>;

// size should be required (not optional)
type AssertRequiredSize = RequiredProps extends { size: 'sm' | 'lg' }
	? true
	: false;
const _assertRequiredSize: AssertRequiredSize = true;

// intent should remain optional
type AssertOptionalIntent = RequiredProps extends {
	intent?: 'primary' | 'danger' | undefined;
}
	? true
	: false;
const _assertOptionalIntent: AssertOptionalIntent = true;

// multiple required variants
const _multiRequiredFn = sv('rounded-lg', {
	variants: {
		size: {
			sm: 'text-sm',
			lg: 'text-lg'
		},
		intent: {
			primary: 'bg-blue-500',
			danger: 'bg-red-500'
		}
	},
	requiredVariants: ['size', 'intent']
});

type MultiRequiredProps = VariantProps<typeof _multiRequiredFn>;

type AssertMultiRequired = MultiRequiredProps extends {
	size: 'sm' | 'lg';
	intent: 'primary' | 'danger';
}
	? true
	: false;
const _assertMultiRequired: AssertMultiRequired = true;

void _requiredFn;
void _assertRequiredSize;
void _assertOptionalIntent;
void _multiRequiredFn;
void _assertMultiRequired;

t.test('required variant works when provided', (t) => {
	const button = sv('rounded-lg font-medium', {
		variants: {
			size: {
				sm: 'px-2 py-1 text-sm',
				lg: 'px-6 py-3 text-lg'
			},
			intent: {
				primary: 'bg-blue-500',
				danger: 'bg-red-500'
			}
		},
		requiredVariants: ['size']
	});

	t.equal(
		button({ size: 'sm' }),
		'rounded-lg font-medium px-2 py-1 text-sm',
		'required variant applied'
	);
	t.equal(
		button({ size: 'lg', intent: 'danger' }),
		'rounded-lg font-medium px-6 py-3 text-lg bg-red-500',
		'required + optional variant applied'
	);

	t.end();
});

t.test('required variant throws when missing at runtime', (t) => {
	const button = sv('rounded-lg', {
		variants: {
			size: {
				sm: 'text-sm',
				lg: 'text-lg'
			}
		},
		requiredVariants: ['size']
	});

	t.throws(
		// @ts-expect-error - intentionally omitting required variant
		() => button({}),
		{ message: 'Missing required variant: "size"' },
		'throws for missing required variant'
	);

	t.end();
});

t.test('required variant throws when not defined in variants', (t) => {
	t.throws(
		() =>
			sv('rounded-lg', {
				variants: {
					size: {
						sm: 'text-sm',
						lg: 'text-lg'
					}
				},
				// @ts-expect-error - intentionally referencing nonexistent variant
				requiredVariants: ['color']
			}),
		{ message: 'Required variant "color" is not defined in variants' },
		'throws at config time for undefined variant'
	);

	t.end();
});

t.test('required variant throws when it has a default', (t) => {
	t.throws(
		() =>
			sv('rounded-lg', {
				variants: {
					size: {
						sm: 'text-sm',
						lg: 'text-lg'
					}
				},
				defaultVariants: {
					size: 'sm'
				},
				requiredVariants: ['size']
			}),
		{ message: 'Required variant "size" cannot have a default value' },
		'throws at config time for variant with default'
	);

	t.end();
});

t.test('multiple required variants all enforced', (t) => {
	const button = sv('rounded-lg', {
		variants: {
			size: {
				sm: 'text-sm',
				lg: 'text-lg'
			},
			intent: {
				primary: 'bg-blue-500',
				danger: 'bg-red-500'
			}
		},
		requiredVariants: ['size', 'intent']
	});

	t.equal(
		button({ size: 'sm', intent: 'primary' }),
		'rounded-lg text-sm bg-blue-500',
		'both required variants applied'
	);

	t.throws(
		// @ts-expect-error - intentionally omitting one required variant
		() => button({ intent: 'primary' }),
		{ message: 'Missing required variant: "size"' },
		'throws when first required variant missing'
	);

	t.end();
});

t.test('required variant with slots', (t) => {
	const card = sv('border rounded-lg', {
		slots: {
			header: 'font-bold',
			body: 'py-4'
		},
		variants: {
			size: {
				sm: { base: 'p-2', header: 'text-sm' },
				lg: { base: 'p-6', header: 'text-xl' }
			}
		},
		requiredVariants: ['size']
	});

	const sm = card({ size: 'sm' });
	t.equal(sm.base, 'border rounded-lg p-2', 'required variant applied to base');
	t.equal(sm.header, 'font-bold text-sm', 'required variant applied to header');
	t.equal(sm.body, 'py-4', 'body unchanged');

	t.throws(
		// @ts-expect-error - intentionally omitting required variant
		() => card({}),
		{ message: 'Missing required variant: "size"' },
		'throws for missing required variant with slots'
	);

	t.end();
});

t.test('required boolean shorthand variant', (t) => {
	const button = sv('rounded-lg', {
		variants: {
			disabled: 'opacity-50 cursor-not-allowed'
		},
		requiredVariants: ['disabled']
	});

	t.equal(
		button({ disabled: true }),
		'rounded-lg opacity-50 cursor-not-allowed',
		'required boolean true applied'
	);
	t.equal(
		button({ disabled: false }),
		'rounded-lg',
		'required boolean false produces base only'
	);

	t.throws(
		// @ts-expect-error - intentionally omitting required variant
		() => button({}),
		{ message: 'Missing required variant: "disabled"' },
		'throws for missing required boolean variant'
	);

	t.end();
});

// =============================================================================
// sv() - conditional default variants (function-based)
// =============================================================================

t.test('function default resolves based on other props', (t) => {
	const button = sv('rounded-lg', {
		variants: {
			intent: {
				primary: 'bg-blue-500',
				danger: 'bg-red-500'
			},
			outline: {
				true: 'border-2 bg-transparent',
				false: ''
			}
		},
		defaultVariants: {
			outline: (props) => (props.intent === 'danger' ? true : false)
		}
	});

	t.equal(
		button({ intent: 'danger' }),
		'rounded-lg bg-red-500 border-2 bg-transparent',
		'danger triggers outline true default'
	);
	t.equal(
		button({ intent: 'primary' }),
		'rounded-lg bg-blue-500',
		'primary triggers outline false default'
	);

	t.end();
});

t.test('function default returns undefined to skip variant', (t) => {
	const button = sv('rounded-lg', {
		variants: {
			size: {
				sm: 'text-sm',
				lg: 'text-lg'
			},
			intent: {
				primary: 'bg-blue-500',
				danger: 'bg-red-500'
			}
		},
		defaultVariants: {
			intent: (props) => (props.size === 'sm' ? 'primary' : undefined)
		}
	});

	t.equal(
		button({ size: 'sm' }),
		'rounded-lg text-sm bg-blue-500',
		'sm gets default intent primary'
	);
	t.equal(
		button({ size: 'lg' }),
		'rounded-lg text-lg',
		'lg gets no default intent'
	);

	t.end();
});

t.test('explicit prop overrides function default', (t) => {
	const button = sv('rounded-lg', {
		variants: {
			size: {
				sm: 'text-sm',
				lg: 'text-lg'
			},
			intent: {
				primary: 'bg-blue-500',
				danger: 'bg-red-500'
			}
		},
		defaultVariants: {
			intent: () => 'primary' as const
		}
	});

	t.equal(
		button({ size: 'sm' }),
		'rounded-lg text-sm bg-blue-500',
		'function default applied'
	);
	t.equal(
		button({ size: 'sm', intent: 'danger' }),
		'rounded-lg text-sm bg-red-500',
		'explicit prop overrides function default'
	);

	t.end();
});

t.test('mixed static and function defaults', (t) => {
	const button = sv('rounded-lg', {
		variants: {
			size: {
				sm: 'text-sm',
				lg: 'text-lg'
			},
			intent: {
				primary: 'bg-blue-500',
				danger: 'bg-red-500'
			}
		},
		defaultVariants: {
			size: 'sm',
			intent: (props) => (props.size === 'lg' ? 'danger' : 'primary')
		}
	});

	t.equal(
		button(),
		'rounded-lg text-sm bg-blue-500',
		'static default sm + function default primary'
	);
	t.equal(
		button({ size: 'lg' }),
		'rounded-lg text-lg bg-red-500',
		'explicit lg + function default danger'
	);

	t.end();
});

t.test('function default variant triggering compound variant', (t) => {
	const button = sv('rounded-lg', {
		variants: {
			size: {
				sm: 'text-sm',
				lg: 'text-lg'
			},
			intent: {
				primary: 'bg-blue-500',
				danger: 'bg-red-500'
			}
		},
		defaultVariants: {
			intent: (props) => (props.size === 'sm' ? 'primary' : undefined)
		},
		compoundVariants: [
			{
				size: 'sm',
				intent: 'primary',
				class: 'uppercase'
			}
		]
	});

	t.equal(
		button({ size: 'sm' }),
		'rounded-lg text-sm bg-blue-500 uppercase',
		'function default triggers compound match'
	);
	t.equal(
		button({ size: 'lg' }),
		'rounded-lg text-lg',
		'function default returns undefined, no compound match'
	);
	t.equal(
		button({ size: 'sm', intent: 'danger' }),
		'rounded-lg text-sm bg-red-500',
		'explicit override prevents function default and compound match'
	);

	t.end();
});

// =============================================================================
// sv() - cache management
// =============================================================================

t.test('getCacheSize returns current cache size', (t) => {
	const button = sv('rounded-lg', {
		variants: {
			size: {
				sm: 'text-sm',
				lg: 'text-lg'
			}
		}
	});

	t.equal(button.getCacheSize(), 0, 'cache initially empty');

	button({ size: 'sm' });
	t.equal(button.getCacheSize(), 1, 'cache has 1 entry after first call');

	button({ size: 'sm' });
	t.equal(button.getCacheSize(), 1, 'cache unchanged for same props');

	button({ size: 'lg' });
	t.equal(button.getCacheSize(), 2, 'cache has 2 entries for different props');

	t.end();
});

t.test('clearCache empties the cache', (t) => {
	const button = sv('rounded-lg', {
		variants: {
			size: {
				sm: 'text-sm',
				lg: 'text-lg'
			}
		}
	});

	button({ size: 'sm' });
	button({ size: 'lg' });
	t.equal(button.getCacheSize(), 2, 'cache has 2 entries');

	button.clearCache();
	t.equal(button.getCacheSize(), 0, 'cache cleared');

	button({ size: 'sm' });
	t.equal(button.getCacheSize(), 1, 'cache repopulated after clear');

	t.end();
});

t.test('cacheSize config limits cache entries', (t) => {
	const button = sv(
		'rounded-lg',
		{
			variants: {
				size: {
					sm: 'text-sm',
					md: 'text-base',
					lg: 'text-lg',
					xl: 'text-xl'
				}
			},
			cacheSize: 2
		}
	);

	button({ size: 'sm' });
	button({ size: 'md' });
	t.equal(button.getCacheSize(), 2, 'cache at limit');

	button({ size: 'lg' });
	t.equal(button.getCacheSize(), 2, 'cache size stays at limit');

	t.end();
});

t.test('cacheSize 0 still produces correct results', (t) => {
	const button = sv(
		'rounded-lg',
		{
			variants: {
				size: {
					sm: 'text-sm',
					md: 'text-base',
					lg: 'text-lg'
				}
			},
			cacheSize: 0
		}
	);

	t.equal(
		button({ size: 'sm' }),
		'rounded-lg text-sm',
		'sm correct with cacheSize 0'
	);
	t.equal(
		button({ size: 'md' }),
		'rounded-lg text-base',
		'md correct with cacheSize 0'
	);
	t.equal(
		button({ size: 'lg' }),
		'rounded-lg text-lg',
		'lg correct with cacheSize 0'
	);
	t.equal(button.getCacheSize() <= 1, true, 'cache size stays at 0 or 1');

	t.end();
});

t.test('cache works with slots', (t) => {
	const card = sv('border', {
		slots: {
			header: 'font-bold',
			body: 'text-base'
		},
		variants: {
			variant: {
				default: { base: 'bg-white', header: 'text-gray-900' },
				dark: { base: 'bg-gray-900', header: 'text-white' }
			}
		}
	});

	t.equal(card.getCacheSize(), 0, 'cache empty initially');

	card({ variant: 'default' });
	t.equal(card.getCacheSize(), 1, 'cache has 1 entry');

	card({ variant: 'default' });
	t.equal(card.getCacheSize(), 1, 'cache hit for same props');

	card({ variant: 'dark' });
	t.equal(card.getCacheSize(), 2, 'cache has 2 entries');

	t.end();
});

t.test('cache skips entries when class prop is provided', (t) => {
	const button = sv('rounded-lg', {
		variants: {
			size: {
				sm: 'text-sm',
				lg: 'text-lg'
			}
		}
	});

	button({ size: 'sm' });
	t.equal(button.getCacheSize(), 1, 'normal call cached');

	button({ size: 'sm', class: 'mt-4' });
	t.equal(button.getCacheSize(), 1, 'call with class not cached');

	button({ size: 'sm', className: 'mx-auto' });
	t.equal(button.getCacheSize(), 1, 'call with className not cached');

	button({ size: 'lg' });
	t.equal(button.getCacheSize(), 2, 'different variant cached');

	t.end();
});

// =============================================================================
// sv() - postProcess
// =============================================================================

t.test('postProcess transforms output without slots', (t) => {
	const button = sv('rounded-lg font-medium', {
		variants: {
			size: {
				sm: 'px-2 py-1 text-sm',
				lg: 'px-6 py-3 text-lg'
			}
		},
		postProcess: (className) => className.toUpperCase()
	});

	t.equal(
		button({ size: 'sm' }),
		'ROUNDED-LG FONT-MEDIUM PX-2 PY-1 TEXT-SM',
		'postProcess applied to string output'
	);

	t.end();
});

t.test('postProcess transforms each slot', (t) => {
	const card = sv('relative', {
		slots: {
			header: 'font-bold text-lg',
			body: 'text-base p-4'
		},
		postProcess: (className) => `[${className}]`
	});

	t.same(card(), {
		base: '[relative]',
		header: '[font-bold text-lg]',
		body: '[text-base p-4]'
	});

	t.end();
});

t.test('postProcess can deduplicate classes', (t) => {
	const dedupeClasses = (className: string) => {
		return Array.from(new Set(className.split(' '))).join(' ');
	};

	const button = sv('flex flex items-center', {
		variants: {
			gap: {
				sm: 'gap-2 flex',
				lg: 'gap-4 flex'
			}
		},
		postProcess: dedupeClasses
	});

	t.equal(
		button({ gap: 'sm' }),
		'flex items-center gap-2',
		'duplicate classes removed'
	);

	t.end();
});

t.test('postProcess can trim classes', (t) => {
	const button = sv('  rounded-lg  font-medium  ', {
		variants: {
			size: {
				sm: '  text-sm  ',
				lg: '  text-lg  '
			}
		},
		postProcess: (className) => className.trim()
	});

	t.equal(
		button({ size: 'sm' }),
		'rounded-lg  font-medium     text-sm',
		'postProcess can trim leading/trailing whitespace'
	);

	t.end();
});

t.test('postProcess with compound variants', (t) => {
	const button = sv('rounded-lg', {
		variants: {
			size: {
				sm: 'text-sm',
				lg: 'text-lg'
			},
			intent: {
				primary: 'bg-blue-500',
				danger: 'bg-red-500'
			}
		},
		compoundVariants: [
			{
				size: 'sm',
				intent: 'primary',
				class: 'shadow-sm ring-1'
			}
		],
		postProcess: (className) => className.replace(/-/g, '_')
	});

	t.equal(
		button({ size: 'sm', intent: 'primary' }),
		'rounded_lg text_sm bg_blue_500 shadow_sm ring_1',
		'postProcess transforms compound variant classes'
	);

	t.end();
});

t.test('postProcess with slots and variants', (t) => {
	const card = sv('border', {
		slots: {
			header: 'font-bold',
			body: 'text-base'
		},
		variants: {
			variant: {
				default: { base: 'bg-white', header: 'text-gray-900' },
				dark: { base: 'bg-gray-900', header: 'text-white' }
			}
		},
		postProcess: (className) => className.split(' ').reverse().join(' ')
	});

	t.same(card({ variant: 'default' }), {
		base: 'bg-white border',
		header: 'text-gray-900 font-bold',
		body: 'text-base'
	});

	t.end();
});

t.test('postProcess with class prop', (t) => {
	const button = sv('rounded-lg', {
		variants: {
			size: {
				sm: 'text-sm',
				lg: 'text-lg'
			}
		},
		postProcess: (className) => `processed:${className}`
	});

	t.equal(
		button({ size: 'sm', class: 'mt-4' }),
		'processed:rounded-lg text-sm mt-4',
		'postProcess applied to string with class prop'
	);

	t.end();
});

// =============================================================================
// sv() - introspection
// =============================================================================

t.test('variantKeys exposes variant key names', (t) => {
	const button = sv('rounded-lg', {
		variants: {
			size: {
				sm: 'text-sm',
				lg: 'text-lg'
			},
			intent: {
				primary: 'bg-blue-500',
				danger: 'bg-red-500'
			}
		}
	});

	t.same(button.variantKeys, ['size', 'intent'], 'variant keys array');

	t.end();
});

t.test('variantKeys is empty array when no variants', (t) => {
	const box = sv('flex items-center', {});

	t.same(box.variantKeys, [], 'empty array for no variants');

	t.end();
});

t.test('variants exposes the normalized variants config', (t) => {
	const button = sv('rounded-lg', {
		variants: {
			size: {
				sm: 'text-sm',
				lg: 'text-lg'
			}
		}
	});

	t.same(
		button.variants,
		{
			size: {
				sm: 'text-sm',
				lg: 'text-lg'
			}
		},
		'variants config object'
	);

	t.end();
});

t.test('slotKeys exposes slot key names', (t) => {
	const card = sv('border', {
		slots: {
			header: 'font-bold',
			body: 'text-base',
			footer: 'text-sm'
		}
	});

	t.same(
		card.slotKeys,
		['base', 'header', 'body', 'footer'],
		'slot keys include base'
	);

	t.end();
});

t.test('slotKeys contains only base when no slots', (t) => {
	const button = sv('rounded-lg', {
		variants: {
			size: {
				sm: 'text-sm',
				lg: 'text-lg'
			}
		}
	});

	t.same(button.slotKeys, ['base'], 'only base when no slots');

	t.end();
});

t.test('slots exposes the slots config', (t) => {
	const card = sv('border', {
		slots: {
			header: 'font-bold',
			body: 'text-base'
		}
	});

	t.same(
		card.slots,
		{
			header: 'font-bold',
			body: 'text-base'
		},
		'slots config object'
	);

	t.end();
});

t.test('defaultVariants exposes default values', (t) => {
	const button = sv('rounded-lg', {
		variants: {
			size: {
				sm: 'text-sm',
				lg: 'text-lg'
			},
			intent: {
				primary: 'bg-blue-500',
				danger: 'bg-red-500'
			}
		},
		defaultVariants: {
			size: 'sm',
			intent: 'primary'
		}
	});

	t.same(
		button.defaultVariants,
		{
			size: 'sm',
			intent: 'primary'
		},
		'default variants object'
	);

	t.end();
});

t.test('defaultVariants is empty object when none provided', (t) => {
	const button = sv('rounded-lg', {
		variants: {
			size: {
				sm: 'text-sm',
				lg: 'text-lg'
			}
		}
	});

	t.same(button.defaultVariants, {}, 'empty object');

	t.end();
});

t.test('requiredVariants exposes required keys', (t) => {
	const button = sv('rounded-lg', {
		variants: {
			size: {
				sm: 'text-sm',
				lg: 'text-lg'
			},
			intent: {
				primary: 'bg-blue-500',
				danger: 'bg-red-500'
			}
		},
		requiredVariants: ['size']
	});

	t.same(button.requiredVariants, ['size'], 'required variants array');

	t.end();
});

t.test('requiredVariants is empty array when none required', (t) => {
	const button = sv('rounded-lg', {
		variants: {
			size: {
				sm: 'text-sm',
				lg: 'text-lg'
			}
		}
	});

	t.same(button.requiredVariants, [], 'empty array');

	t.end();
});

t.test('introspection with all properties combined', (t) => {
	const card = sv('rounded-lg', {
		slots: {
			header: 'font-bold',
			body: 'text-base'
		},
		variants: {
			variant: {
				default: 'bg-white',
				dark: 'bg-gray-900'
			},
			size: {
				sm: 'p-2',
				lg: 'p-6'
			}
		},
		defaultVariants: {
			variant: 'default',
			size: 'sm'
		}
	});

	t.same(card.variantKeys, ['variant', 'size'], 'has variant keys');
	t.same(
		card.slotKeys,
		['base', 'header', 'body'],
		'has slot keys with base'
	);
	t.same(
		card.variants,
		{
			variant: {
				default: 'bg-white',
				dark: 'bg-gray-900'
			},
			size: {
				sm: 'p-2',
				lg: 'p-6'
			}
		},
		'has variants config'
	);
	t.same(
		card.slots,
		{
			header: 'font-bold',
			body: 'text-base'
		},
		'has slots config'
	);
	t.same(
		card.defaultVariants,
		{
			variant: 'default',
			size: 'sm'
		},
		'has defaults'
	);
	t.same(card.requiredVariants, [], 'no required variants');

	t.end();
});

// =============================================================================
// sv() - additional type tests
// =============================================================================

// Return type is string when no slots
const _typeNoSlotsFn = sv('flex', {
	variants: {
		size: {
			sm: 'text-sm',
			lg: 'text-lg'
		}
	}
});

type NoSlotsReturn = ReturnType<typeof _typeNoSlotsFn>;
type AssertStringReturn = NoSlotsReturn extends string ? true : false;
const _assertStringReturn: AssertStringReturn = true;

void _typeNoSlotsFn;
void _assertStringReturn;

// Return type is slot record when slots exist
const _typeWithSlotsFn = sv('flex', {
	slots: {
		header: 'font-bold',
		body: 'text-base'
	}
});

type WithSlotsReturn = ReturnType<typeof _typeWithSlotsFn>;
type AssertSlotRecord = WithSlotsReturn extends {
	base: string;
	header: string;
	body: string;
}
	? true
	: false;
const _assertSlotRecord: AssertSlotRecord = true;

void _typeWithSlotsFn;
void _assertSlotRecord;

// VariantProps excludes class and className props
const _typeExcludeClassFn = sv('flex', {
	slots: {
		header: 'font-bold'
	},
	variants: {
		size: {
			sm: 'text-sm',
			lg: 'text-lg'
		}
	}
});

type ExcludeClassProps = VariantProps<typeof _typeExcludeClassFn>;
type AssertNoClassProp = 'class' extends keyof ExcludeClassProps
	? false
	: true;
type AssertNoClassNameProp = 'className' extends keyof ExcludeClassProps
	? false
	: true;
const _assertNoClassProp: AssertNoClassProp = true;
const _assertNoClassNameProp: AssertNoClassNameProp = true;

void _typeExcludeClassFn;
void _assertNoClassProp;
void _assertNoClassNameProp;

// VariantProps with required variants (non-optional)
const _typeRequiredFn = sv('flex', {
	variants: {
		size: {
			sm: 'text-sm',
			lg: 'text-lg'
		},
		intent: {
			primary: 'bg-blue-500',
			danger: 'bg-red-500'
		}
	},
	requiredVariants: ['size']
});

type RequiredTypeProps = VariantProps<typeof _typeRequiredFn>;
// size should be required (no undefined)
type AssertSizeRequired = RequiredTypeProps extends {
	size: 'sm' | 'lg';
	intent?: 'primary' | 'danger' | undefined;
}
	? true
	: false;
const _assertSizeRequired: AssertSizeRequired = true;

void _typeRequiredFn;
void _assertSizeRequired;

// VariantProps with all required variants
const _typeAllRequiredFn = sv('flex', {
	variants: {
		size: {
			sm: 'text-sm',
			lg: 'text-lg'
		},
		intent: {
			primary: 'bg-blue-500',
			danger: 'bg-red-500'
		}
	},
	requiredVariants: ['size', 'intent']
});

type AllRequiredProps = VariantProps<typeof _typeAllRequiredFn>;
type AssertAllRequired = AllRequiredProps extends {
	size: 'sm' | 'lg';
	intent: 'primary' | 'danger';
}
	? true
	: false;
const _assertAllRequired: AssertAllRequired = true;

void _typeAllRequiredFn;
void _assertAllRequired;

// ClassProp with slots accepts string or slot object
const _typeClassPropFn = sv('flex', {
	slots: {
		header: 'font-bold',
		body: 'text-base'
	},
	variants: {
		size: {
			sm: 'text-sm',
			lg: 'text-lg'
		}
	}
});

// Should accept string for class prop
const _testClassString = _typeClassPropFn({ size: 'sm', class: 'mt-4' });
void _testClassString;

// Should accept slot object for class prop
const _testClassObject = _typeClassPropFn({
	size: 'sm',
	class: { base: 'mt-4', header: 'mb-2' }
});
void _testClassObject;

// Should accept string for className prop
const _testClassNameString = _typeClassPropFn({
	size: 'lg',
	className: 'mx-auto'
});
void _testClassNameString;

// Should accept slot object for className prop
const _testClassNameObject = _typeClassPropFn({
	size: 'lg',
	className: { base: 'mx-auto', body: 'p-4' }
});
void _testClassNameObject;

// VariantProps with numeric keys
const _typeNumericKeysFn = sv('flex', {
	variants: {
		level: {
			1: 'text-4xl',
			2: 'text-3xl',
			3: 'text-2xl'
		}
	}
});

type NumericKeysProps = VariantProps<typeof _typeNumericKeysFn>;
type AssertNumericKeys = NumericKeysProps extends {
	level?: 1 | 2 | 3 | undefined;
}
	? true
	: false;
const _assertNumericKeys: AssertNumericKeys = true;

void _typeNumericKeysFn;
void _assertNumericKeys;

// VariantProps with boolean shorthand
const _typeBoolShorthandFn = sv('flex', {
	variants: {
		disabled: 'opacity-50 cursor-not-allowed'
	}
});

type BoolShorthandPropsType = VariantProps<typeof _typeBoolShorthandFn>;
type AssertBoolShorthandType = BoolShorthandPropsType extends {
	disabled?: boolean | undefined;
}
	? true
	: false;
const _assertBoolShorthandType: AssertBoolShorthandType = true;

void _typeBoolShorthandFn;
void _assertBoolShorthandType;

// Complex type: slots + variants + required + defaults
const _typeComplexFn = sv('flex', {
	slots: {
		header: 'font-bold',
		body: 'text-base',
		footer: 'text-sm'
	},
	variants: {
		size: {
			sm: { base: 'p-2', header: 'text-sm' },
			lg: { base: 'p-6', header: 'text-xl' }
		},
		variant: {
			default: { base: 'bg-white' },
			dark: { base: 'bg-gray-900' }
		}
	},
	defaultVariants: {
		variant: 'default'
	},
	requiredVariants: ['size']
});

type ComplexTypeProps = VariantProps<typeof _typeComplexFn>;
type AssertComplexType = ComplexTypeProps extends {
	size: 'sm' | 'lg';
	variant?: 'default' | 'dark' | undefined;
}
	? true
	: false;
const _assertComplexType: AssertComplexType = true;

type ComplexReturn = ReturnType<typeof _typeComplexFn>;
type AssertComplexReturn = ComplexReturn extends {
	base: string;
	header: string;
	body: string;
	footer: string;
}
	? true
	: false;
const _assertComplexReturn: AssertComplexReturn = true;

void _typeComplexFn;
void _assertComplexType;
void _assertComplexReturn;

// Empty config returns base only as string
const _typeEmptyConfigFn = sv('flex items-center', {});

type EmptyConfigReturn = ReturnType<typeof _typeEmptyConfigFn>;
type AssertEmptyConfigString = EmptyConfigReturn extends string ? true : false;
const _assertEmptyConfigString: AssertEmptyConfigString = true;

type EmptyConfigProps = VariantProps<typeof _typeEmptyConfigFn>;
type AssertEmptyConfigProps = keyof EmptyConfigProps extends never
	? true
	: false;
const _assertEmptyConfigProps: AssertEmptyConfigProps = true;

void _typeEmptyConfigFn;
void _assertEmptyConfigString;
void _assertEmptyConfigProps;

// =============================================================================
// sv() - presets
// =============================================================================

// --- preset type tests ---

const _presetFn = sv('btn', {
	variants: {
		size: {
			sm: 'text-sm',
			lg: 'text-lg'
		},
		intent: {
			primary: 'bg-blue-500',
			danger: 'bg-red-500'
		}
	},
	presets: {
		cta: { size: 'lg', intent: 'primary' },
		warning: { size: 'sm', intent: 'danger' }
	}
});

// VariantProps should NOT include 'preset'
type PresetVariantProps = VariantProps<typeof _presetFn>;

type AssertPresetExcluded = 'preset' extends keyof PresetVariantProps
	? false
	: true;
const _assertPresetExcluded: AssertPresetExcluded = true;

// preset should only accept defined preset names
type AssertPresetProp = Parameters<typeof _presetFn>[0] extends
	| { preset?: 'cta' | 'warning' | undefined }
	| undefined
	? true
	: false;
const _assertPresetProp: AssertPresetProp = true;

void _presetFn;
void _assertPresetExcluded;
void _assertPresetProp;

t.test('preset applies variant values', (t) => {
	const button = sv('btn', {
		variants: {
			size: {
				sm: 'text-sm',
				lg: 'text-lg'
			},
			intent: {
				primary: 'bg-blue-500',
				danger: 'bg-red-500'
			}
		},
		presets: {
			cta: { size: 'lg', intent: 'primary' },
			warning: { size: 'sm', intent: 'danger' }
		}
	});

	t.equal(
		button({ preset: 'cta' }),
		'btn text-lg bg-blue-500',
		'cta preset applies size and intent'
	);
	t.equal(
		button({ preset: 'warning' }),
		'btn text-sm bg-red-500',
		'warning preset applies size and intent'
	);

	t.end();
});

t.test('explicit props override preset values', (t) => {
	const button = sv('btn', {
		variants: {
			size: {
				sm: 'text-sm',
				lg: 'text-lg'
			},
			intent: {
				primary: 'bg-blue-500',
				danger: 'bg-red-500'
			}
		},
		presets: {
			cta: { size: 'lg', intent: 'primary' }
		}
	});

	t.equal(
		button({ preset: 'cta', size: 'sm' }),
		'btn text-sm bg-blue-500',
		'explicit size overrides preset size'
	);
	t.equal(
		button({ preset: 'cta', intent: 'danger' }),
		'btn text-lg bg-red-500',
		'explicit intent overrides preset intent'
	);
	t.equal(
		button({ preset: 'cta', size: 'sm', intent: 'danger' }),
		'btn text-sm bg-red-500',
		'all explicit props override preset'
	);

	t.end();
});

t.test('preset overrides default variants', (t) => {
	const button = sv('btn', {
		variants: {
			size: {
				sm: 'text-sm',
				lg: 'text-lg'
			},
			intent: {
				primary: 'bg-blue-500',
				danger: 'bg-red-500'
			}
		},
		defaultVariants: {
			size: 'sm',
			intent: 'primary'
		},
		presets: {
			large: { size: 'lg' }
		}
	});

	t.equal(
		button(),
		'btn text-sm bg-blue-500',
		'defaults applied when no preset'
	);
	t.equal(
		button({ preset: 'large' }),
		'btn text-lg bg-blue-500',
		'preset overrides size default, intent uses default'
	);

	t.end();
});

t.test('preset satisfies required variants', (t) => {
	const button = sv('btn', {
		variants: {
			size: {
				sm: 'text-sm',
				lg: 'text-lg'
			},
			intent: {
				primary: 'bg-blue-500',
				danger: 'bg-red-500'
			}
		},
		requiredVariants: ['intent'],
		presets: {
			cta: { size: 'lg', intent: 'primary' }
		}
	});

	t.equal(
		button({ preset: 'cta' }),
		'btn text-lg bg-blue-500',
		'preset provides required variant'
	);

	t.end();
});

t.test('throws for invalid preset name', (t) => {
	const button = sv('btn', {
		variants: {
			size: {
				sm: 'text-sm',
				lg: 'text-lg'
			}
		},
		presets: {
			cta: { size: 'lg' }
		}
	});

	t.throws(
		// @ts-expect-error - intentionally passing invalid preset name
		() => button({ preset: 'nonexistent' }),
		{ message: 'Invalid preset "nonexistent"' },
		'throws for unknown preset name'
	);

	t.end();
});

t.test('preset with slots', (t) => {
	const card = sv('card border', {
		slots: {
			header: 'font-bold',
			body: 'py-4'
		},
		variants: {
			size: {
				sm: { base: 'p-2', header: 'text-sm', body: 'text-sm' },
				lg: { base: 'p-6', header: 'text-lg', body: 'text-lg' }
			},
			variant: {
				outlined: { base: 'border-gray-200' },
				filled: { base: 'bg-gray-100', header: 'bg-gray-200' }
			}
		},
		presets: {
			compact: { size: 'sm', variant: 'outlined' },
			hero: { size: 'lg', variant: 'filled' }
		}
	});

	t.strictSame(
		card({ preset: 'compact' }),
		{
			base: 'card border p-2 border-gray-200',
			header: 'font-bold text-sm',
			body: 'py-4 text-sm'
		},
		'compact preset applied to slots'
	);
	t.strictSame(
		card({ preset: 'hero' }),
		{
			base: 'card border p-6 bg-gray-100',
			header: 'font-bold text-lg bg-gray-200',
			body: 'py-4 text-lg'
		},
		'hero preset applied to slots'
	);

	t.end();
});

t.test('preset with compound variants', (t) => {
	const button = sv('btn', {
		variants: {
			size: {
				sm: 'text-sm',
				lg: 'text-lg'
			},
			intent: {
				primary: 'bg-blue-500',
				danger: 'bg-red-500'
			}
		},
		compoundVariants: [
			{
				size: 'lg',
				intent: 'primary',
				class: 'uppercase font-bold'
			}
		],
		presets: {
			cta: { size: 'lg', intent: 'primary' }
		}
	});

	t.equal(
		button({ preset: 'cta' }),
		'btn text-lg bg-blue-500 uppercase font-bold',
		'preset triggers compound variant match'
	);

	t.end();
});

t.test('cache works with presets', (t) => {
	const button = sv('btn', {
		variants: {
			size: {
				sm: 'text-sm',
				lg: 'text-lg'
			}
		},
		presets: {
			small: { size: 'sm' },
			large: { size: 'lg' }
		}
	});

	t.equal(button.getCacheSize(), 0, 'cache initially empty');

	button({ preset: 'small' });
	t.equal(button.getCacheSize(), 1, 'cache has 1 entry after preset call');

	button({ preset: 'small' });
	t.equal(button.getCacheSize(), 1, 'cache hit for same preset');

	button({ preset: 'large' });
	t.equal(button.getCacheSize(), 2, 'cache has 2 entries for different presets');

	// Same resolved values should hit the same cache entry
	button({ size: 'sm' });
	t.equal(button.getCacheSize(), 2, 'explicit props matching preset share cache');

	t.end();
});

t.test('presets exposed via introspection', (t) => {
	const button = sv('btn', {
		variants: {
			size: {
				sm: 'text-sm',
				lg: 'text-lg'
			}
		},
		presets: {
			small: { size: 'sm' },
			large: { size: 'lg' }
		}
	});

	t.strictSame(
		button.presets,
		{ small: { size: 'sm' }, large: { size: 'lg' } },
		'presets config exposed'
	);

	t.end();
});

t.test('presets is empty object when none provided', (t) => {
	const button = sv('btn', {
		variants: {
			size: {
				sm: 'text-sm',
				lg: 'text-lg'
			}
		}
	});

	t.strictSame(button.presets, {}, 'empty object');

	t.end();
});