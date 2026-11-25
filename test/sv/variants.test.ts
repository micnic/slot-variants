import t from 'tap';
import { sv, type VariantProps, type VariantValue } from '../../src/index.ts';

// sv() - variants (no slots)

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
	size?: 'sm' | 'md' | 'lg' | null | undefined;
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
	size?: 'sm' | 'lg' | null | undefined;
	intent?: 'primary' | 'danger' | null | undefined;
}
	? true
	: false;
const _assertMultiVariant: AssertMultiVariant = true;

// VariantProps with exclusion should omit specified variants
type ExcludedVariantProps = VariantProps<typeof _multiVariantFn, 'intent'>;

type AssertExcludedVariant = ExcludedVariantProps extends {
	size?: 'sm' | 'lg' | null | undefined;
}
	? true
	: false;
const _assertExcludedVariant: AssertExcludedVariant = true;

type AssertIntentExcluded = 'intent' extends keyof ExcludedVariantProps
	? false
	: true;
const _assertIntentExcluded: AssertIntentExcluded = true;

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

t.test('treats an undefined variant value as no classes', (t) => {
	const button = sv('rounded-lg', {
		variants: {
			size: {
				sm: 'text-sm',
				lg: undefined
			}
		}
	});

	t.equal(
		button({ size: 'lg' }),
		'rounded-lg',
		'undefined value applies no classes'
	);

	t.equal(
		button({ size: 'sm' }),
		'rounded-lg text-sm',
		'sibling value applies'
	);

	const badge = sv('flex', {
		variants: {
			loading: undefined
		}
	});

	t.equal(
		badge({ loading: true }),
		'flex',
		'undefined boolean shorthand applies no classes'
	);

	const chip = sv('inline-flex', {
		variants: {
			active: {
				true: undefined,
				false: 'opacity-50'
			}
		}
	});

	t.equal(
		chip({ active: true }),
		'inline-flex',
		'undefined true key applies no classes'
	);

	t.equal(
		chip({ active: false }),
		'inline-flex opacity-50',
		'defined false key still applies'
	);

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
type AssertNoClassProp = 'class' extends keyof ExcludeClassProps ? false : true;
type AssertNoClassNameProp = 'className' extends keyof ExcludeClassProps
	? false
	: true;
const _assertNoClassProp: AssertNoClassProp = true;
const _assertNoClassNameProp: AssertNoClassNameProp = true;

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

// Should accept slot object for class prop
const _testClassObject = _typeClassPropFn({
	size: 'sm',
	class: { base: 'mt-4', header: 'mb-2' }
});

// Should accept string for className prop
const _testClassNameString = _typeClassPropFn({
	size: 'lg',
	className: 'mx-auto'
});

// Should accept slot object for className prop
const _testClassNameObject = _typeClassPropFn({
	size: 'lg',
	className: { base: 'mx-auto', body: 'p-4' }
});

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
	variant?: 'default' | 'dark' | null | undefined;
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

// Empty config returns base only as string
const _typeEmptyConfigFn = sv('flex items-center', { variants: {} });

type EmptyConfigReturn = ReturnType<typeof _typeEmptyConfigFn>;
type AssertEmptyConfigString = EmptyConfigReturn extends string ? true : false;
const _assertEmptyConfigString: AssertEmptyConfigString = true;

type EmptyConfigProps = VariantProps<typeof _typeEmptyConfigFn>;
type AssertEmptyConfigProps = keyof EmptyConfigProps extends never
	? true
	: false;
const _assertEmptyConfigProps: AssertEmptyConfigProps = true;

// =============================================================================
// VariantValue type
// =============================================================================

const _variantValueFn = sv('btn', {
	variants: {
		size: {
			sm: 'text-sm',
			md: 'text-base',
			lg: 'text-lg'
		},
		intent: {
			primary: 'bg-blue-500',
			danger: 'bg-red-500'
		},
		disabled: 'opacity-50',
		level: {
			1: 'text-4xl',
			2: 'text-3xl'
		}
	},
	requiredVariants: ['intent']
});

// optional variant - should not include undefined
type VVSize = VariantValue<typeof _variantValueFn, 'size'>;
type AssertVVSize = VVSize extends 'sm' | 'md' | 'lg'
	? 'sm' | 'md' | 'lg' extends VVSize
		? true
		: false
	: false;
const _assertVVSize: AssertVVSize = true;

// undefined should be excluded even though size is optional
type AssertVVSizeNoUndefined = undefined extends VVSize ? false : true;
const _assertVVSizeNoUndefined: AssertVVSizeNoUndefined = true;

// required variant - should give the plain union
type VVIntent = VariantValue<typeof _variantValueFn, 'intent'>;
type AssertVVIntent = VVIntent extends 'primary' | 'danger'
	? 'primary' | 'danger' extends VVIntent
		? true
		: false
	: false;
const _assertVVIntent: AssertVVIntent = true;

// boolean shorthand variant
type VVDisabled = VariantValue<typeof _variantValueFn, 'disabled'>;
type AssertVVDisabled = VVDisabled extends boolean
	? boolean extends VVDisabled
		? true
		: false
	: false;
const _assertVVDisabled: AssertVVDisabled = true;

// numeric variant keys
type VVLevel = VariantValue<typeof _variantValueFn, 'level'>;
type AssertVVLevel = VVLevel extends 1 | 2 | '1' | '2'
	? 1 | 2 | '1' | '2' extends VVLevel
		? true
		: false
	: false;
const _assertVVLevel: AssertVVLevel = true;