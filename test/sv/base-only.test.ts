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

t.test('a record without slots or variants is a class record', (t) => {
	const empty: ClassValue = {};

	t.equal(sv('btn', empty), 'btn', 'an empty record');

	const base: ClassValue = { base: 'p-4', extend: true };

	t.equal(sv('btn', base), 'btn base extend', 'other config key names');

	const unset: ClassValue = { slots: undefined, variants: undefined };

	t.equal(sv('btn', unset), 'btn', 'slots and variants left undefined');

	t.end();
});

t.test('the types follow the config rule', (t) => {
	const classes: string = sv({ base: 'p-4' });
	const flags: Record<string, boolean> = {};
	const fromFlags: string = sv('btn', flags);
	const component = sv({ base: 'btn', variants: {} });
	const rejected = () => [
		// @ts-expect-error - a record naming variants is no class value
		sv('btn', { variants: true }),
		// @ts-expect-error - nor is one naming slots
		sv({ slots: 'header' })
	];

	t.equal(classes, 'base', 'a record of other config keys');
	t.equal(fromFlags, 'btn', 'a record typed with an index signature');
	t.equal(component(), 'btn', 'variants: {} makes a component');
	t.equal(typeof rejected, 'function', 'checked by type only');

	t.end();
});

t.test('a record defining slots or variants is a config', (t) => {
	const variants: ClassValue = { variants: {} };
	const slots: ClassValue = { slots: {} };

	t.equal(typeof sv('btn', variants), 'function', 'variants');
	t.equal(typeof sv('btn', slots), 'function', 'slots');

	t.end();
});

t.test(
	'config values of the right shape still build a variant function',
	(t) => {
		const stringBase = sv({ base: 'btn', variants: {} });

		t.equal(stringBase(), 'btn', 'string base');

		const arrayBase = sv({ base: ['btn', 'px-2'], variants: {} });

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

		const numberCacheSize = sv({ base: 'btn', variants: {}, cacheSize: 0 });

		t.equal(numberCacheSize(), 'btn', 'numeric cacheSize');

		const functionPostProcess = sv({
			base: 'btn',
			variants: {},
			postProcess: (className) => className.toUpperCase()
		});

		t.equal(functionPostProcess(), 'BTN', 'function postProcess');

		const arrayCompound = sv({
			base: 'btn',
			variants: {},
			compoundVariants: []
		});

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

t.test('a config with no slots takes slot objects naming base', (t) => {
	const button = sv('btn', {
		variants: {
			size: { sm: { base: 'text-sm' }, lg: 'text-lg' },
			flat: { true: { base: 'shadow-none' } }
		},
		compoundVariants: [
			{ size: 'sm', flat: true, class: { base: 'border' } }
		]
	});

	t.equal(button({ size: 'sm' }), 'btn text-sm', 'variant value');
	t.equal(
		button({ size: 'sm', flat: true }),
		'btn text-sm shadow-none border',
		'boolean and compound values'
	);
	t.throws(
		() =>
			sv('btn', {
				// @ts-expect-error only `base` names a slot here
				variants: { size: { sm: { header: 'text-sm' } } }
			}),
		'an unknown slot'
	);

	t.end();
});