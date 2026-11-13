import t from 'tap';
import { sv } from '../../src/index.ts';

// sv() - conditional default variants (function-based)

const createFunctionDefaultIntentButton = (withCompoundVariant = false) =>
	sv('rounded-lg', {
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
		...(withCompoundVariant
			? {
					compoundVariants: [
						{
							size: 'sm',
							intent: 'primary',
							class: 'uppercase'
						}
					]
				}
			: {})
	});

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

t.test('function default reads a passed preset like props', (t) => {
	const seen: ('sm' | 'lg' | null | undefined)[] = [];

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
			big: { size: 'lg' }
		},
		defaultVariants: {
			intent: (props) => {
				seen.push(props.size);

				if (props.size === 'lg') {
					return 'danger';
				}

				return 'primary';
			}
		}
	});

	t.equal(
		button({ preset: 'big' }),
		button({ size: 'lg' }),
		'a preset reads the same as passing its values'
	);
	t.equal(
		button({ preset: 'big', size: undefined }),
		'btn text-lg bg-red-500',
		'an undefined prop takes the preset value'
	);
	t.equal(
		button({ preset: 'big', size: 'sm' }),
		'btn text-sm bg-blue-500',
		'an explicit prop wins over the preset'
	);
	t.equal(
		button({ preset: 'big', size: null }),
		'btn bg-blue-500',
		'a null prop skips the preset value'
	);
	t.equal(button(), 'btn bg-blue-500', 'no preset passes the props as-is');
	t.same(
		seen,
		['lg', 'lg', 'lg', 'sm', null, undefined],
		'the default sees the preset-filled size'
	);

	t.end();
});

t.test('function defaults share the preset-filled props', (t) => {
	const seen: object[] = [];

	const button = sv('btn', {
		variants: {
			size: {
				sm: 'text-sm',
				lg: 'text-lg'
			},
			intent: {
				primary: 'bg-blue-500',
				danger: 'bg-red-500'
			},
			outline: 'border'
		},
		presets: {
			big: { size: 'lg' }
		},
		defaultVariants: {
			intent: (props) => {
				seen.push(props);

				if (props.size === 'lg') {
					return 'danger';
				}

				return 'primary';
			},
			outline: (props) => {
				seen.push(props);

				return props.size === 'lg';
			}
		}
	});

	t.equal(
		button({ preset: 'big' }),
		'btn text-lg bg-red-500 border',
		'both defaults read the preset value'
	);
	t.equal(seen.length, 2, 'both defaults ran');
	t.equal(seen[0], seen[1], 'the defaults share one props object');
	t.equal(
		button({ preset: 'big', intent: 'primary', outline: false }),
		'btn text-lg bg-blue-500',
		'passed props skip the function defaults'
	);
	t.equal(seen.length, 2, 'no default ran');

	t.end();
});

t.test('function default props are typed from the config', (t) => {
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
			big: { size: 'lg' }
		},
		defaultVariants: {
			intent: (props) => {
				// @ts-expect-error - `color` is not a variant
				t.equal(props.color, undefined, 'unknown props are not typed');

				// @ts-expect-error - 'xl' is not a `size` value
				if (props.size === 'xl') {
					return 'primary';
				}

				if (props.preset === 'big') {
					return 'danger';
				}

				return undefined;
			}
		}
	});

	t.equal(button({ preset: 'big' }), 'btn text-lg bg-red-500');
	t.equal(button(), 'btn');

	t.end();
});

t.test('function default is evaluated once per call', (t) => {
	let calls = 0;

	const button = sv('rounded-lg', {
		variants: {
			size: {
				sm: 'text-sm',
				lg: 'text-lg'
			}
		},
		defaultVariants: {
			size: () => {
				calls++;

				return 'sm' as const;
			}
		}
	});

	t.equal(button(), 'rounded-lg text-sm', 'function default applied');
	t.equal(calls, 1, 'evaluated once while computing an uncached result');

	t.equal(button(), 'rounded-lg text-sm', 'cached result matches');
	t.equal(calls, 2, 'evaluated once more while reading a cached result');

	t.end();
});

t.test('function default returns undefined to skip variant', (t) => {
	const button = createFunctionDefaultIntentButton();

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
	const button = createFunctionDefaultIntentButton(true);

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