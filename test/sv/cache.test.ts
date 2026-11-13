import t from 'tap';
import { sv } from '../../src/index.ts';

// sv() - cache management

t.test('cache key disambiguates variants with overlapping value names', (t) => {
	const component = sv({
		variants: {
			size: { sm: 'text-sm', md: 'text-base' },
			color: { sm: 'bg-blue-500', md: 'bg-red-500' }
		}
	});

	t.equal(component({ size: 'sm' }), 'text-sm');
	t.equal(
		component({ color: 'sm' }),
		'bg-blue-500',
		'second call must not return the cached size=sm result'
	);

	t.end();
});

t.test('getCacheSize returns current cache size', (t) => {
	const button = sv('rounded-lg', {
		variants: {
			size: {
				sm: 'text-sm',
				lg: 'text-lg'
			}
		},
		introspection: true
	});

	t.equal(button.getCacheSize(), 0, 'cache initially empty');

	button({ size: 'sm' });
	t.equal(button.getCacheSize(), 1, 'cache has 1 entry after first call');

	button({ size: 'sm' });
	t.equal(button.getCacheSize(), 1, 'cache unchanged for same props');

	button({ size: 'lg' });
	t.equal(
		button.getCacheSize(),
		2,
		'cache has 2 entries for different props'
	);

	t.end();
});

t.test('clearCache empties the cache', (t) => {
	const button = sv('rounded-lg', {
		variants: {
			size: {
				sm: 'text-sm',
				lg: 'text-lg'
			}
		},
		introspection: true
	});

	button({ size: 'sm' });
	button({ size: 'lg' });
	t.equal(button.getCacheSize(), 2, 'cache has 2 entries');

	button.clearCache();
	t.equal(button.getCacheSize(), 0, 'cache cleared');

	button({ size: 'sm' });
	t.equal(button.getCacheSize(), 1, 'cache repopulated after clear');

	t.end();
});

t.test('cacheSize config limits cache entries', (t) => {
	const button = sv('rounded-lg', {
		variants: {
			size: {
				sm: 'text-sm',
				md: 'text-base',
				lg: 'text-lg',
				xl: 'text-xl'
			}
		},
		cacheSize: 2,
		introspection: true
	});

	button({ size: 'sm' });
	button({ size: 'md' });
	t.equal(button.getCacheSize(), 2, 'cache at limit');

	button({ size: 'lg' });
	t.equal(button.getCacheSize(), 2, 'cache size stays at limit');

	t.end();
});

t.test('cacheSize 0 still produces correct results', (t) => {
	const button = sv('rounded-lg', {
		variants: {
			size: {
				sm: 'text-sm',
				md: 'text-base',
				lg: 'text-lg'
			}
		},
		cacheSize: 0,
		introspection: true
	});

	t.equal(
		button({ size: 'sm' }),
		'rounded-lg text-sm',
		'sm correct with cacheSize 0'
	);
	t.equal(
		button({ size: 'md' }),
		'rounded-lg text-base',
		'md correct with cacheSize 0'
	);
	t.equal(
		button({ size: 'lg' }),
		'rounded-lg text-lg',
		'lg correct with cacheSize 0'
	);
	t.equal(button.getCacheSize() <= 1, true, 'cache size stays at 0 or 1');

	t.end();
});

t.test('slot results are readonly at the type level', (t) => {
	const card = sv({
		slots: { header: 'font-bold', body: 'p-4' },
		multiSlots: ['body']
	});

	// Never called: a cached result is shared by every call with the same
	// props, so writing to it is rejected by the type instead of at runtime.
	const writeSlots = () => {
		const result = card();

		// @ts-expect-error - a slot class string is readonly
		result.header = 'mutated';
		// @ts-expect-error - a multi-slot function is readonly
		result.body = () => 'mutated';
	};

	t.type(writeSlots, 'function', 'writes are only type-checked');
	t.end();
});

t.test('cache works with slots', (t) => {
	const card = sv('border', {
		slots: {
			header: 'font-bold',
			body: 'text-base'
		},
		variants: {
			variant: {
				default: { base: 'bg-white', header: 'text-gray-900' },
				dark: { base: 'bg-gray-900', header: 'text-white' }
			}
		},
		introspection: true
	});

	t.equal(card.getCacheSize(), 0, 'cache empty initially');

	card({ variant: 'default' });
	t.equal(card.getCacheSize(), 1, 'cache has 1 entry');

	card({ variant: 'default' });
	t.equal(card.getCacheSize(), 1, 'cache hit for same props');

	card({ variant: 'dark' });
	t.equal(card.getCacheSize(), 2, 'cache has 2 entries');

	t.end();
});

t.test('cache skips entries when class prop is provided', (t) => {
	const button = sv('rounded-lg', {
		variants: {
			size: {
				sm: 'text-sm',
				lg: 'text-lg'
			}
		},
		introspection: true
	});

	button({ size: 'sm' });
	t.equal(button.getCacheSize(), 1, 'normal call cached');

	button({ size: 'sm', class: 'mt-4' });
	t.equal(button.getCacheSize(), 1, 'call with class not cached');

	button({ size: 'sm', className: 'mx-auto' });
	t.equal(button.getCacheSize(), 1, 'call with className not cached');

	button({ size: 'lg' });
	t.equal(button.getCacheSize(), 2, 'different variant cached');

	t.end();
});