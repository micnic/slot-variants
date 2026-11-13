import t from 'tap';
import { sv, type ClassValue, type VariantProps } from '../../src/index.ts';

// sv() - base only (no config)

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

t.test('variadic args like cn()', (t) => {
	t.equal(
		sv('flex', 'items-center', 'gap-2'),
		'flex items-center gap-2',
		'multiple string args'
	);
	t.equal(
		sv('flex', ['items-center', 'gap-2']),
		'flex items-center gap-2',
		'string and array args'
	);
	t.equal(
		sv('flex', { hidden: false, 'items-center': true }, 'gap-2'),
		'flex items-center gap-2',
		'mixed variadic args'
	);

	t.end();
});

t.test('config keys holding non-config values stay class records', (t) => {
	const base: ClassValue = { base: true };

	t.equal(sv('btn', base), 'btn base', 'boolean "base" is a class name');

	const slots: ClassValue = { slots: true, groups: false };

	t.equal(sv(slots), 'slots', 'boolean "slots" and "groups" are class names');

	const variants: ClassValue = { variants: true };

	t.equal(sv(variants), 'variants', 'boolean "variants" is a class name');

	const variantsArray: ClassValue = { variants: ['a'] };

	t.equal(sv(variantsArray), 'variants', 'array "variants" is a class name');

	const compound: ClassValue = { compoundVariants: true };

	t.equal(
		sv(compound),
		'compoundVariants',
		'boolean "compoundVariants" is a class name'
	);

	const multi: ClassValue = { multiSlots: 'header' };

	t.equal(sv(multi), 'multiSlots', 'string "multiSlots" is a class name');

	const cacheSize: ClassValue = { cacheSize: true };

	t.equal(sv(cacheSize), 'cacheSize', 'boolean "cacheSize" is a class name');

	const introspection: ClassValue = { introspection: 'yes' };

	t.equal(
		sv(introspection),
		'introspection',
		'string "introspection" is a class name'
	);

	const postProcess: ClassValue = { postProcess: true };

	t.equal(
		sv(postProcess),
		'postProcess',
		'boolean "postProcess" is a class name'
	);

	t.end();
});

t.test(
	'config values of the right shape still build a variant function',
	(t) => {
		const stringBase = sv({ base: 'btn' });

		t.equal(stringBase(), 'btn', 'string base');

		const arrayBase = sv({ base: ['btn', 'px-2'] });

		t.equal(arrayBase(), 'btn px-2', 'array base');

		const undefinedBase = sv({
			base: undefined,
			variants: { size: { sm: 'text-sm' } }
		});

		t.equal(
			undefinedBase({ size: 'sm' }),
			'text-sm',
			'explicit undefined base'
		);

		const numberCacheSize = sv({ base: 'btn', cacheSize: 0 });

		t.equal(numberCacheSize(), 'btn', 'numeric cacheSize');

		const functionPostProcess = sv({
			base: 'btn',
			postProcess: (className) => className.toUpperCase()
		});

		t.equal(functionPostProcess(), 'BTN', 'function postProcess');

		const arrayCompound = sv({ base: 'btn', compoundVariants: [] });

		t.equal(arrayCompound(), 'btn', 'array compoundVariants');

		const booleanMultiSlots = sv({
			slots: { header: 'h' },
			multiSlots: true
		});

		t.equal(booleanMultiSlots().header(), 'h', 'boolean multiSlots');

		const arrayRequiredVariants = sv({
			base: 'btn',
			variants: { intent: { primary: 'bg-blue-500' } },
			requiredVariants: ['intent']
		});

		t.equal(
			arrayRequiredVariants({ intent: 'primary' }),
			'btn bg-blue-500',
			'array requiredVariants'
		);

		t.end();
	}
);

t.test('variadic args with config as last argument', (t) => {
	const button = sv('flex', 'items-center', {
		base: 'gap-2',
		variants: {
			size: {
				sm: 'text-sm',
				lg: 'text-lg'
			}
		}
	});

	t.equal(
		button({ size: 'sm' }),
		'flex items-center gap-2 text-sm',
		'multiple base args merged with config'
	);

	t.end();
});

t.test(
	'variadic args with helper-returned config use the config overload',
	(t) => {
		const createButtonConfig = () =>
			({
				variants: {
					size: {
						sm: 'text-sm',
						lg: 'text-lg'
					}
				},
				defaultVariants: {
					size: 'sm'
				}
			}) as const;

		const button = sv('flex', createButtonConfig());

		t.equal(
			button({ size: 'lg' }),
			'flex text-lg',
			'helper-returned configs stay on the variant overload'
		);

		t.end();
	}
);

t.test('helper-returned compound configs use the config overload', (t) => {
	const createButtonConfig = () =>
		({
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
				{ size: 'lg', intent: 'danger', class: 'uppercase' }
			],
			defaultVariants: {
				size: 'sm',
				intent: 'primary'
			}
		}) as const;

	const button = sv('flex', createButtonConfig());

	t.equal(
		button({ size: 'lg', intent: 'danger' }),
		'flex text-lg bg-red-500 uppercase',
		'helper-returned compound configs stay on the variant overload'
	);

	t.end();
});

const _helperRequiredConfigFn = sv(
	'rounded-lg',
	(() =>
		({
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
			requiredVariants: ['intent']
		}) as const)()
);

type HelperRequiredConfigProps = VariantProps<typeof _helperRequiredConfigFn>;

type AssertHelperRequiredConfig = HelperRequiredConfigProps extends {
	size?: 'sm' | 'lg' | null | undefined;
	intent: 'primary' | 'danger';
}
	? true
	: false;
const _assertHelperRequiredConfig: AssertHelperRequiredConfig = true;

void _helperRequiredConfigFn;
void _assertHelperRequiredConfig;

t.test(
	'helper-returned compound slot configs support readonly matcher arrays',
	(t) => {
		const createCardConfig = () =>
			({
				slots: {
					header: 'font-bold',
					body: 'py-4'
				},
				variants: {
					tone: {
						info: {
							base: 'border-blue-500',
							header: 'text-blue-700'
						},
						danger: {
							base: 'border-red-500',
							header: 'text-red-700'
						}
					}
				},
				compoundSlots: [
					{
						slots: ['base', 'header'],
						tone: ['info', 'danger'],
						class: 'rounded-lg'
					}
				]
			}) as const;

		const card = sv('card', createCardConfig());

		t.same(
			card({ tone: 'info' }),
			{
				base: 'card border-blue-500 rounded-lg',
				header: 'font-bold text-blue-700 rounded-lg',
				body: 'py-4'
			},
			'helper-returned compound slot configs stay on the variant overload'
		);

		t.end();
	}
);