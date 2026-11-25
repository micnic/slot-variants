import t from 'tap';
import { sv, type VariantProps } from '../../src/index.ts';

// sv() - default variants

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
	size?: 'sm' | 'md' | 'lg' | null | undefined;
	intent?: 'primary' | 'danger' | null | undefined;
}
	? true
	: false;
const _assertDefaultVariantProps: AssertDefaultVariantProps = true;

// the function can be called with no arguments when defaults exist
const _defaultCallNoArgs: string = _defaultVariantFn();
const _defaultCallEmpty: string = _defaultVariantFn({});

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

t.test('explicit null opts out of default variant resolution', (t) => {
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
		button({ size: null }),
		'rounded-lg bg-blue-500',
		'null size skips its default, other default still applies'
	);
	t.equal(
		button({ size: null, intent: null }),
		'rounded-lg',
		'null skips defaults for every nulled variant'
	);
	t.equal(
		button({ size: null, intent: 'danger' }),
		'rounded-lg bg-red-500',
		'null size skips default, explicit intent still applies'
	);

	t.end();
});

t.test('explicit null opts out of a preset value', (t) => {
	const button = sv('rounded-lg', {
		variants: {
			size: {
				sm: 'text-sm',
				lg: 'text-lg'
			}
		},
		presets: {
			compact: { size: 'sm' }
		}
	});

	t.equal(
		button({ preset: 'compact', size: null }),
		'rounded-lg',
		'null overrides the preset value for that variant'
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