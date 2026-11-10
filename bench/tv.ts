import { Bench } from 'tinybench';
import { twMerge } from 'tailwind-merge';
import { createTV, tv } from 'tailwind-variants';
import { sv } from '../src/index.ts';
import {
	addComparison,
	runEach,
	type SvBuildOptions,
	type SvBuilds,
	svBuilds,
	svMergeBuilds
} from './compare.ts';
import {
	createCompoundButtonConfig,
	createSimpleButtonConfig,
	createSlotsCardConfig
} from './fixtures.ts';
import { printBenchResults } from './report.ts';

// One case's competitors: the sv() builds, plain and piped through
// tailwind-merge, and tailwind-variants with and without its own merge.
type TvCompetitors<S, V> = {
	sv: SvBuilds<S>;
	svMerge: SvBuilds<S>;
	tvNoMerge: V;
	tv: V;
};

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

// The competitors for one config: `createSv` builds it with sv(), `createTv`
// with whichever tailwind-variants function it's handed.
const createCompetitors = <S, V>(
	createSv: (options: SvBuildOptions) => S,
	createTv: (build: typeof tv) => V
): TvCompetitors<S, V> => ({
	sv: svBuilds(createSv),
	svMerge: svMergeBuilds(createSv, twMerge),
	tvNoMerge: createTv(tvNoMerge),
	tv: createTv(tv)
});

// Benchmarks one case across every competitor: `runSv` calls an sv() build,
// `runTv` a tailwind-variants one, both returning the same output shape.
const addTvComparison = <S, V, T>(
	label: string,
	{ sv: svFns, svMerge, tvNoMerge, tv: tvFn }: TvCompetitors<S, V>,
	runSv: (fn: S) => T,
	runTv: (fn: V) => T
) => {
	addComparison(bench, label, {
		...runEach(svFns, (fn) => () => runSv(fn)),
		'tv (no merge)': () => runTv(tvNoMerge),
		...runEach(svMerge, (fn) => () => runSv(fn)),
		tv: () => runTv(tvFn)
	});
};

// --- Simple variants (no slots) ---

const button = createCompetitors(
	(options) => sv('btn', { ...createSimpleButtonConfig(), ...options }),
	(build) => build({ base: 'btn', ...createSimpleButtonConfig() })
);

addTvComparison(
	'simple defaults',
	button,
	(fn) => fn(),
	(fn) => fn()
);

addTvComparison(
	'simple with props',
	button,
	(fn) => fn({ color: 'secondary', size: 'lg' }),
	(fn) => fn({ color: 'secondary', size: 'lg' })
);

// --- Compound variants ---

const compound = createCompetitors(
	(options) => sv('btn', { ...createCompoundButtonConfig(), ...options }),
	(build) =>
		build({
			base: 'btn',
			...compoundButtonConfig,
			compoundVariants: [...compoundButtonConfig.compoundVariants]
		})
);

addTvComparison(
	'compound match',
	compound,
	(fn) => fn({ color: 'primary', size: 'lg' }),
	(fn) => fn({ color: 'primary', size: 'lg' })
);

addTvComparison(
	'compound no match',
	compound,
	(fn) => fn({ color: 'primary', size: 'sm' }),
	(fn) => fn({ color: 'primary', size: 'sm' })
);

// --- Slots ---

const slots = createCompetitors(
	(options) => sv('card', { ...createSlotsCardConfig(), ...options }),
	(build) => build({ base: 'card', ...createSlotsCardConfig() })
);

addTvComparison(
	'slots defaults',
	slots,
	(fn) => fn(),
	(fn) => materializeTvSlots(fn())
);

addTvComparison(
	'slots with props',
	slots,
	(fn) => fn({ size: 'lg', variant: 'filled' }),
	(fn) => materializeTvSlots(fn({ size: 'lg', variant: 'filled' }))
);

await bench.run();

printBenchResults(bench);