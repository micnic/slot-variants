import { Bench } from 'tinybench';
import { twMerge } from 'tailwind-merge';
import { createTV, tv } from 'tailwind-variants';
import { sv } from '../src/index.ts';
import {
	createCompoundButtonConfig,
	createSimpleButtonConfig,
	createSlotsCardConfig
} from './fixtures.ts';
import { printBenchResults } from './report.ts';

const tvNoMerge = createTV({ twMerge: false });

const bench = new Bench({ warmupIterations: 1000 });

const compoundButtonConfig = createCompoundButtonConfig();

// --- Simple variants (no slots) ---

const svButton = sv('btn', { ...createSimpleButtonConfig() });

const svButtonMerge = sv('btn', {
	postProcess: twMerge,
	...createSimpleButtonConfig()
});

const tvButton = tv({
	base: 'btn',
	...createSimpleButtonConfig()
});

const tvButtonNoMerge = tvNoMerge({
	base: 'btn',
	...createSimpleButtonConfig()
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
	...compoundButtonConfig,
	compoundVariants: [...compoundButtonConfig.compoundVariants]
});

const tvCompoundNoMerge = tvNoMerge({
	base: 'btn',
	...compoundButtonConfig,
	compoundVariants: [...compoundButtonConfig.compoundVariants]
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

const svSlots = sv('card', { ...createSlotsCardConfig() });

const svSlotsMerge = sv('card', {
	postProcess: twMerge,
	...createSlotsCardConfig()
});

const tvSlots = tv({
	base: 'card',
	...createSlotsCardConfig()
});

const tvSlotsNoMerge = tvNoMerge({
	base: 'card',
	...createSlotsCardConfig()
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

printBenchResults(bench);