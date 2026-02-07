import { Bench } from 'tinybench';
import { cva } from 'class-variance-authority';
import { sv } from '../src/index.ts';

const bench = new Bench({ warmupIterations: 1000 });

// --- Simple variants ---

const svButton = sv('btn', {
	variants: {
		color: {
			primary: 'bg-blue-500',
			secondary: 'bg-gray-500'
		},
		size: {
			sm: 'text-sm',
			md: 'text-md',
			lg: 'text-lg'
		}
	},
	defaultVariants: {
		color: 'primary',
		size: 'md'
	}
});

const cvaButton = cva('btn', {
	variants: {
		color: {
			primary: 'bg-blue-500',
			secondary: 'bg-gray-500'
		},
		size: {
			sm: 'text-sm',
			md: 'text-md',
			lg: 'text-lg'
		}
	},
	defaultVariants: {
		color: 'primary',
		size: 'md'
	}
});

bench.add('sv - simple defaults', () => {
	svButton();
});
bench.add('cva - simple defaults', () => {
	cvaButton();
});

bench.add('sv - simple with props', () => {
	svButton({ color: 'secondary', size: 'lg' });
});
bench.add('cva - simple with props', () => {
	cvaButton({ color: 'secondary', size: 'lg' });
});

// --- Compound variants ---

const svCompound = sv('btn', {
	variants: {
		color: {
			primary: 'bg-blue-500',
			secondary: 'bg-gray-500'
		},
		size: {
			sm: 'text-sm',
			md: 'text-md',
			lg: 'text-lg'
		},
		disabled: {
			true: 'opacity-50 cursor-not-allowed',
			false: ''
		}
	},
	compoundVariants: [
		{ color: 'primary', size: 'lg', class: 'font-bold uppercase' },
		{ color: 'secondary', disabled: true, class: 'bg-gray-300' }
	],
	defaultVariants: {
		color: 'primary',
		size: 'md',
		disabled: false
	}
});

const cvaCompound = cva('btn', {
	variants: {
		color: {
			primary: 'bg-blue-500',
			secondary: 'bg-gray-500'
		},
		size: {
			sm: 'text-sm',
			md: 'text-md',
			lg: 'text-lg'
		},
		disabled: {
			true: 'opacity-50 cursor-not-allowed',
			false: ''
		}
	},
	compoundVariants: [
		{ color: 'primary', size: 'lg', class: 'font-bold uppercase' },
		{ color: 'secondary', disabled: true, class: 'bg-gray-300' }
	],
	defaultVariants: {
		color: 'primary',
		size: 'md',
		disabled: false
	}
});

bench.add('sv - compound match', () => {
	svCompound({ color: 'primary', size: 'lg' });
});
bench.add('cva - compound match', () => {
	cvaCompound({ color: 'primary', size: 'lg' });
});

bench.add('sv - compound no match', () => {
	svCompound({ color: 'primary', size: 'sm' });
});
bench.add('cva - compound no match', () => {
	cvaCompound({ color: 'primary', size: 'sm' });
});

// --- Many variants ---

const svMany = sv('component', {
	variants: {
		size: {
			xs: 'text-xs',
			sm: 'text-sm',
			md: 'text-md',
			lg: 'text-lg',
			xl: 'text-xl'
		},
		color: {
			primary: 'bg-blue-500',
			secondary: 'bg-gray-500',
			success: 'bg-green-500',
			danger: 'bg-red-500',
			warning: 'bg-yellow-500'
		},
		rounded: {
			none: 'rounded-none',
			sm: 'rounded-sm',
			md: 'rounded-md',
			lg: 'rounded-lg',
			full: 'rounded-full'
		},
		shadow: {
			none: 'shadow-none',
			sm: 'shadow-sm',
			md: 'shadow-md',
			lg: 'shadow-lg'
		}
	},
	defaultVariants: {
		size: 'md',
		color: 'primary',
		rounded: 'md',
		shadow: 'none'
	}
});

const cvaMany = cva('component', {
	variants: {
		size: {
			xs: 'text-xs',
			sm: 'text-sm',
			md: 'text-md',
			lg: 'text-lg',
			xl: 'text-xl'
		},
		color: {
			primary: 'bg-blue-500',
			secondary: 'bg-gray-500',
			success: 'bg-green-500',
			danger: 'bg-red-500',
			warning: 'bg-yellow-500'
		},
		rounded: {
			none: 'rounded-none',
			sm: 'rounded-sm',
			md: 'rounded-md',
			lg: 'rounded-lg',
			full: 'rounded-full'
		},
		shadow: {
			none: 'shadow-none',
			sm: 'shadow-sm',
			md: 'shadow-md',
			lg: 'shadow-lg'
		}
	},
	defaultVariants: {
		size: 'md',
		color: 'primary',
		rounded: 'md',
		shadow: 'none'
	}
});

bench.add('sv - many variants defaults', () => {
	svMany();
});
bench.add('cva - many variants defaults', () => {
	cvaMany();
});

bench.add('sv - many variants with props', () => {
	svMany({ size: 'lg', color: 'danger', rounded: 'full', shadow: 'lg' });
});
bench.add('cva - many variants with props', () => {
	cvaMany({ size: 'lg', color: 'danger', rounded: 'full', shadow: 'lg' });
});

await bench.run();

console.log('\n');
console.table(
	bench.tasks
		.filter((task) => task.result)
		.map((task) => {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const { latency, throughput } = task.result as any;

			return {
				'Task': task.name,
				'ops/sec': Math.round(throughput.mean).toLocaleString(),
				'Mean (ns)': Math.round(latency.mean * 1_000_000),
				'Margin': `\xb1${latency.rme.toFixed(2)}%`
			};
		})
);