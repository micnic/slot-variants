import t from 'tap';
import { sv, type VariantProps } from '../../src/index.ts';

// sv() - required variants

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
	intent?: 'primary' | 'danger' | null | undefined;
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

// requiredVariants: true makes every variant required
const _allRequiredFn = sv('rounded-lg', {
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
	requiredVariants: true
});

type AllRequiredBoolProps = VariantProps<typeof _allRequiredFn>;

type AssertAllRequiredBool = AllRequiredBoolProps extends {
	size: 'sm' | 'lg';
	intent: 'primary' | 'danger';
}
	? true
	: false;
const _assertAllRequiredBool: AssertAllRequiredBool = true;

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
				// @ts-expect-error - undefined required variant, runtime check
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
					// @ts-expect-error - a required variant has no default
					size: 'sm'
				},
				requiredVariants: ['size']
			}),
		{ message: 'Required variant "size" cannot have a default value' },
		'throws at config time for variant with default'
	);
	t.throws(
		() =>
			sv('rounded-lg', {
				variants: { size: { sm: 'text-sm' } },
				// @ts-expect-error - every variant is required
				defaultVariants: { size: 'sm' },
				requiredVariants: true
			}),
		{ message: 'Required variant "size" cannot have a default value' },
		'throws for requiredVariants: true too'
	);

	const button = sv('rounded-lg', {
		variants: { size: { sm: 'text-sm' }, tone: { dark: 'bg-black' } },
		defaultVariants: { tone: 'dark' },
		requiredVariants: ['size']
	});

	t.equal(
		button({ size: 'sm' }),
		'rounded-lg text-sm bg-black',
		'a variant that is not required keeps its default'
	);

	t.end();
});

t.test('requiredVariants: true makes all variants required', (t) => {
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
		requiredVariants: true
	});

	t.equal(
		button({ size: 'sm', intent: 'primary' }),
		'rounded-lg text-sm bg-blue-500',
		'all required variants applied'
	);

	t.throws(
		// @ts-expect-error - intentionally omitting a required variant
		() => button({ size: 'sm' }),
		{ message: 'Missing required variant: "intent"' },
		'throws when a required variant is missing'
	);

	t.end();
});

t.test('requiredVariants: false keeps all variants optional', (t) => {
	const button = sv('rounded-lg', {
		variants: {
			size: {
				sm: 'text-sm',
				lg: 'text-lg'
			}
		},
		requiredVariants: false
	});

	t.equal(button(), 'rounded-lg', 'works with no variants provided');

	t.end();
});

t.test('requiredVariants: true exposes all keys via introspection', (t) => {
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
		requiredVariants: true,
		introspection: true
	});

	t.same(
		button.requiredVariants,
		['size', 'intent'],
		'all variant keys are required'
	);

	t.end();
});

t.test('default variant throws when not defined in variants', (t) => {
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
					// @ts-expect-error - unknown default variant, runtime check
					color: 'primary'
				}
			}),
		{ message: 'Default variant "color" is not defined in variants' },
		'throws at config time for undefined default variant'
	);

	t.end();
});

t.test('default variant throws for invalid value at config time', (t) => {
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
					// @ts-expect-error - invalid default value, runtime check
					size: 'xl'
				}
			}),
		{ message: 'Default variant "size" has invalid value "xl"' },
		'throws at config time for invalid default variant value'
	);

	t.throws(
		() =>
			sv('rounded-lg', {
				variants: { size: { sm: 'text-sm', lg: 'text-lg' } },
				defaultVariants: {
					// @ts-expect-error - array default, runtime check
					size: ['sm']
				}
			}),
		{ message: 'Default variant "size" has invalid value "sm"' },
		'throws for a non-primitive default matching a value by string form'
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
	t.equal(
		sm.base,
		'border rounded-lg p-2',
		'required variant applied to base'
	);
	t.equal(
		sm.header,
		'font-bold text-sm',
		'required variant applied to header'
	);
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

t.test('a required variant may have its default left undefined', (t) => {
	const button = sv('btn', {
		variants: { size: { sm: 'text-sm' } },
		// @ts-expect-error - a required variant has no default
		defaultVariants: { size: undefined },
		requiredVariants: ['size']
	});

	t.throws(
		// @ts-expect-error - size is required
		() => button(),
		{ message: 'Missing required variant: "size"' },
		'still required'
	);
	t.equal(button({ size: 'sm' }), 'btn text-sm', 'passed value used');

	t.end();
});