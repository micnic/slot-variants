import t from 'tap';
import { createSV, sv, type VariantProps } from '../../src/index.ts';

// createSV() - factory defaults

t.test('createSV applies default postProcess to every config call', (t) => {
	const factorySv = createSV({
		postProcess: (className) => className.toUpperCase()
	});

	const button = factorySv('btn', {
		variants: {
			size: {
				sm: 'text-sm',
				lg: 'text-lg'
			}
		}
	});

	t.equal(button({ size: 'sm' }), 'BTN TEXT-SM', 'default postProcess runs');

	t.end();
});

t.test('createSV default postProcess applies to each slot', (t) => {
	const factorySv = createSV({
		postProcess: (className) => `[${className}]`
	});

	const card = factorySv({
		slots: {
			base: 'card',
			header: 'title'
		}
	});

	const result = card();

	t.equal(result.base, '[card]', 'base slot processed');
	t.equal(result.header, '[title]', 'header slot processed');

	t.end();
});

t.test('per-call config overrides a factory default', (t) => {
	const factorySv = createSV({
		postProcess: (className) => className.toUpperCase()
	});

	const button = factorySv('btn', {
		variants: {
			size: {
				sm: 'text-sm'
			}
		},
		postProcess: (className) => `<${className}>`
	});

	t.equal(
		button({ size: 'sm' }),
		'<btn text-sm>',
		'per-call postProcess wins over factory default'
	);

	t.end();
});

t.test('per-call undefined option keeps the factory default', (t) => {
	const factorySv = createSV({
		cacheSize: 1,
		introspection: true,
		postProcess: (className) => className.toUpperCase()
	});

	const button = factorySv('btn', {
		variants: {
			size: {
				sm: 'text-sm',
				lg: 'text-lg'
			}
		},
		cacheSize: undefined,
		introspection: undefined,
		postProcess: undefined
	});

	button({ size: 'sm' });

	t.equal(button({ size: 'lg' }), 'BTN TEXT-LG', 'default postProcess runs');
	t.equal(button.getCacheSize(), 1, 'default cacheSize bounds the cache');

	const plain = sv('btn', { variants: {}, introspection: undefined });
	const plainString: string = plain();

	t.equal(plainString, 'btn', 'sv keeps returning the class string');
	t.equal(
		'variantKeys' in plain,
		false,
		'sv keeps introspection off by default'
	);

	t.end();
});

t.test('createSV forwards no-config calls to class merging', (t) => {
	const factorySv = createSV({
		postProcess: (className) => className.toUpperCase()
	});

	t.equal(
		factorySv('flex', 'items-center', { gap: true }),
		'flex items-center gap',
		'no-config call merges like cn() and skips defaults'
	);
	t.equal(factorySv(['a', ['b']]), 'a b', 'nested arrays still flatten');

	t.end();
});

t.test('createSV default base merges with per-call base args', (t) => {
	const factorySv = createSV({ base: 'box' });

	const stack = factorySv('btn', {
		variants: {
			gap: {
				sm: 'gap-1'
			}
		}
	});

	t.equal(
		stack({ gap: 'sm' }),
		'btn box gap-1',
		'positional base, default base and variant all included'
	);

	t.end();
});

t.test('createSV default introspection enables it for every component', (t) => {
	const factorySv = createSV({ introspection: true });

	const button = factorySv('btn', {
		variants: {
			size: {
				sm: 'text-sm',
				lg: 'text-lg'
			}
		}
	});

	t.same(button.variantKeys, ['size'], 'introspection surface is present');
	t.equal(typeof button.clearCache, 'function', 'clearCache exposed');

	t.end();
});

t.test('per-call introspection: false overrides factory default', (t) => {
	const factorySv = createSV({ introspection: true });

	const button = factorySv('btn', {
		variants: {
			size: {
				sm: 'text-sm'
			}
		},
		introspection: false
	});

	t.equal(
		'variantKeys' in button,
		false,
		'introspection surface is absent when disabled per call'
	);

	t.end();
});

t.test('createSV default cacheSize bounds the cache', (t) => {
	const factorySv = createSV({ cacheSize: 2, introspection: true });

	const button = factorySv('btn', {
		variants: {
			size: {
				sm: 'text-sm',
				md: 'text-base',
				lg: 'text-lg'
			}
		}
	});

	button({ size: 'sm' });
	button({ size: 'md' });
	button({ size: 'lg' });

	t.equal(button.getCacheSize(), 2, 'cache never exceeds default cacheSize');

	t.end();
});

t.test('createSV with no defaults behaves like sv', (t) => {
	const factorySv = createSV();

	t.equal(factorySv('flex', 'gap-2'), 'flex gap-2', 'string merging works');

	const button = factorySv('btn', {
		variants: {
			size: {
				sm: 'text-sm'
			}
		}
	});

	t.equal(button({ size: 'sm' }), 'btn text-sm', 'variant resolution works');

	t.end();
});

t.test('createSV default requiredVariants requires every variant', (t) => {
	const factorySv = createSV({ requiredVariants: true });

	const button = factorySv('btn', {
		variants: {
			size: {
				sm: 'text-sm'
			}
		}
	});

	t.equal(button({ size: 'sm' }), 'btn text-sm', 'required prop is applied');
	t.throws(
		// @ts-expect-error - the default makes `size` a required prop
		() => button(),
		{ message: 'Missing required variant: "size"' },
		'throws when the inherited required variant is missing'
	);

	const optional = factorySv('btn', {
		variants: {
			size: {
				sm: 'text-sm'
			}
		},
		requiredVariants: false
	});

	t.equal(optional(), 'btn', 'per-call false overrides the default');

	const partial = factorySv('btn', {
		variants: {
			size: {
				sm: 'text-sm'
			},
			tone: {
				dark: 'bg-black'
			}
		},
		requiredVariants: ['tone']
	});

	t.equal(
		partial({ tone: 'dark' }),
		'btn bg-black',
		'per-call list replaces the default'
	);

	t.end();
});

t.test('createSV default multiSlots makes every slot a function', (t) => {
	const factorySv = createSV({ multiSlots: true });

	const card = factorySv('card', {
		slots: {
			header: 'title'
		},
		variants: {
			size: {
				sm: {
					header: 'text-sm'
				}
			}
		}
	});

	const { base, header } = card();

	t.equal(base(), 'card', 'base is a slot function');
	t.equal(header({ size: 'sm' }), 'title text-sm', 'slot fn takes props');

	const box = factorySv('box', {
		variants: {
			size: {
				sm: 'p-2'
			}
		}
	});

	t.equal(box().base({ size: 'sm' }), 'box p-2', 'slotless base is a fn');

	const plain = factorySv('box', {
		variants: {
			size: {
				sm: 'p-2'
			}
		},
		multiSlots: false
	});

	const plainString: string = plain({ size: 'sm' });

	t.equal(plainString, 'box p-2', 'per-call false overrides it');

	t.end();
});

t.test('createSV defaults reject options that shape a component', (t) => {
	// @ts-expect-error - variants can't be shared through the factory
	const withVariants = createSV({ variants: { size: { sm: 'text-sm' } } });
	// @ts-expect-error - a list of names can't be checked against each call
	const withList = createSV({ requiredVariants: ['size'] });

	t.equal(typeof withVariants, 'function', 'still builds at runtime');
	t.equal(typeof withList, 'function', 'still builds at runtime');

	t.end();
});

// --- createSV type tests ---

const _factorySv = createSV({ introspection: true });

const _factoryButton = _factorySv('btn', {
	variants: {
		size: {
			sm: 'text-sm',
			lg: 'text-lg'
		}
	}
});

// A default of introspection: true surfaces the introspection API in the type
type AssertFactoryIntrospection = typeof _factoryButton extends {
	variantKeys: string[];
}
	? true
	: false;
const _assertFactoryIntrospection: AssertFactoryIntrospection = true;

// Per-call config still drives the precise variant prop types
type FactoryButtonProps = VariantProps<typeof _factoryButton>;
type AssertFactoryProps = FactoryButtonProps extends {
	size?: 'sm' | 'lg' | null | undefined;
}
	? true
	: false;
const _assertFactoryProps: AssertFactoryProps = true;

// A no-config call resolves to a plain string
const _factoryString = _factorySv('flex', 'gap-2');
type AssertFactoryString = typeof _factoryString extends string ? true : false;
const _assertFactoryString: AssertFactoryString = true;

void _factoryButton;
void _assertFactoryIntrospection;
void _assertFactoryProps;
void _factoryString;
void _assertFactoryString;

// --- multiSlots type tests ---

const _multiSlotFn = sv('border', {
	slots: {
		header: 'font-bold',
		body: 'py-4'
	},
	multiSlots: ['header']
});

type MultiSlotReturn = ReturnType<typeof _multiSlotFn>;

type AnyFunction = (...args: never[]) => unknown;

// The listed slot is a callable function, the rest stay plain strings
type AssertHeaderIsFn = MultiSlotReturn['header'] extends AnyFunction
	? true
	: false;
const _assertHeaderIsFn: AssertHeaderIsFn = true;

type AssertBaseIsString = MultiSlotReturn['base'] extends string ? true : false;
const _assertBaseIsString: AssertBaseIsString = true;

type AssertBodyIsString = MultiSlotReturn['body'] extends string ? true : false;
const _assertBodyIsString: AssertBodyIsString = true;

// The slot function returns a string
type AssertHeaderReturn =
	ReturnType<MultiSlotReturn['header']> extends string ? true : false;
const _assertHeaderReturn: AssertHeaderReturn = true;

const _multiSlotAllFn = sv('border', {
	slots: {
		header: 'font-bold'
	},
	multiSlots: true
});

type MultiSlotAllReturn = ReturnType<typeof _multiSlotAllFn>;

type AssertMultiSlotAll = MultiSlotAllReturn['base'] extends AnyFunction
	? true
	: false;
const _assertMultiSlotAll: AssertMultiSlotAll = true;

void _multiSlotFn;
void _assertHeaderIsFn;
void _assertBaseIsString;
void _assertBodyIsString;
void _assertHeaderReturn;
void _multiSlotAllFn;
void _assertMultiSlotAll;