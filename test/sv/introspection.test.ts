import t from 'tap';
import { sv } from '../../src/index.ts';

// sv() - introspection

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
		},
		introspection: true
	});

	t.same(button.variantKeys, ['size', 'intent'], 'variant keys array');

	t.end();
});

t.test('variantKeys is empty array when no variants', (t) => {
	const box = sv('flex items-center', { variants: {}, introspection: true });

	t.same(box.variantKeys, [], 'empty array for no variants');

	t.end();
});

t.test('variants exposes the original variants config', (t) => {
	const button = sv('rounded-lg', {
		variants: {
			size: {
				sm: 'text-sm',
				lg: 'text-lg'
			}
		},
		introspection: true
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

t.test('variants preserves boolean shorthand in introspection', (t) => {
	const button = sv('btn', {
		variants: {
			disabled: 'opacity-50'
		},
		introspection: true
	});

	t.same(
		button.variants,
		{ disabled: 'opacity-50' },
		'shorthand value is exposed as written, not as the normalized {true,false} record'
	);

	t.end();
});

t.test('slotKeys exposes slot key names', (t) => {
	const card = sv('border', {
		slots: {
			header: 'font-bold',
			body: 'text-base',
			footer: 'text-sm'
		},
		introspection: true
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
		},
		introspection: true
	});

	t.same(button.slotKeys, ['base'], 'only base when no slots');

	t.end();
});

t.test('slots exposes the slots config', (t) => {
	const card = sv('border', {
		slots: {
			header: 'font-bold',
			body: 'text-base'
		},
		introspection: true
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
		},
		introspection: true
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
		},
		introspection: true
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
		requiredVariants: ['size'],
		introspection: true
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
		},
		introspection: true
	});

	t.same(button.requiredVariants, [], 'empty array');

	t.end();
});

t.test('base merges base args, base field and slots.base', (t) => {
	const card = sv('border', ['rounded-lg'], {
		base: 'shadow',
		slots: {
			base: 'p-4',
			header: 'font-bold'
		},
		introspection: true
	});

	t.equal(card.base, 'border rounded-lg shadow p-4', 'merged base classes');

	t.end();
});

t.test('base is empty string when no base classes', (t) => {
	const box = sv({
		variants: {
			size: { sm: 'text-sm' }
		},
		introspection: true
	});

	t.equal(box.base, '', 'empty base');

	t.end();
});

t.test('base is not post-processed', (t) => {
	const button = sv('btn', {
		variants: {},
		postProcess: (className) => className.toUpperCase(),
		introspection: true
	});

	t.equal(button.base, 'btn', 'raw base classes');
	t.equal(button(), 'BTN', 'call result still post-processed');

	t.end();
});

t.test('compoundVariants exposes the compoundVariants config', (t) => {
	const compoundVariants = [
		{ intent: 'primary', size: 'lg', class: 'uppercase' },
		{ intent: ['primary', 'danger'], className: 'font-bold' }
	] as const;

	const button = sv('btn', {
		variants: {
			intent: { primary: 'bg-blue-500', danger: 'bg-red-500' },
			size: { sm: 'text-sm', lg: 'text-lg' }
		},
		compoundVariants,
		introspection: true
	});

	t.equal(
		button.compoundVariants,
		compoundVariants,
		'same array as passed in'
	);

	t.end();
});

t.test('compoundSlots exposes the compoundSlots config', (t) => {
	const compoundSlots = [
		{ slots: ['header', 'body'], class: 'px-6' },
		{ size: 'sm', slots: ['body'], class: 'text-sm' }
	] as const;

	const card = sv('border', {
		slots: {
			header: 'font-bold',
			body: 'py-4'
		},
		variants: {
			size: { sm: 'p-2', lg: 'p-6' }
		},
		compoundSlots,
		introspection: true
	});

	t.equal(card.compoundSlots, compoundSlots, 'same array as passed in');

	t.end();
});

t.test('compound fields are empty arrays when not configured', (t) => {
	const button = sv('btn', {
		variants: {
			size: { sm: 'text-sm' }
		},
		introspection: true
	});

	t.same(button.compoundVariants, [], 'no compound variants');
	t.same(button.compoundSlots, [], 'no compound slots');

	t.end();
});

t.test(
	'getVariantValues returns empty array for unknown key (TS bypassed)',
	(t) => {
		const button = sv('btn', {
			variants: {
				size: { sm: 'text-sm', lg: 'text-lg' }
			},
			introspection: true
		});

		t.same(
			// @ts-expect-error - invalid key to test the runtime fallback
			button.getVariantValues('unknown'),
			[],
			'returns empty array for key not in variants'
		);

		t.end();
	}
);

t.test('getVariantValues returns string values for a string variant', (t) => {
	const button = sv('btn', {
		variants: {
			size: {
				sm: 'text-sm',
				md: 'text-md',
				lg: 'text-lg'
			}
		},
		introspection: true
	});

	t.same(
		button.getVariantValues('size'),
		['sm', 'md', 'lg'],
		'string values'
	);

	t.end();
});

t.test(
	'getVariantValues returns booleans for boolean shorthand variant',
	(t) => {
		const button = sv('btn', {
			variants: {
				disabled: 'opacity-50'
			},
			introspection: true
		});

		t.same(
			button.getVariantValues('disabled'),
			[false, true],
			'boolean shorthand returns [false, true]'
		);

		t.end();
	}
);

t.test(
	'getVariantValues returns booleans for true/false record variant',
	(t) => {
		const button = sv('btn', {
			variants: {
				disabled: {
					true: 'opacity-50',
					false: 'opacity-100'
				}
			},
			introspection: true
		});

		t.same(
			button.getVariantValues('disabled'),
			[true, false],
			'true/false record returns booleans in definition order'
		);

		t.end();
	}
);

t.test('getVariantValues preserves empty-string variant value keys', (t) => {
	const example = sv('x', {
		variants: {
			tone: { '': 'tone-default', loud: 'tone-loud' }
		},
		introspection: true
	});

	t.same(
		example.getVariantValues('tone'),
		['', 'loud'],
		'empty-string key preserved as string, not coerced to 0'
	);

	t.end();
});

t.test('getVariantValues returns numbers for numeric variant', (t) => {
	const grid = sv('grid', {
		variants: {
			cols: {
				1: 'grid-cols-1',
				2: 'grid-cols-2',
				3: 'grid-cols-3'
			}
		},
		introspection: true
	});

	t.same(grid.getVariantValues('cols'), [1, 2, 3], 'numeric values');

	t.end();
});

t.test('getVariantValues returns values the variant function accepts', (t) => {
	const example = sv('x', {
		variants: {
			tone: {
				1e3: 'thousand',
				[-2]: 'negative',
				1.5: 'fraction',
				'1e3': 'exponent',
				'07': 'padded',
				'0x10': 'hex',
				' ': 'blank',
				Infinity: 'infinity',
				NaN: 'nan'
			}
		},
		introspection: true
	});

	const values = example.getVariantValues('tone');

	t.same(
		values,
		[1000, -2, 1.5, '1e3', '07', '0x10', ' ', 'Infinity', 'NaN'],
		'only canonical finite number keys become numbers'
	);

	t.same(
		values.map((tone) => example({ tone })),
		[
			'x thousand',
			'x negative',
			'x fraction',
			'x exponent',
			'x padded',
			'x hex',
			'x blank',
			'x infinity',
			'x nan'
		],
		'every returned value round-trips through the variant function'
	);

	t.end();
});

t.test(
	'getVariantValues works for each key in a multi-variant component',
	(t) => {
		const button = sv('btn', {
			variants: {
				size: { sm: 'text-sm', lg: 'text-lg' },
				intent: { primary: 'bg-blue-500', danger: 'bg-red-500' }
			},
			introspection: true
		});

		t.same(button.getVariantValues('size'), ['sm', 'lg'], 'size values');
		t.same(
			button.getVariantValues('intent'),
			['primary', 'danger'],
			'intent values'
		);

		t.end();
	}
);

t.test('getVariantValues works when slots are defined', (t) => {
	const card = sv('border', {
		slots: {
			header: 'font-bold'
		},
		variants: {
			size: { sm: 'p-2', lg: 'p-6' }
		},
		introspection: true
	});

	t.same(
		card.getVariantValues('size'),
		['sm', 'lg'],
		'string values with slots'
	);

	t.end();
});

t.test('getMaxEntries returns 1 when there are no variants', (t) => {
	const box = sv('flex', { variants: {}, introspection: true });

	t.equal(box.getMaxEntries(), 1, 'single empty combination');

	t.end();
});

t.test('getMaxEntries multiplies (values + 1) for plain variants', (t) => {
	const button = sv('btn', {
		variants: {
			size: { sm: 'text-sm', md: 'text-base', lg: 'text-lg' },
			intent: { primary: 'bg-blue-500', danger: 'bg-red-500' }
		},
		introspection: true
	});

	// size: 3 + 1, intent: 2 + 1
	t.equal(button.getMaxEntries(), 12, '(3 + 1) * (2 + 1)');

	t.end();
});

t.test('getMaxEntries matches the README four-variant example', (t) => {
	const button = sv('btn', {
		variants: {
			a: { x: 'a-x', y: 'a-y', z: 'a-z' },
			b: { x: 'b-x', y: 'b-y', z: 'b-z' },
			c: { x: 'c-x', y: 'c-y', z: 'c-z' },
			d: { x: 'd-x', y: 'd-y', z: 'd-z' }
		},
		introspection: true
	});

	t.equal(button.getMaxEntries(), 256, '(3 + 1) ** 4');

	t.end();
});

t.test('getMaxEntries keeps the unset state for a static default', (t) => {
	const button = sv('btn', {
		variants: {
			size: { sm: 'text-sm', md: 'text-base', lg: 'text-lg' },
			intent: { primary: 'bg-blue-500', danger: 'bg-red-500' }
		},
		defaultVariants: { size: 'md' },
		introspection: true
	});

	// `null` skips the default, so size can still be left unset
	t.equal(button.getMaxEntries(), 12, '(3 + 1) * (2 + 1)');

	for (const size of ['sm', 'md', 'lg', null] as const) {
		for (const intent of ['primary', 'danger', undefined] as const) {
			button({ size, intent });
		}
	}

	t.equal(
		button.getCacheSize(),
		button.getMaxEntries(),
		'every reachable combination fits the count'
	);

	t.end();
});

t.test('getMaxEntries keeps the unset state for a function default', (t) => {
	const button = sv('btn', {
		variants: {
			size: { sm: 'text-sm', md: 'text-base', lg: 'text-lg' },
			intent: { primary: 'bg-blue-500', danger: 'bg-red-500' }
		},
		defaultVariants: {
			size: (props) => (props.intent === 'danger' ? 'lg' : undefined)
		},
		introspection: true
	});

	// function default may return undefined: size still 3 + 1
	t.equal(button.getMaxEntries(), 12, '(3 + 1) * (2 + 1)');

	t.end();
});

t.test('getMaxEntries drops the unset state for a required variant', (t) => {
	const button = sv('btn', {
		variants: {
			size: { sm: 'text-sm', md: 'text-base', lg: 'text-lg' },
			intent: { primary: 'bg-blue-500', danger: 'bg-red-500' }
		},
		requiredVariants: ['intent'],
		introspection: true
	});

	// intent required: 2, size: 3 + 1
	t.equal(button.getMaxEntries(), 8, '(3 + 1) * 2');

	t.end();
});

t.test(
	'getMaxEntries with requiredVariants: true drops every unset state',
	(t) => {
		const button = sv('btn', {
			variants: {
				size: { sm: 'text-sm', md: 'text-base', lg: 'text-lg' },
				intent: { primary: 'bg-blue-500', danger: 'bg-red-500' }
			},
			requiredVariants: true,
			introspection: true
		});

		t.equal(button.getMaxEntries(), 6, '3 * 2');

		t.end();
	}
);

t.test('getMaxEntries counts boolean variants as two values', (t) => {
	const input = sv('input', {
		variants: {
			disabled: 'opacity-50',
			error: { true: 'border-red-500', false: 'border-gray-300' }
		},
		introspection: true
	});

	t.equal(input.getMaxEntries(), 9, '(2 + 1) * (2 + 1)');

	t.end();
});

t.test('getMaxEntries bounds the actual cache size', (t) => {
	const button = sv('btn', {
		variants: {
			size: { sm: 'text-sm', lg: 'text-lg' },
			intent: { primary: 'bg-blue-500', danger: 'bg-red-500' }
		},
		introspection: true
	});

	const max = button.getMaxEntries();

	t.equal(max, 9, '(2 + 1) * (2 + 1)');

	button();
	button({ size: 'sm' });
	button({ size: 'lg' });
	button({ intent: 'primary' });
	button({ intent: 'danger' });
	button({ size: 'sm', intent: 'primary' });
	button({ size: 'sm', intent: 'danger' });
	button({ size: 'lg', intent: 'primary' });
	button({ size: 'lg', intent: 'danger' });

	t.equal(
		button.getCacheSize(),
		max,
		'every combination cached, none beyond max'
	);

	t.end();
});

t.test('getMaxEntries returns the same count on repeated calls', (t) => {
	const button = sv('btn', {
		variants: {
			size: { sm: 'text-sm', lg: 'text-lg' }
		},
		introspection: true
	});

	t.equal(button.getMaxEntries(), 3, 'first call');
	t.equal(button.getMaxEntries(), 3, 'second call');

	t.end();
});

t.test('splitProps separates declared variant props from the rest', (t) => {
	const button = sv('btn', {
		variants: {
			size: { sm: 'text-sm', lg: 'text-lg' },
			intent: { primary: 'bg-blue-500', danger: 'bg-red-500' }
		},
		introspection: true
	});

	const [variantProps, rest] = button.splitProps({
		size: 'lg',
		intent: 'danger',
		id: 'submit',
		disabled: true
	});

	t.same(
		variantProps,
		{ size: 'lg', intent: 'danger' },
		'declared variant props'
	);
	t.same(rest, { id: 'submit', disabled: true }, 'everything else');

	t.end();
});

t.test(
	'splitProps keeps class, className and preset on the variant side',
	(t) => {
		const button = sv('btn', {
			variants: {
				size: { sm: 'text-sm', lg: 'text-lg' }
			},
			presets: {
				cta: { size: 'lg' }
			},
			introspection: true
		});

		const [variantProps, rest] = button.splitProps({
			preset: 'cta',
			class: 'mt-2',
			className: 'mb-2',
			id: 'submit'
		});

		t.same(
			variantProps,
			{ preset: 'cta', class: 'mt-2', className: 'mb-2' },
			'reserved props stay with the variant props'
		);
		t.same(rest, { id: 'submit' }, 'reserved props are not forwarded');

		t.end();
	}
);

t.test('splitProps output feeds back into the variant function', (t) => {
	const button = sv('btn', {
		variants: {
			size: { sm: 'text-sm', lg: 'text-lg' }
		},
		introspection: true
	});

	const [variantProps] = button.splitProps({
		size: 'lg',
		class: 'mt-2',
		id: 'submit'
	});

	t.equal(button(variantProps), 'btn text-lg mt-2', 'round trip');

	t.end();
});

t.test(
	'splitProps sends everything to the rest when no variants exist',
	(t) => {
		const box = sv('flex', { variants: {}, introspection: true });

		const [variantProps, rest] = box.splitProps({
			id: 'box',
			role: 'group'
		});

		t.same(variantProps, {}, 'no variant props');
		t.same(rest, { id: 'box', role: 'group' }, 'all props forwarded');

		t.end();
	}
);

t.test('splitProps omits variant keys absent from the input', (t) => {
	const button = sv('btn', {
		variants: {
			size: { sm: 'text-sm', lg: 'text-lg' },
			intent: { primary: 'bg-blue-500' }
		},
		introspection: true
	});

	const [variantProps, rest] = button.splitProps({ size: 'sm' });

	t.same(variantProps, { size: 'sm' }, 'only the props that were passed');
	t.same(rest, {}, 'nothing left over');

	t.end();
});

t.test('splitProps keeps null and undefined variant values', (t) => {
	const button = sv('btn', {
		variants: {
			size: { sm: 'text-sm', lg: 'text-lg' }
		},
		defaultVariants: { size: 'sm' },
		introspection: true
	});

	const [variantProps, rest] = button.splitProps({
		size: null,
		title: undefined
	});

	t.same(variantProps, { size: null }, 'null opt-out stays a variant prop');
	t.same(rest, { title: undefined }, 'undefined rest prop is preserved');
	t.equal(button(variantProps), 'btn', 'null still opts out of the default');

	t.end();
});

t.test('splitProps splits props for a slotted component', (t) => {
	const card = sv('border', {
		slots: { header: 'font-bold' },
		variants: {
			size: { sm: 'p-2', lg: 'p-6' }
		},
		introspection: true
	});

	const [variantProps, rest] = card.splitProps({ size: 'lg', id: 'card' });

	t.same(variantProps, { size: 'lg' }, 'variant props');
	t.same(rest, { id: 'card' }, 'rest props');
	t.equal(card(variantProps).base, 'border p-6', 'result still computed');

	t.end();
});

// --- splitProps type tests ---

const _spFn = sv('btn', {
	variants: {
		size: { sm: 'text-sm', lg: 'text-lg' }
	},
	introspection: true
});

type SpButtonProps = {
	size?: 'sm' | 'lg' | undefined;
	class?: string | undefined;
	id: string;
	onClick: () => void;
};

const _spProps: SpButtonProps = {
	size: 'lg',
	class: 'mt-2',
	id: 'submit',
	onClick: () => undefined
};

const [_spVariantProps, _spRest] = _spFn.splitProps(_spProps);

// Variant keys keep their declared types on the variant side
type AssertSpVariantSize = (typeof _spVariantProps)['size'] extends
	| 'sm'
	| 'lg'
	| undefined
	? true
	: false;
const _assertSpVariantSize: AssertSpVariantSize = true;

// The reserved class prop stays on the variant side
type AssertSpVariantClass = 'class' extends keyof typeof _spVariantProps
	? true
	: false;
const _assertSpVariantClass: AssertSpVariantClass = true;

// Variant keys are gone from the rest side
type AssertSpRestHasNoSize = 'size' extends keyof typeof _spRest ? true : false;
const _assertSpRestHasNoSize: AssertSpRestHasNoSize = false;

type AssertSpRestHasNoClass = 'class' extends keyof typeof _spRest
	? true
	: false;
const _assertSpRestHasNoClass: AssertSpRestHasNoClass = false;

// Unrelated props keep their own types on the rest side
type AssertSpRestOnClick = (typeof _spRest)['onClick'] extends () => void
	? true
	: false;
const _assertSpRestOnClick: AssertSpRestOnClick = true;

type AssertSpRestId = (typeof _spRest)['id'] extends string ? true : false;
const _assertSpRestId: AssertSpRestId = true;

// An interface, which has no implicit index signature, is accepted too
interface SpInterfaceProps {
	size?: 'sm' | 'lg' | undefined;
	id: string;
}

const _spInterfaceProps: SpInterfaceProps = { size: 'sm', id: 'submit' };

const [_spInterfaceVariantProps, _spInterfaceRest] =
	_spFn.splitProps(_spInterfaceProps);

// The variant half is accepted by the variant function
_spFn(_spVariantProps);

// --- getVariantValues type tests ---

const _gvvFn = sv('btn', {
	variants: {
		size: { sm: 'text-sm', lg: 'text-lg' },
		disabled: 'opacity-50',
		cols: { 1: 'grid-cols-1', 2: 'grid-cols-2' }
	},
	introspection: true
});

// String variant → ('sm' | 'lg')[]
const _gvvSizeValues = _gvvFn.getVariantValues('size');
type AssertGvvSizeValues = typeof _gvvSizeValues extends ('sm' | 'lg')[]
	? true
	: false;
const _assertGvvSizeValues: AssertGvvSizeValues = true;

// Boolean shorthand variant → boolean[]
const _gvvDisabledValues = _gvvFn.getVariantValues('disabled');
type AssertGvvDisabledValues = typeof _gvvDisabledValues extends boolean[]
	? true
	: false;
const _assertGvvDisabledValues: AssertGvvDisabledValues = true;

// Numeric variant → (1 | 2)[]
const _gvvColsValues = _gvvFn.getVariantValues('cols');
type AssertGvvColsValues = typeof _gvvColsValues extends (1 | 2)[]
	? true
	: false;
const _assertGvvColsValues: AssertGvvColsValues = true;

// getMaxEntries → number
const _gvvMaxEntries = _gvvFn.getMaxEntries();
type AssertGvvMaxEntries = typeof _gvvMaxEntries extends number ? true : false;
const _assertGvvMaxEntries: AssertGvvMaxEntries = true;

// --- base and compound type tests ---

const _cmpFn = sv('btn', {
	slots: {
		icon: 'size-4'
	},
	variants: {
		size: { sm: 'text-sm', lg: 'text-lg' }
	},
	compoundVariants: [{ size: 'lg', class: 'uppercase' }],
	compoundSlots: [{ size: 'sm', slots: ['icon'], class: 'size-3' }],
	introspection: true
});

type AssertCmpBase = typeof _cmpFn.base extends string ? true : false;
const _assertCmpBase: AssertCmpBase = true;

// Entries keep the config's variant value types
type CmpVariantSize = (typeof _cmpFn.compoundVariants)[number]['size'];
type AssertCmpVariantSize = 'lg' extends CmpVariantSize ? true : false;
const _assertCmpVariantSize: AssertCmpVariantSize = true;

type AssertCmpVariantSizeNarrow = 'xl' extends CmpVariantSize ? true : false;
const _assertCmpVariantSizeNarrow: AssertCmpVariantSizeNarrow = false;

type CmpSlotTargets = (typeof _cmpFn.compoundSlots)[number]['slots'][number];
type AssertCmpSlotTargets = 'icon' extends CmpSlotTargets ? true : false;
const _assertCmpSlotTargets: AssertCmpSlotTargets = true;