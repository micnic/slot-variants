import t from 'tap';
import { sv } from '../../src/index.ts';

// sv() - postProcess

t.test('postProcess transforms output without slots', (t) => {
	const button = sv('rounded-lg font-medium', {
		variants: {
			size: {
				sm: 'px-2 py-1 text-sm',
				lg: 'px-6 py-3 text-lg'
			}
		},
		postProcess: (className) => className.toUpperCase()
	});

	t.equal(
		button({ size: 'sm' }),
		'ROUNDED-LG FONT-MEDIUM PX-2 PY-1 TEXT-SM',
		'postProcess applied to string output'
	);

	t.end();
});

t.test('postProcess transforms each slot', (t) => {
	const card = sv('relative', {
		slots: {
			header: 'font-bold text-lg',
			body: 'text-base p-4'
		},
		postProcess: (className) => `[${className}]`
	});

	t.same(card(), {
		base: '[relative]',
		header: '[font-bold text-lg]',
		body: '[text-base p-4]'
	});

	t.end();
});

t.test('postProcess can deduplicate classes', (t) => {
	const dedupeClasses = (className: string) => {
		return Array.from(new Set(className.split(' '))).join(' ');
	};

	const button = sv('flex flex items-center', {
		variants: {
			gap: {
				sm: 'gap-2 flex',
				lg: 'gap-4 flex'
			}
		},
		postProcess: dedupeClasses
	});

	t.equal(
		button({ gap: 'sm' }),
		'flex items-center gap-2',
		'duplicate classes removed'
	);

	t.end();
});

t.test('postProcess can trim classes', (t) => {
	const button = sv('  rounded-lg  font-medium  ', {
		variants: {
			size: {
				sm: '  text-sm  ',
				lg: '  text-lg  '
			}
		},
		postProcess: (className) => className.trim()
	});

	t.equal(
		button({ size: 'sm' }),
		'rounded-lg  font-medium     text-sm',
		'postProcess can trim leading/trailing whitespace'
	);

	t.end();
});

t.test('postProcess with compound variants', (t) => {
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
		compoundVariants: [
			{
				size: 'sm',
				intent: 'primary',
				class: 'shadow-sm ring-1'
			}
		],
		postProcess: (className) => className.replace(/-/g, '_')
	});

	t.equal(
		button({ size: 'sm', intent: 'primary' }),
		'rounded_lg text_sm bg_blue_500 shadow_sm ring_1',
		'postProcess transforms compound variant classes'
	);

	t.end();
});

t.test('postProcess with slots and variants', (t) => {
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
		postProcess: (className) => className.split(' ').reverse().join(' ')
	});

	t.same(card({ variant: 'default' }), {
		base: 'bg-white border',
		header: 'text-gray-900 font-bold',
		body: 'text-base'
	});

	t.end();
});

t.test('postProcess with class prop', (t) => {
	const button = sv('rounded-lg', {
		variants: {
			size: {
				sm: 'text-sm',
				lg: 'text-lg'
			}
		},
		postProcess: (className) => `processed:${className}`
	});

	t.equal(
		button({ size: 'sm', class: 'mt-4' }),
		'processed:rounded-lg text-sm mt-4',
		'postProcess applied to string with class prop'
	);

	t.end();
});

t.test('postProcess sees class prop overrides (twMerge use case)', (t) => {
	const lastWins = (className: string) => {
		const seen = new Map<string, string>();

		for (const token of className.split(/\s+/).filter(Boolean)) {
			const prefix = token.split('-')[0] ?? token;

			seen.set(prefix, token);
		}

		return Array.from(seen.values()).join(' ');
	};

	const button = sv('p-4 bg-blue-500', {
		variants: {
			size: {
				sm: 'p-2',
				lg: 'p-8'
			}
		},
		postProcess: lastWins
	});

	t.equal(
		button({ class: 'p-12' }),
		'p-12 bg-blue-500',
		'class prop participates in postProcess deduping'
	);

	t.equal(
		button({ size: 'lg', class: 'p-12' }),
		'p-12 bg-blue-500',
		'variant + class prop both deduped by postProcess'
	);

	t.end();
});

t.test('postProcess sees class prop overrides for slots', (t) => {
	const card = sv({
		slots: {
			base: 'p-4',
			header: 'font-bold'
		},
		postProcess: (className) => `[${className}]`
	});

	t.same(
		card({ class: { base: 'extra', header: 'underline' } }),
		{
			base: '[p-4 extra]',
			header: '[font-bold underline]'
		},
		'postProcess wraps merged slot output including class prop'
	);

	t.end();
});