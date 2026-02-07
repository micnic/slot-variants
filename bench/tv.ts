import { Bench } from 'tinybench';
import { twMerge } from 'tailwind-merge';
import { createTV, tv } from 'tailwind-variants';
import { sv } from '../src/index.ts';

const tvNoMerge = createTV({ twMerge: false });

const bench = new Bench({ warmupIterations: 1000 });

// --- Simple variants (no slots) ---

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

const svButtonMerge = sv('btn', {
	postProcess: twMerge,
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

const tvButton = tv({
	base: 'btn',
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

const tvButtonNoMerge = tvNoMerge({
	base: 'btn',
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
bench.add('sv + twMerge - simple defaults', () => {
	svButtonMerge();
});
bench.add('tv - simple defaults', () => {
	tvButton();
});
bench.add('tv (no merge) - simple defaults', () => {
	tvButtonNoMerge();
});

bench.add('sv - simple with props', () => {
	svButton({ color: 'secondary', size: 'lg' });
});
bench.add('sv + twMerge - simple with props', () => {
	svButtonMerge({ color: 'secondary', size: 'lg' });
});
bench.add('tv - simple with props', () => {
	tvButton({ color: 'secondary', size: 'lg' });
});
bench.add('tv (no merge) - simple with props', () => {
	tvButtonNoMerge({ color: 'secondary', size: 'lg' });
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

const svCompoundMerge = sv('btn', {
	postProcess: twMerge,
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

const tvCompound = tv({
	base: 'btn',
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

const tvCompoundNoMerge = tvNoMerge({
	base: 'btn',
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
bench.add('sv + twMerge - compound match', () => {
	svCompoundMerge({ color: 'primary', size: 'lg' });
});
bench.add('tv - compound match', () => {
	tvCompound({ color: 'primary', size: 'lg' });
});
bench.add('tv (no merge) - compound match', () => {
	tvCompoundNoMerge({ color: 'primary', size: 'lg' });
});

bench.add('sv - compound no match', () => {
	svCompound({ color: 'primary', size: 'sm' });
});
bench.add('sv + twMerge - compound no match', () => {
	svCompoundMerge({ color: 'primary', size: 'sm' });
});
bench.add('tv - compound no match', () => {
	tvCompound({ color: 'primary', size: 'sm' });
});
bench.add('tv (no merge) - compound no match', () => {
	tvCompoundNoMerge({ color: 'primary', size: 'sm' });
});

// --- Slots ---

const svSlots = sv('card', {
	slots: {
		header: 'card-header font-bold',
		body: 'card-body p-4',
		footer: 'card-footer border-t'
	},
	variants: {
		size: {
			sm: { base: 'w-48', header: 'text-sm', body: 'text-sm' },
			md: { base: 'w-64', header: 'text-base', body: 'text-base' },
			lg: { base: 'w-96', header: 'text-lg', body: 'text-lg' }
		},
		variant: {
			outlined: { base: 'border', header: 'border-b' },
			filled: { base: 'bg-gray-100', header: 'bg-gray-200' }
		}
	},
	defaultVariants: {
		size: 'md',
		variant: 'outlined'
	}
});

const svSlotsMerge = sv('card', {
	postProcess: twMerge,
	slots: {
		header: 'card-header font-bold',
		body: 'card-body p-4',
		footer: 'card-footer border-t'
	},
	variants: {
		size: {
			sm: { base: 'w-48', header: 'text-sm', body: 'text-sm' },
			md: { base: 'w-64', header: 'text-base', body: 'text-base' },
			lg: { base: 'w-96', header: 'text-lg', body: 'text-lg' }
		},
		variant: {
			outlined: { base: 'border', header: 'border-b' },
			filled: { base: 'bg-gray-100', header: 'bg-gray-200' }
		}
	},
	defaultVariants: {
		size: 'md',
		variant: 'outlined'
	}
});

const tvSlots = tv({
	base: 'card',
	slots: {
		header: 'card-header font-bold',
		body: 'card-body p-4',
		footer: 'card-footer border-t'
	},
	variants: {
		size: {
			sm: { base: 'w-48', header: 'text-sm', body: 'text-sm' },
			md: { base: 'w-64', header: 'text-base', body: 'text-base' },
			lg: { base: 'w-96', header: 'text-lg', body: 'text-lg' }
		},
		variant: {
			outlined: { base: 'border', header: 'border-b' },
			filled: { base: 'bg-gray-100', header: 'bg-gray-200' }
		}
	},
	defaultVariants: {
		size: 'md',
		variant: 'outlined'
	}
});

const tvSlotsNoMerge = tvNoMerge({
	base: 'card',
	slots: {
		header: 'card-header font-bold',
		body: 'card-body p-4',
		footer: 'card-footer border-t'
	},
	variants: {
		size: {
			sm: { base: 'w-48', header: 'text-sm', body: 'text-sm' },
			md: { base: 'w-64', header: 'text-base', body: 'text-base' },
			lg: { base: 'w-96', header: 'text-lg', body: 'text-lg' }
		},
		variant: {
			outlined: { base: 'border', header: 'border-b' },
			filled: { base: 'bg-gray-100', header: 'bg-gray-200' }
		}
	},
	defaultVariants: {
		size: 'md',
		variant: 'outlined'
	}
});

bench.add('sv - slots defaults', () => {
	svSlots();
});
bench.add('sv + twMerge - slots defaults', () => {
	svSlotsMerge();
});
bench.add('tv - slots defaults', () => {
	const { base, header, body, footer } = tvSlots();

	base();
	header();
	body();
	footer();
});
bench.add('tv (no merge) - slots defaults', () => {
	const { base, header, body, footer } = tvSlotsNoMerge();

	base();
	header();
	body();
	footer();
});

bench.add('sv - slots with props', () => {
	svSlots({ size: 'lg', variant: 'filled' });
});
bench.add('sv + twMerge - slots with props', () => {
	svSlotsMerge({ size: 'lg', variant: 'filled' });
});
bench.add('tv - slots with props', () => {
	const { base, header, body, footer } = tvSlots({
		size: 'lg',
		variant: 'filled'
	});

	base();
	header();
	body();
	footer();
});
bench.add('tv (no merge) - slots with props', () => {
	const { base, header, body, footer } = tvSlotsNoMerge({
		size: 'lg',
		variant: 'filled'
	});

	base();
	header();
	body();
	footer();
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