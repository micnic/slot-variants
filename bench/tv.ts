import { Bench } from 'tinybench';
import { twMerge } from 'tailwind-merge';
import { createTV, tv } from 'tailwind-variants';
import { sv } from '../src/index.ts';
import {
	createCompoundButtonConfig,
	createSimpleButtonConfig,
	createSlotsCardConfig
} from './fixtures.ts';
import { assertSameOutput, printBenchResults } from './report.ts';

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

const svCompound = sv('btn', createCompoundButtonConfig());

const svCompoundMerge = sv('btn', {
	postProcess: twMerge,
	...createCompoundButtonConfig()
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

// Materializes a tailwind-variants slots result into a plain record of strings
// so it can be compared against sv's slot output.
const materializeTvSlots = (slots: {
	base: () => string;
	header: () => string;
	body: () => string;
	footer: () => string;
}) => ({
	base: slots.base(),
	header: slots.header(),
	body: slots.body(),
	footer: slots.footer()
});

// Validate that sv and tailwind-variants produce identical output per case
assertSameOutput('simple defaults', {
	sv: svButton(),
	'sv + twMerge': svButtonMerge(),
	tv: tvButton(),
	'tv (no merge)': tvButtonNoMerge()
});
assertSameOutput('simple with props', {
	sv: svButton({ color: 'secondary', size: 'lg' }),
	'sv + twMerge': svButtonMerge({ color: 'secondary', size: 'lg' }),
	tv: tvButton({ color: 'secondary', size: 'lg' }),
	'tv (no merge)': tvButtonNoMerge({ color: 'secondary', size: 'lg' })
});
assertSameOutput('compound match', {
	sv: svCompound({ color: 'primary', size: 'lg' }),
	'sv + twMerge': svCompoundMerge({ color: 'primary', size: 'lg' }),
	tv: tvCompound({ color: 'primary', size: 'lg' }),
	'tv (no merge)': tvCompoundNoMerge({ color: 'primary', size: 'lg' })
});
assertSameOutput('compound no match', {
	sv: svCompound({ color: 'primary', size: 'sm' }),
	'sv + twMerge': svCompoundMerge({ color: 'primary', size: 'sm' }),
	tv: tvCompound({ color: 'primary', size: 'sm' }),
	'tv (no merge)': tvCompoundNoMerge({ color: 'primary', size: 'sm' })
});
assertSameOutput('slots defaults', {
	sv: svSlots(),
	'sv + twMerge': svSlotsMerge(),
	tv: materializeTvSlots(tvSlots()),
	'tv (no merge)': materializeTvSlots(tvSlotsNoMerge())
});
assertSameOutput('slots with props', {
	sv: svSlots({ size: 'lg', variant: 'filled' }),
	'sv + twMerge': svSlotsMerge({ size: 'lg', variant: 'filled' }),
	tv: materializeTvSlots(tvSlots({ size: 'lg', variant: 'filled' })),
	'tv (no merge)': materializeTvSlots(
		tvSlotsNoMerge({ size: 'lg', variant: 'filled' })
	)
});

await bench.run();

printBenchResults(bench);