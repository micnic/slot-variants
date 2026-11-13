import t from 'tap';
import { sv } from '../../src/index.ts';

// sv() - compound variants

t.test('compound variant matches when conditions met', (t) => {
	const button = sv('rounded-lg font-medium', {
		variants: {
			size: {
				sm: 'px-2 py-1 text-sm',
				lg: 'px-6 py-3 text-lg'
			},
			intent: {
				primary: 'bg-blue-500 text-white',
				danger: 'bg-red-500 text-white'
			}
		},
		compoundVariants: [
			{
				size: 'sm',
				intent: 'primary',
				class: 'uppercase tracking-wide'
			}
		]
	});

	t.equal(
		button({ size: 'sm', intent: 'primary' }),
		'rounded-lg font-medium px-2 py-1 text-sm bg-blue-500 text-white uppercase tracking-wide',
		'compound matches sm+primary'
	);
	t.equal(
		button({ size: 'lg', intent: 'primary' }),
		'rounded-lg font-medium px-6 py-3 text-lg bg-blue-500 text-white',
		'compound does not match lg+primary'
	);
	t.equal(
		button({ size: 'sm', intent: 'danger' }),
		'rounded-lg font-medium px-2 py-1 text-sm bg-red-500 text-white',
		'compound does not match sm+danger'
	);

	t.end();
});

t.test('compound variant with array matching', (t) => {
	const button = sv('rounded-lg', {
		variants: {
			size: {
				sm: 'text-sm',
				md: 'text-base',
				lg: 'text-lg'
			}
		},
		compoundVariants: [
			{
				size: ['sm', 'md'],
				class: 'font-normal'
			}
		]
	});

	t.equal(
		button({ size: 'sm' }),
		'rounded-lg text-sm font-normal',
		'matches sm in array'
	);
	t.equal(
		button({ size: 'md' }),
		'rounded-lg text-base font-normal',
		'matches md in array'
	);
	t.equal(button({ size: 'lg' }), 'rounded-lg text-lg', 'does not match lg');

	t.end();
});

t.test('compound variant with className instead of class', (t) => {
	const button = sv('rounded-lg', {
		variants: {
			size: {
				sm: 'text-sm',
				lg: 'text-lg'
			}
		},
		compoundVariants: [
			{
				size: 'sm',
				className: 'shadow-sm'
			}
		]
	});

	t.equal(
		button({ size: 'sm' }),
		'rounded-lg text-sm shadow-sm',
		'className applied on match'
	);
	t.equal(
		button({ size: 'lg' }),
		'rounded-lg text-lg',
		'className not applied on mismatch'
	);

	t.end();
});

t.test('compound variant with slots — slot-specific class', (t) => {
	const card = sv('border rounded-lg', {
		slots: {
			header: 'font-bold',
			body: 'py-4'
		},
		variants: {
			variant: {
				primary: {
					base: 'border-blue-500',
					header: 'text-blue-700'
				},
				danger: {
					base: 'border-red-500',
					header: 'text-red-700'
				}
			},
			size: {
				sm: { base: 'p-2' },
				lg: { base: 'p-6' }
			}
		},
		compoundVariants: [
			{
				variant: 'primary',
				size: 'lg',
				class: {
					base: 'shadow-xl',
					body: 'min-h-32'
				}
			}
		]
	});

	const match = card({ variant: 'primary', size: 'lg' });
	t.equal(
		match.base,
		'border rounded-lg border-blue-500 p-6 shadow-xl',
		'compound base'
	);
	t.equal(match.header, 'font-bold text-blue-700', 'header unchanged');
	t.equal(match.body, 'py-4 min-h-32', 'compound body');

	const noMatch = card({ variant: 'danger', size: 'lg' });
	t.equal(
		noMatch.base,
		'border rounded-lg border-red-500 p-6',
		'no compound base'
	);
	t.equal(noMatch.body, 'py-4', 'no compound body');

	t.end();
});

t.test('compound variant with boolean shorthand', (t) => {
	const button = sv('rounded-lg', {
		variants: {
			size: {
				sm: 'text-sm',
				lg: 'text-lg'
			},
			loading: 'animate-pulse'
		},
		compoundVariants: [
			{
				size: 'sm',
				loading: true,
				class: 'scale-95'
			}
		]
	});

	t.equal(
		button({ size: 'sm', loading: true }),
		'rounded-lg text-sm animate-pulse scale-95',
		'compound matches sm+loading'
	);
	t.equal(
		button({ size: 'lg', loading: true }),
		'rounded-lg text-lg animate-pulse',
		'compound does not match lg+loading'
	);
	t.equal(
		button({ size: 'sm', loading: false }),
		'rounded-lg text-sm',
		'compound does not match sm+not loading'
	);

	t.end();
});

t.test('compound variant with false boolean condition', (t) => {
	const button = sv('rounded-lg', {
		variants: {
			size: {
				sm: 'text-sm',
				lg: 'text-lg'
			},
			disabled: {
				true: 'opacity-50',
				false: 'cursor-pointer'
			}
		},
		compoundVariants: [
			{
				disabled: false,
				size: 'sm',
				class: 'hover:scale-105'
			}
		]
	});

	t.equal(
		button({ size: 'sm', disabled: false }),
		'rounded-lg text-sm cursor-pointer hover:scale-105',
		'compound matches when disabled is false'
	);
	t.equal(
		button({ size: 'sm', disabled: true }),
		'rounded-lg text-sm opacity-50',
		'compound does not match when disabled is true'
	);
	t.equal(
		button({ size: 'lg', disabled: false }),
		'rounded-lg text-lg cursor-pointer',
		'compound does not match when size is lg'
	);

	t.end();
});

t.test('compound variant with numeric keys', (t) => {
	const heading = sv('font-bold', {
		variants: {
			level: {
				1: 'text-4xl',
				2: 'text-3xl',
				3: 'text-2xl'
			},
			intent: {
				primary: 'text-blue-500',
				danger: 'text-red-500'
			}
		},
		compoundVariants: [
			{
				level: 1,
				intent: 'primary',
				class: 'underline decoration-2'
			}
		]
	});

	t.equal(
		heading({ level: 1, intent: 'primary' }),
		'font-bold text-4xl text-blue-500 underline decoration-2',
		'compound matches level 1 + primary'
	);
	t.equal(
		heading({ level: 2, intent: 'primary' }),
		'font-bold text-3xl text-blue-500',
		'compound does not match level 2'
	);

	t.end();
});

t.test('compound variant with numeric array matching', (t) => {
	const heading = sv('font-bold', {
		variants: {
			level: {
				1: 'text-4xl',
				2: 'text-3xl',
				3: 'text-2xl'
			}
		},
		compoundVariants: [
			{
				level: [1, 2],
				class: 'tracking-tight'
			}
		]
	});

	t.equal(
		heading({ level: 1 }),
		'font-bold text-4xl tracking-tight',
		'matches level 1 in array'
	);
	t.equal(
		heading({ level: 2 }),
		'font-bold text-3xl tracking-tight',
		'matches level 2 in array'
	);
	t.equal(
		heading({ level: 3 }),
		'font-bold text-2xl',
		'does not match level 3'
	);

	t.end();
});

t.test('compound variant with no variant conditions (vacuous match)', (t) => {
	const button = sv('rounded-lg', {
		variants: {
			size: {
				sm: 'text-sm',
				lg: 'text-lg'
			}
		},
		compoundVariants: [
			{
				class: 'always-applied'
			}
		]
	});

	t.equal(
		button({ size: 'sm' }),
		'rounded-lg text-sm always-applied',
		'vacuous compound applied with sm'
	);
	t.equal(
		button({ size: 'lg' }),
		'rounded-lg text-lg always-applied',
		'vacuous compound applied with lg'
	);

	t.end();
});

t.test('compound variant matches via default variant value', (t) => {
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
		},
		compoundVariants: [
			{
				size: 'sm',
				intent: 'primary',
				class: 'uppercase'
			}
		]
	});

	t.equal(
		button({ intent: 'primary' }),
		'rounded-lg text-sm bg-blue-500 uppercase',
		'default size triggers compound match'
	);
	t.equal(
		button({ intent: 'danger' }),
		'rounded-lg text-sm bg-red-500',
		'default size does not trigger mismatched compound'
	);
	t.equal(
		button({ size: 'lg', intent: 'primary' }),
		'rounded-lg text-lg bg-blue-500',
		'explicit override prevents compound match'
	);

	t.end();
});

t.test('multiple compound variants', (t) => {
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
				class: 'shadow-sm'
			},
			{
				size: 'lg',
				intent: 'danger',
				class: 'shadow-lg ring-2 ring-red-300'
			}
		]
	});

	t.equal(
		button({ size: 'sm', intent: 'primary' }),
		'rounded-lg text-sm bg-blue-500 shadow-sm',
		'first compound matches'
	);
	t.equal(
		button({ size: 'lg', intent: 'danger' }),
		'rounded-lg text-lg bg-red-500 shadow-lg ring-2 ring-red-300',
		'second compound matches'
	);
	t.equal(
		button({ size: 'sm', intent: 'danger' }),
		'rounded-lg text-sm bg-red-500',
		'neither compound matches'
	);

	t.end();
});

t.test('multiple compound variants matching simultaneously', (t) => {
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
				class: 'font-medium'
			},
			{
				intent: 'primary',
				class: 'shadow-md'
			}
		]
	});

	t.equal(
		button({ size: 'sm', intent: 'primary' }),
		'rounded-lg text-sm bg-blue-500 font-medium shadow-md',
		'both compounds match and both classes applied'
	);
	t.equal(
		button({ size: 'sm', intent: 'danger' }),
		'rounded-lg text-sm bg-red-500 font-medium',
		'only first compound matches'
	);
	t.equal(
		button({ size: 'lg', intent: 'primary' }),
		'rounded-lg text-lg bg-blue-500 shadow-md',
		'only second compound matches'
	);

	t.end();
});