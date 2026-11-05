import { Bench } from 'tinybench';
import { twMerge } from 'tailwind-merge';
import { createTV, tv } from 'tailwind-variants';
import { sv } from '../src/index.ts';
import {
	addComparison,
	runEach,
	type SvBuildOptions,
	svBuilds,
	svMergeBuilds
} from './compare.ts';
import {
	createCompoundButtonConfig,
	createSimpleButtonConfig,
	createSlotsCardConfig
} from './fixtures.ts';
import { printBenchResults } from './report.ts';

type TvSlots = {
	base: () => string;
	header: () => string;
	body: () => string;
	footer: () => string;
};

const tvNoMerge = createTV({ twMerge: false });

const bench = new Bench({ warmupIterations: 1000 });

const compoundButtonConfig = createCompoundButtonConfig();

// Materializes a tailwind-variants slots result into a plain record of strings,
// the shape sv's slot output already has, so both do the same work.
const materializeTvSlots = (slots: TvSlots) => ({
	base: slots.base(),
	header: slots.header(),
	body: slots.body(),
	footer: slots.footer()
});

// --- Simple variants (no slots) ---

const createButton = (options: SvBuildOptions) =>
	sv('btn', { ...createSimpleButtonConfig(), ...options });

const svButton = svBuilds(createButton);
const svButtonMerge = svMergeBuilds(createButton, twMerge);

const tvButton = tv({
	base: 'btn',
	...createSimpleButtonConfig()
});

const tvButtonNoMerge = tvNoMerge({
	base: 'btn',
	...createSimpleButtonConfig()
});

addComparison(bench, 'simple defaults', {
	...runEach(svButton, (fn) => () => fn()),
	'tv (no merge)': () => tvButtonNoMerge(),
	...runEach(svButtonMerge, (fn) => () => fn()),
	tv: () => tvButton()
});

addComparison(bench, 'simple with props', {
	...runEach(svButton, (fn) => () => fn({ color: 'secondary', size: 'lg' })),
	'tv (no merge)': () => tvButtonNoMerge({ color: 'secondary', size: 'lg' }),
	...runEach(
		svButtonMerge,
		(fn) => () => fn({ color: 'secondary', size: 'lg' })
	),
	tv: () => tvButton({ color: 'secondary', size: 'lg' })
});

// --- Compound variants ---

const createCompound = (options: SvBuildOptions) =>
	sv('btn', { ...createCompoundButtonConfig(), ...options });

const svCompound = svBuilds(createCompound);
const svCompoundMerge = svMergeBuilds(createCompound, twMerge);

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

addComparison(bench, 'compound match', {
	...runEach(svCompound, (fn) => () => fn({ color: 'primary', size: 'lg' })),
	'tv (no merge)': () => tvCompoundNoMerge({ color: 'primary', size: 'lg' }),
	...runEach(
		svCompoundMerge,
		(fn) => () => fn({ color: 'primary', size: 'lg' })
	),
	tv: () => tvCompound({ color: 'primary', size: 'lg' })
});

addComparison(bench, 'compound no match', {
	...runEach(svCompound, (fn) => () => fn({ color: 'primary', size: 'sm' })),
	'tv (no merge)': () => tvCompoundNoMerge({ color: 'primary', size: 'sm' }),
	...runEach(
		svCompoundMerge,
		(fn) => () => fn({ color: 'primary', size: 'sm' })
	),
	tv: () => tvCompound({ color: 'primary', size: 'sm' })
});

// --- Slots ---

const createSlots = (options: SvBuildOptions) =>
	sv('card', { ...createSlotsCardConfig(), ...options });

const svSlots = svBuilds(createSlots);
const svSlotsMerge = svMergeBuilds(createSlots, twMerge);

const tvSlots = tv({
	base: 'card',
	...createSlotsCardConfig()
});

const tvSlotsNoMerge = tvNoMerge({
	base: 'card',
	...createSlotsCardConfig()
});

addComparison(bench, 'slots defaults', {
	...runEach(svSlots, (fn) => () => fn()),
	'tv (no merge)': () => materializeTvSlots(tvSlotsNoMerge()),
	...runEach(svSlotsMerge, (fn) => () => fn()),
	tv: () => materializeTvSlots(tvSlots())
});

addComparison(bench, 'slots with props', {
	...runEach(svSlots, (fn) => () => fn({ size: 'lg', variant: 'filled' })),
	'tv (no merge)': () =>
		materializeTvSlots(tvSlotsNoMerge({ size: 'lg', variant: 'filled' })),
	...runEach(
		svSlotsMerge,
		(fn) => () => fn({ size: 'lg', variant: 'filled' })
	),
	tv: () => materializeTvSlots(tvSlots({ size: 'lg', variant: 'filled' }))
});

await bench.run();

printBenchResults(bench);