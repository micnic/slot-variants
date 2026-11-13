import t from 'tap';
import { sv, type VariantProps } from '../../src/index.ts';

// sv() - presets

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

t.test('preset throws when the config declares no presets', (t) => {
	const button = sv('btn', {
		variants: { size: { sm: 'text-sm', lg: 'text-lg' } }
	});

	t.equal(button({ size: 'sm' }), 'btn text-sm', 'works without a preset');
	t.throws(
		// @ts-expect-error - a config without presets accepts no preset name
		() => button({ preset: 'cta' }),
		{ message: 'Invalid preset "cta"' },
		'throws for any preset name'
	);

	t.end();
});

t.test('preset throws when it references an unknown variant', (t) => {
	t.throws(
		() =>
			sv('btn', {
				variants: {
					size: {
						sm: 'text-sm',
						lg: 'text-lg'
					}
				},
				presets: {
					// @ts-expect-error - unknown preset variant, runtime check
					large: { sze: 'lg' }
				}
			}),
		{ message: 'Preset "large" references unknown variant "sze"' },
		'throws at config time for undefined preset variant'
	);

	t.end();
});

t.test('preset throws for invalid variant value at config time', (t) => {
	t.throws(
		() =>
			sv('btn', {
				variants: {
					size: {
						sm: 'text-sm',
						lg: 'text-lg'
					}
				},
				presets: {
					// @ts-expect-error - invalid preset value, runtime check
					large: { size: 'xl' }
				}
			}),
		{
			message: 'Preset "large" has invalid value "xl" for variant "size"'
		},
		'throws at config time for invalid preset variant value'
	);

	t.end();
});

t.test('preset throws when it shares a name with a variant', (t) => {
	t.throws(
		() =>
			sv('btn', {
				variants: {
					size: {
						sm: 'text-sm',
						lg: 'text-lg'
					}
				},
				presets: {
					// @ts-expect-error - a preset name can't be a variant name
					size: { size: 'lg' }
				}
			}),
		{
			message: 'Preset "size" cannot have the same name as a variant'
		},
		'throws at config time for a preset named after a variant'
	);

	t.end();
});

t.test('variant throws when it has a reserved name', (t) => {
	t.throws(
		() =>
			sv('btn', {
				variants: {
					// @ts-expect-error - `slots` is a compound entry key
					slots: { a: 'x' }
				}
			}),
		{ message: 'Variant name "slots" is reserved' },
		'rejects slots'
	);
	t.throws(
		() =>
			sv('btn', {
				variants: {
					// @ts-expect-error - `preset` is a prop
					preset: { a: 'x' }
				}
			}),
		{ message: 'Variant name "preset" is reserved' },
		'rejects preset'
	);
	t.throws(
		() =>
			sv('btn', {
				variants: {
					// @ts-expect-error - `class` is a prop
					class: { a: 'x' }
				}
			}),
		{ message: 'Variant name "class" is reserved' },
		'rejects class'
	);
	t.throws(
		() =>
			sv('btn', {
				variants: {
					// @ts-expect-error - `className` is a prop
					className: { a: 'x' }
				}
			}),
		{ message: 'Variant name "className" is reserved' },
		'rejects className'
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
		},
		introspection: true
	});

	t.equal(button.getCacheSize(), 0, 'cache initially empty');

	button({ preset: 'small' });
	t.equal(button.getCacheSize(), 1, 'cache has 1 entry after preset call');

	button({ preset: 'small' });
	t.equal(button.getCacheSize(), 1, 'cache hit for same preset');

	button({ preset: 'large' });
	t.equal(
		button.getCacheSize(),
		2,
		'cache has 2 entries for different presets'
	);

	// Same resolved values should hit the same cache entry
	button({ size: 'sm' });
	t.equal(
		button.getCacheSize(),
		2,
		'explicit props matching preset share cache'
	);

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
		},
		introspection: true
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
		},
		introspection: true
	});

	t.strictSame(button.presets, {}, 'empty object');

	t.end();
});

t.test('compound variant matches a preset by name', (t) => {
	const button = sv('btn', {
		variants: {
			size: { sm: 'text-sm', lg: 'text-lg' },
			intent: { primary: 'bg-blue-500', danger: 'bg-red-500' }
		},
		presets: {
			cta: { size: 'lg', intent: 'primary' }
		},
		compoundVariants: [{ preset: 'cta', class: 'uppercase' }]
	});

	t.equal(
		button({ preset: 'cta' }),
		'btn text-lg bg-blue-500 uppercase',
		'preset matcher applies its class'
	);

	t.equal(
		button({ size: 'lg', intent: 'primary' }),
		'btn text-lg bg-blue-500 uppercase',
		'explicit values matching the preset also match'
	);

	t.equal(
		button({ size: 'sm', intent: 'primary' }),
		'btn text-sm bg-blue-500',
		'partially matching values do not match'
	);

	t.end();
});

t.test('compound variant preset matcher skips undefined values', (t) => {
	const button = sv('btn', {
		variants: {
			size: { sm: 'text-sm', lg: 'text-lg' },
			intent: { primary: 'bg-blue-500', danger: 'bg-red-500' }
		},
		presets: {
			// An explicit undefined preset value is only reachable from untyped
			// input, the runtime skips it rather than matching on it
			// @ts-expect-error explicit undefined preset value
			cta: { size: 'lg', intent: undefined }
		},
		// @ts-expect-error references the preset holding the undefined value
		compoundVariants: [{ preset: 'cta', class: 'uppercase' }]
	});

	t.equal(
		button({ size: 'lg', intent: 'danger' }),
		'btn text-lg bg-red-500 uppercase',
		'undefined preset value is not a matcher'
	);

	t.end();
});

t.test('compound variant matcher key overrides its preset value', (t) => {
	const button = sv('btn', {
		variants: {
			size: { sm: 'text-sm', lg: 'text-lg' },
			intent: { primary: 'bg-blue-500', danger: 'bg-red-500' }
		},
		presets: {
			cta: { size: 'lg', intent: 'primary' }
		},
		compoundVariants: [{ preset: 'cta', size: 'sm', class: 'uppercase' }]
	});

	t.equal(
		button({ size: 'sm', intent: 'primary' }),
		'btn text-sm bg-blue-500 uppercase',
		'explicit matcher key wins over the preset value'
	);

	t.equal(
		button({ preset: 'cta' }),
		'btn text-lg bg-blue-500',
		'the preset value it overrides no longer matches'
	);

	t.end();
});

t.test('compound slot matches a preset by name', (t) => {
	const card = sv('card', {
		slots: { header: 'font-bold', body: 'py-4' },
		variants: {
			size: { sm: 'text-sm', lg: 'text-lg' },
			tone: { plain: '', loud: 'font-black' }
		},
		presets: {
			hero: { size: 'lg', tone: 'loud' }
		},
		compoundSlots: [
			{
				slots: ['header', 'body'],
				preset: 'hero',
				class: 'tracking-wide'
			}
		]
	});

	t.strictSame(
		card({ preset: 'hero' }),
		{
			base: 'card text-lg font-black',
			header: 'font-bold tracking-wide',
			body: 'py-4 tracking-wide'
		},
		'preset matcher applies its class to each listed slot'
	);

	t.end();
});

t.test('compound matcher throws for an unknown preset name', (t) => {
	t.throws(
		() =>
			sv('btn', {
				variants: {
					size: { sm: 'text-sm', lg: 'text-lg' }
				},
				presets: {
					cta: { size: 'lg' }
				},
				// @ts-expect-error unknown preset matcher not assignable
				compoundVariants: [{ preset: 'nope', class: 'uppercase' }]
			}),
		{ message: 'Compound matcher references unknown preset "nope"' },
		'throws at config time for an unknown preset matcher'
	);

	t.end();
});

t.test('compound matcher rejects a preset name without presets', (t) => {
	t.throws(
		() =>
			sv('btn', {
				variants: {
					size: { sm: 'text-sm', lg: 'text-lg' }
				},
				// @ts-expect-error preset matcher needs a presets config
				compoundVariants: [{ preset: 'cta', class: 'uppercase' }]
			}),
		{ message: 'Compound matcher references unknown preset "cta"' },
		'throws at config time when no presets are declared'
	);

	t.end();
});

t.test('config validation ignores inherited object keys', (t) => {
	const variants = { size: { sm: 'text-sm', lg: 'text-lg' } };

	t.throws(
		() =>
			sv('btn', {
				variants,
				presets: { cta: { size: 'lg' } },
				// @ts-expect-error inherited key is not a preset name
				compoundVariants: [{ preset: 'toString', class: 'uppercase' }]
			}),
		{ message: 'Compound matcher references unknown preset "toString"' },
		'an inherited preset name is unknown'
	);

	t.throws(
		() =>
			sv('btn', {
				variants,
				// @ts-expect-error inherited key is not a variant
				defaultVariants: { constructor: undefined }
			}),
		{ message: 'Default variant "constructor" is not defined in variants' },
		'an inherited default variant name is unknown'
	);

	t.throws(
		() =>
			sv('btn', {
				variants,
				// @ts-expect-error inherited key is not a variant
				compoundVariants: [{ constructor: 'sm', class: 'uppercase' }]
			}),
		{
			message: 'Compound matcher references unknown variant "constructor"'
		},
		'an inherited compound matcher key is unknown'
	);

	t.throws(
		() =>
			sv('btn', {
				variants,
				// @ts-expect-error inherited key is not a variant
				presets: { cta: { constructor: 'sm' } }
			}),
		{ message: 'Preset "cta" references unknown variant "constructor"' },
		'an inherited preset variant name is unknown'
	);

	t.end();
});

t.test('compound variant without class or className throws', (t) => {
	t.throws(
		() =>
			sv('btn', {
				variants: {
					size: { sm: 'text-sm', lg: 'text-lg' }
				},
				// @ts-expect-error class/className required on compound variant
				compoundVariants: [{ size: 'lg' }]
			}),
		/"class" or "className"/
	);

	t.end();
});

t.test('compound variant with unknown matcher throws', (t) => {
	t.throws(
		() =>
			sv('btn', {
				variants: {
					size: { sm: 'text-sm', lg: 'text-lg' }
				},
				// @ts-expect-error unknown variant matcher not assignable
				compoundVariants: [{ sze: 'lg', class: 'uppercase' }]
			}),
		{ message: 'Compound matcher references unknown variant "sze"' }
	);

	t.end();
});

t.test('compound variant with invalid matcher value throws', (t) => {
	t.throws(
		() =>
			sv('btn', {
				variants: {
					size: { sm: 'text-sm', lg: 'text-lg' }
				},
				// @ts-expect-error invalid matcher value not assignable
				compoundVariants: [{ size: 'xl', class: 'uppercase' }]
			}),
		{
			message:
				'Compound matcher for variant "size" has invalid value "xl"'
		}
	);

	t.end();
});

t.test('compound variant with invalid matcher value type throws', (t) => {
	t.throws(
		() =>
			sv('btn', {
				variants: {
					size: { sm: 'text-sm', lg: 'text-lg' }
				},
				// @ts-expect-error invalid matcher value not assignable
				compoundVariants: [{ size: { bad: true }, class: 'uppercase' }]
			}),
		{
			message:
				'Compound matcher for variant "size" has invalid value "[object Object]"'
		}
	);

	t.end();
});

t.test('compound variant with undefined matcher value throws', (t) => {
	t.throws(
		() =>
			sv('btn', {
				variants: {
					size: { sm: 'text-sm', lg: 'text-lg' }
				},
				// @ts-expect-error undefined matcher value not assignable
				compoundVariants: [{ size: undefined, class: 'uppercase' }]
			}),
		{
			message:
				'Compound matcher for variant "size" has invalid value "undefined"'
		}
	);

	t.end();
});

t.test('compound variant with invalid matcher array value type throws', (t) => {
	t.throws(
		() =>
			sv('btn', {
				variants: {
					size: { sm: 'text-sm', lg: 'text-lg' }
				},
				compoundVariants: [
					// @ts-expect-error invalid matcher value not assignable
					{ size: ['sm', { bad: true }], class: 'uppercase' }
				]
			}),
		{
			message:
				'Compound matcher for variant "size" has invalid value "[object Object]"'
		}
	);

	t.end();
});

t.test('compound variant with empty matcher array throws', (t) => {
	t.throws(
		() =>
			sv('btn', {
				variants: {
					size: { sm: 'text-sm', lg: 'text-lg' }
				},
				compoundVariants: [
					// @ts-expect-error empty matcher array not assignable
					{ size: [], class: 'uppercase' }
				]
			}),
		{
			message:
				'Compound matcher for variant "size" must list at least one value'
		}
	);

	t.end();
});

t.test('compound slot with empty matcher array throws', (t) => {
	t.throws(
		() =>
			sv('btn', {
				variants: {
					size: { sm: 'text-sm', lg: 'text-lg' }
				},
				slots: { icon: 'icon' },
				compoundSlots: [
					// @ts-expect-error empty matcher array not assignable
					{ slots: ['icon'], size: [], class: 'uppercase' }
				]
			}),
		{
			message:
				'Compound matcher for variant "size" must list at least one value'
		}
	);

	t.end();
});

t.test('compound slot without class or className throws', (t) => {
	t.throws(
		() =>
			sv('border', {
				slots: { header: 'font-bold' },
				// @ts-expect-error class/className required on compound slot
				compoundSlots: [{ slots: ['header'] }]
			}),
		/"class" or "className"/
	);

	t.end();
});

t.test('compound slot with unknown matcher throws', (t) => {
	t.throws(
		() =>
			sv('border', {
				slots: { header: 'font-bold' },
				variants: {
					size: {
						sm: { header: 'text-sm' },
						lg: { header: 'text-lg' }
					}
				},
				compoundSlots: [
					// @ts-expect-error unknown variant matcher not assignable
					{ slots: ['header'], sze: 'lg', class: 'uppercase' }
				]
			}),
		{ message: 'Compound matcher references unknown variant "sze"' }
	);

	t.end();
});

t.test('compound slot with invalid matcher array value throws', (t) => {
	t.throws(
		() =>
			sv('border', {
				slots: { header: 'font-bold' },
				variants: {
					size: {
						sm: { header: 'text-sm' },
						lg: { header: 'text-lg' }
					}
				},
				compoundSlots: [
					{
						slots: ['header'],
						// @ts-expect-error invalid matcher value not assignable
						size: ['sm', 'xl'],
						class: 'uppercase'
					}
				]
			}),
		{
			message:
				'Compound matcher for variant "size" has invalid value "xl"'
		}
	);

	t.end();
});

t.test('compound slot with empty slots array throws', (t) => {
	t.throws(
		() =>
			sv('border', {
				slots: { header: 'font-bold' },
				// @ts-expect-error empty slots tuple not assignable
				compoundSlots: [{ slots: [], class: 'ignored' }]
			}),
		/at least one slot/
	);

	t.end();
});

t.test('compound slot without a slots array throws', (t) => {
	t.throws(
		() =>
			sv('border', {
				slots: { header: 'font-bold' },
				// @ts-expect-error missing slots property
				compoundSlots: [{ class: 'ignored' }]
			}),
		{ message: 'Compound slot must define at least one slot' },
		'missing slots'
	);
	t.throws(
		() =>
			sv('border', {
				slots: { header: 'font-bold' },
				// @ts-expect-error slots must be an array
				compoundSlots: [{ slots: 'header', class: 'ignored' }]
			}),
		{ message: 'Compound slot must define at least one slot' },
		'slots given as a string'
	);

	t.end();
});

t.test('compound slot with unknown slot throws', (t) => {
	t.throws(
		() =>
			sv('border', {
				slots: { header: 'font-bold' },
				// @ts-expect-error unknown slot name not assignable
				compoundSlots: [{ slots: ['footer'], class: 'px-4' }]
			}),
		{ message: 'Compound slot references unknown slot "footer"' }
	);

	t.end();
});