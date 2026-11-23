import t from 'tap';
import { sv } from '../../src/index.ts';

// sv() - multiSlots

t.test('multiSlots makes listed slot a reconfigurable function', (t) => {
	const card = sv('border', {
		slots: {
			header: 'font-bold',
			body: 'py-4'
		},
		variants: {
			size: {
				sm: { base: 'p-2', header: 'text-sm', body: 'text-xs' },
				lg: { base: 'p-6', header: 'text-lg', body: 'text-base' }
			}
		},
		multiSlots: ['header']
	});

	const result = card({ size: 'sm' });

	t.equal(result.base, 'border p-2', 'base stays a string');
	t.equal(result.body, 'py-4 text-xs', 'non-listed slot stays a string');
	t.type(result.header, 'function', 'listed slot becomes a function');
	t.equal(
		result.header(),
		'font-bold text-sm',
		'slot function uses the outer props'
	);
	t.equal(
		result.header({ size: 'lg' }),
		'font-bold text-lg',
		'slot function reconfigures variant props'
	);

	t.end();
});

t.test('multiSlots result keeps the slot order', (t) => {
	const card = sv({
		slots: {
			header: 'font-bold',
			body: 'py-4',
			footer: 'pt-2'
		},
		multiSlots: ['body']
	});

	const result = card();

	t.same(Object.keys(result), ['base', 'header', 'body', 'footer']);
	t.equal(result.header, 'font-bold', 'a plain slot stays a string');
	t.equal(result.body(), 'py-4', 'a multi slot becomes a function');

	t.end();
});

t.test('multiSlots slot function accepts a preset', (t) => {
	const card = sv('border', {
		slots: {
			header: 'font-bold',
			body: 'py-4'
		},
		variants: {
			tone: {
				neutral: { header: 'text-gray-900' },
				danger: { header: 'text-red-600' }
			}
		},
		defaultVariants: {
			tone: 'neutral'
		},
		presets: {
			alert: { tone: 'danger' }
		},
		multiSlots: ['header']
	});

	const result = card({});

	t.equal(
		result.header({ preset: 'alert' }),
		'font-bold text-red-600',
		'slot function applies the preset'
	);
	t.equal(
		result.header(),
		'font-bold text-gray-900',
		'omitting the preset keeps the default variant'
	);

	t.end();
});

t.test('multiSlots slot function overrides an outer preset', (t) => {
	const card = sv({
		slots: {
			header: 'font-bold'
		},
		variants: {
			tone: {
				neutral: { header: 'text-gray-900' },
				danger: { header: 'text-red-600' }
			}
		},
		presets: {
			alert: { tone: 'danger' },
			plain: { tone: 'neutral' }
		},
		multiSlots: ['header']
	});

	const result = card({ preset: 'alert' });

	t.equal(
		result.header(),
		'font-bold text-red-600',
		'slot function inherits the outer preset'
	);
	t.equal(
		result.header({ preset: 'plain' }),
		'font-bold text-gray-900',
		'slot function preset takes precedence over the outer one'
	);
	t.equal(
		result.header({ tone: 'neutral' }),
		'font-bold text-gray-900',
		'an explicit variant prop still overrides the outer preset'
	);

	t.end();
});

t.test('multiSlots slot function preset overrides outer props', (t) => {
	const card = sv({
		slots: { header: 'font-bold' },
		variants: {
			tone: {
				neutral: { header: 'text-gray-900' },
				danger: { header: 'text-red-600' }
			},
			size: { sm: { header: 'text-sm' }, lg: { header: 'text-lg' } }
		},
		presets: {
			alert: { tone: 'danger' },
			plain: { tone: 'neutral' }
		},
		multiSlots: ['header']
	});
	const result = card({ tone: 'danger', size: 'lg' });

	t.equal(
		result.header({ preset: 'plain' }),
		'font-bold text-gray-900 text-lg',
		'the preset replaces the outer value of the variants it sets only'
	);
	t.equal(
		result.header({ preset: 'plain', tone: 'danger' }),
		'font-bold text-red-600 text-lg',
		"the slot function's own prop still overrides its preset"
	);
	t.equal(
		card({ preset: 'alert', size: 'sm' }).header({ preset: 'plain' }),
		'font-bold text-gray-900 text-sm',
		'outer props the preset leaves alone are kept'
	);

	t.end();
});

t.test('multiSlots slot function preset keeps the outer preset values', (t) => {
	const card = sv({
		slots: { header: 'font-bold' },
		variants: {
			tone: { danger: { header: 'text-red-600' } },
			size: { lg: { header: 'text-lg' } },
			weight: { bold: { header: 'font-black' } }
		},
		requiredVariants: ['tone'],
		presets: {
			alert: { tone: 'danger', weight: 'bold' },
			large: { size: 'lg' }
		},
		multiSlots: ['header']
	});

	t.equal(
		card({ preset: 'alert' }).header({ preset: 'large' }),
		'font-bold text-red-600 text-lg font-black',
		'the outer preset values it leaves alone are kept'
	);
	t.equal(
		card({ preset: 'alert', weight: null }).header({ preset: 'large' }),
		'font-bold text-red-600 text-lg',
		'an outer prop still overrides the outer preset'
	);

	t.end();
});

t.test('multiSlots slot function throws for an unknown preset', (t) => {
	const card = sv({
		slots: {
			header: 'font-bold'
		},
		variants: {
			tone: {
				neutral: { header: 'text-gray-900' }
			}
		},
		presets: {
			plain: { tone: 'neutral' }
		},
		multiSlots: ['header']
	});

	const result = card({});

	t.throws(
		// @ts-expect-error unknown preset names fail at compile time too
		() => result.header({ preset: 'nope' }),
		new Error('Invalid preset "nope"'),
		'throws for an unknown preset'
	);

	t.end();
});

t.test('multiSlots: true makes every slot a function', (t) => {
	const card = sv('border', {
		slots: {
			header: 'font-bold',
			body: 'py-4'
		},
		multiSlots: true
	});

	const result = card();

	t.type(result.base, 'function', 'base becomes a function');
	t.type(result.header, 'function', 'header becomes a function');
	t.type(result.body, 'function', 'body becomes a function');
	t.equal(result.base(), 'border', 'base function returns its classes');
	t.equal(
		result.header(),
		'font-bold',
		'header function returns its classes'
	);

	t.end();
});

t.test('multiSlots: false keeps every slot a string', (t) => {
	const card = sv('border', {
		slots: {
			header: 'font-bold'
		},
		multiSlots: false
	});

	const result = card();

	t.same(result, { base: 'border', header: 'font-bold' }, 'all strings');

	t.end();
});

t.test('multiSlots slot function accepts a class override', (t) => {
	const card = sv('border', {
		slots: {
			header: 'font-bold',
			body: 'py-4'
		},
		multiSlots: ['header']
	});

	const result = card();

	t.equal(
		result.header({ class: 'mt-2' }),
		'font-bold mt-2',
		'class override is appended'
	);
	t.equal(
		result.header({ className: 'mb-2' }),
		'font-bold mb-2',
		'className override is appended'
	);

	t.end();
});

t.test('multiSlots slot function merges outer slot-object class', (t) => {
	const card = sv('border', {
		slots: {
			header: 'font-bold'
		},
		multiSlots: ['header']
	});

	const result = card({ class: { header: 'ring' } });

	t.equal(
		result.header({ class: 'mt-2' }),
		'font-bold ring mt-2',
		'outer slot-object class and inner class both apply'
	);

	t.end();
});

t.test('multiSlots slot function without props reuses the outer call', (t) => {
	let runs = 0;

	const card = sv('border', {
		slots: {
			header: 'font-bold'
		},
		variants: {
			size: {
				sm: { base: 'p-2', header: 'text-sm' }
			}
		},
		multiSlots: true,
		cacheSize: 0,
		postProcess: (className) => {
			runs += 1;

			return className;
		}
	});

	const result = card({ size: 'sm', class: { header: 'ring' } });
	const outerRuns = runs;

	t.equal(result.base(), 'border p-2', 'base reads the outer result');
	t.equal(
		result.header(),
		'font-bold text-sm ring',
		'slot reads the outer result, class included'
	);
	t.equal(runs, outerRuns, 'no variant function run after the outer call');

	t.equal(
		result.header({}),
		'font-bold text-sm ring',
		'an empty props object gives the same class'
	);
	t.ok(runs > outerRuns, 'slot function with props runs again');

	t.end();
});

t.test('multiSlots call without props reuses its cached result', (t) => {
	const config = {
		slots: { header: 'font-bold' },
		variants: { size: { sm: { header: 'text-sm' } } },
		defaultVariants: { size: 'sm' },
		multiSlots: true,
		introspection: true
	} as const;

	const card = sv('border', config);
	const first = card();

	t.equal(card(), first, 'a cache hit returns the same result');
	t.not(card({}), first, 'a call with props builds its own result');
	t.equal(first.header(), 'font-bold text-sm', 'slot reads the defaults');

	card.clearCache();

	const cleared = card();

	t.not(cleared, first, 'clearing the cache builds a new result');
	t.equal(cleared.header(), 'font-bold text-sm', 'with the same classes');

	const uncached = sv('border', { ...config, cacheSize: 0 });

	t.not(uncached(), uncached(), 'without a cache every call builds anew');

	const box = sv('box', { multiSlots: true, variants: {} });

	t.equal(box(), box(), 'a base-only cache hit reuses the result');
	t.equal(box().base(), 'box', 'base reads the class string');
	t.equal(box().base({ class: 'mt-2' }), 'box mt-2', 'base accepts props');
	t.equal(box({}).base(), 'box', 'a call with props reads the class string');

	const uncachedBox = sv('box', {
		multiSlots: true,
		variants: {},
		cacheSize: 0
	});

	t.not(uncachedBox(), uncachedBox(), 'a base-only call without a cache');
	t.equal(uncachedBox().base(), 'box', 'still reads the class string');

	t.end();
});

t.test('multiSlots slot function keeps outer props on undefined', (t) => {
	const card = sv({
		slots: {
			header: 'font-bold'
		},
		variants: {
			size: {
				sm: { header: 'text-sm' },
				lg: { header: 'text-lg' }
			},
			tone: {
				neutral: { header: 'text-gray-900' },
				danger: { header: 'text-red-600' }
			}
		},
		presets: {
			alert: { tone: 'danger' }
		},
		defaultVariants: {
			size: 'sm'
		},
		multiSlots: ['header']
	});

	const sized = card({ size: 'lg' });
	const alert = card({ preset: 'alert' });

	t.equal(
		sized.header({ size: undefined }),
		'font-bold text-lg',
		'inner variant undefined keeps the outer value'
	);
	t.equal(
		sized.header({ size: null }),
		'font-bold',
		'inner variant null still unsets the outer value'
	);
	t.equal(
		alert.header({ preset: undefined }),
		'font-bold text-sm text-red-600',
		'inner preset undefined keeps the outer preset'
	);

	t.end();
});

t.test('multiSlots slot function keeps outer class on undefined', (t) => {
	const card = sv('border', {
		slots: {
			header: 'font-bold'
		},
		multiSlots: ['header']
	});

	const outerClass = card({ class: { header: 'ring' } });
	const outerClassName = card({ className: { header: 'ring' } });

	t.equal(
		outerClass.header({ class: undefined }),
		'font-bold ring',
		'inner class undefined keeps the outer class'
	);
	t.equal(
		outerClass.header({ className: undefined }),
		'font-bold ring',
		'inner className undefined keeps the outer class'
	);
	t.equal(
		outerClassName.header({ class: undefined }),
		'font-bold ring',
		'inner class undefined keeps the outer className'
	);
	t.equal(
		outerClassName.header({ className: undefined }),
		'font-bold ring',
		'inner className undefined keeps the outer className'
	);

	t.end();
});

t.test('multiSlots slot function merges outer string class', (t) => {
	const card = sv('border', {
		slots: {
			header: 'font-bold'
		},
		multiSlots: ['header']
	});

	const result = card({ class: 'shadow' });

	t.equal(
		result.base,
		'border shadow',
		'outer string class targets the base slot'
	);
	t.equal(
		result.header({ class: 'mt-2' }),
		'font-bold mt-2',
		'inner class applies to the header slot'
	);

	t.end();
});

t.test('multiSlots without a slots config makes base a function', (t) => {
	const all = sv('btn', { multiSlots: true, variants: {} });
	const listed = sv('btn', { multiSlots: ['base'], variants: {} });

	t.equal(all().base({ class: 'mt-2' }), 'btn mt-2', 'multiSlots: true');
	t.equal(listed().base(), 'btn', "multiSlots: ['base']");

	const none: string = sv('btn', { multiSlots: [], variants: {} })();
	const off: string = sv('btn', { multiSlots: false, variants: {} })();

	t.equal(none, 'btn', 'an empty list keeps the class string');
	t.equal(off, 'btn', 'multiSlots: false keeps the class string');

	t.end();
});

t.test('multiSlots on a base-only config returns a function', (t) => {
	const box = sv('border rounded-lg', {
		slots: {},
		multiSlots: true
	});

	const result = box();

	t.type(result.base, 'function', 'base becomes a function');
	t.equal(
		result.base(),
		'border rounded-lg',
		'base function returns classes'
	);
	t.equal(
		result.base({ class: 'mt-2' }),
		'border rounded-lg mt-2',
		'base function accepts a class override'
	);

	t.end();
});

t.test('multiSlots throws for an unknown slot', (t) => {
	t.throws(
		() =>
			sv('border', {
				slots: {
					header: 'font-bold'
				},
				// @ts-expect-error - intentionally referencing an unknown slot
				multiSlots: ['footer']
			}),
		{ message: 'Multi slot references unknown slot "footer"' },
		'throws at config time for an unknown slot'
	);

	t.end();
});

t.test(
	'introspected multiSlots and requiredVariants are typed as resolved',
	(t) => {
		const card = sv({
			slots: { header: 'h', icon: 'i' },
			groups: { controls: ['header', 'icon'] },
			variants: { size: { sm: 'a' } },
			multiSlots: ['controls'],
			requiredVariants: true,
			introspection: true
		});
		const multiSlots: ('header' | 'icon')[] = card.multiSlots;
		const required: 'size'[] = card.requiredVariants;

		t.same(
			multiSlots,
			['header', 'icon'],
			'a group is expanded to its slots'
		);
		t.same(
			required,
			['size'],
			'requiredVariants: true lists every variant'
		);

		// @ts-expect-error - the group name itself is not a multi-slot key
		const groupNames: 'controls'[] = card.multiSlots;

		t.same(groupNames, ['header', 'icon'], 'only slots are listed');

		const plain = sv({
			variants: { size: { sm: 'a' } },
			introspection: true
		});
		const noMultiSlots: string[] = plain.multiSlots;
		const noRequired: string[] = plain.requiredVariants;

		t.same(noMultiSlots, [], 'unset multiSlots is an empty list');
		t.same(noRequired, [], 'unset requiredVariants is an empty list');

		t.end();
	}
);

t.test('multiSlots is exposed via introspection', (t) => {
	const card = sv('border', {
		slots: {
			header: 'font-bold',
			body: 'py-4'
		},
		multiSlots: ['header'],
		introspection: true
	});

	t.same(card.multiSlots, ['header'], 'array form is exposed');

	const all = sv('border', {
		slots: {
			header: 'font-bold'
		},
		multiSlots: true,
		introspection: true
	});

	t.same(
		all.multiSlots,
		['base', 'header'],
		'multiSlots: true resolves to every slot key'
	);

	t.end();
});

t.test('a slot function keeps a required variant from being unset', (t) => {
	const list = sv({
		slots: { item: 'px-2' },
		variants: { size: { sm: 'text-sm', lg: 'text-lg' } },
		requiredVariants: ['size'],
		multiSlots: ['item']
	});
	const { item } = list({ size: 'sm' });

	t.throws(
		// @ts-expect-error - a required variant can't be unset
		() => item({ size: null }),
		{ message: 'Missing required variant: "size"' },
		'null unsets it'
	);
	t.equal(
		item({ size: undefined }),
		'px-2',
		'undefined keeps the outer value'
	);
	t.equal(item({ size: 'lg' }), 'px-2', 'a value overrides it');

	t.end();
});