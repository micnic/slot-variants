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
	createExtendedButtonConfig,
	createExtendedSlotsCardConfig,
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

// The props a card slot function is called with in the per-slot cases.
type CardSlotProps = {
	size?: 'sm' | 'md' | 'lg';
	variant?: 'outlined' | 'filled';
};

type CardSlotFn = (props?: CardSlotProps) => string;

// A card result whose slots are all functions: every tailwind-variants slots
// result, and an sv() one built with `multiSlots: true`.
type CardSlotFns = {
	base: CardSlotFn;
	header: CardSlotFn;
	body: CardSlotFn;
	footer: CardSlotFn;
};

type ExtendedCardSlotFns = {
	base: () => string;
	header: () => string;
	body: () => string;
	footer: () => string;
	icon: () => string;
};

const tvNoMerge = createTV({ twMerge: false });

// tailwind-variants has no option to turn off its variant cache, but skips it
// for a call whose props it can't fingerprint, like a function under a key
// that isn't a variant. Its memo for props matching the defaults can't be
// skipped, so only cases with other props get uncached tv runs.
const tvNoCache = { noCache: () => '' };

// The props the "with props" slot comparisons pass.
const lgFilled = { size: 'lg', variant: 'filled' } as const;

const bench = new Bench({ warmupIterations: 1000 });

const compoundButtonConfig = createCompoundButtonConfig();

// Materializes a slot-functions result into a plain record of strings, the
// shape sv's default slot output already has, so both do the same work.
// `props` is passed to every slot function call.
const materializeSlots = (slots: CardSlotFns, props?: CardSlotProps) => ({
	base: slots.base(props),
	header: slots.header(props),
	body: slots.body(props),
	footer: slots.footer(props)
});

const materializeExtendedSlots = (slots: ExtendedCardSlotFns) => ({
	base: slots.base(),
	header: slots.header(),
	body: slots.body(),
	footer: slots.footer(),
	icon: slots.icon()
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

// The runs of one tailwind-variants build: `runTv` under `name`, and, when
// given, `runTvNoCache` under `noCacheName`.
const tvRuns = <V, T>(
	fn: V,
	[name, noCacheName]: readonly [string, string],
	runTv: (fn: V) => T,
	runTvNoCache?: (fn: V) => T
): Record<string, () => T> => {
	if (runTvNoCache === undefined) {
		return { [name]: () => runTv(fn) };
	}

	return {
		[name]: () => runTv(fn),
		[noCacheName]: () => runTvNoCache(fn)
	};
};

// Benchmarks one case across every competitor: `runSv` calls an sv() build,
// `runTv` a tailwind-variants one, both returning the same output shape.
// `runTvNoCache`, when given, calls tailwind-variants so it skips its cache.
const addTvComparison = <S, V, T>(
	label: string,
	{ sv: svFns, svMerge, tvNoMerge, tv: tvFn }: TvCompetitors<S, V>,
	runSv: (fn: S) => T,
	runTv: (fn: V) => T,
	runTvNoCache?: (fn: V) => T
) => {
	addComparison(bench, label, {
		...runEach(svFns, (fn) => () => runSv(fn)),
		...tvRuns(
			tvNoMerge,
			['tv (no merge)', 'tv (no merge, no cache)'],
			runTv,
			runTvNoCache
		),
		...runEach(svMerge, (fn) => () => runSv(fn)),
		...tvRuns(tvFn, ['tv', 'tv (no cache)'], runTv, runTvNoCache)
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
	(fn) => fn({ color: 'secondary', size: 'lg' }),
	(fn) => fn({ color: 'secondary', size: 'lg', ...tvNoCache })
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
	(fn) => fn({ color: 'primary', size: 'lg' }),
	(fn) => fn({ color: 'primary', size: 'lg', ...tvNoCache })
);

addTvComparison(
	'compound no match',
	compound,
	(fn) => fn({ color: 'primary', size: 'sm' }),
	(fn) => fn({ color: 'primary', size: 'sm' }),
	(fn) => fn({ color: 'primary', size: 'sm', ...tvNoCache })
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
	(fn) => materializeSlots(fn())
);

addTvComparison(
	'slots with props',
	slots,
	(fn) => fn(lgFilled),
	(fn) => materializeSlots(fn(lgFilled)),
	(fn) => materializeSlots(fn({ ...lgFilled, ...tvNoCache }))
);

// --- Multi slots (every sv() slot a function, like tailwind-variants) ---

const multiSlots = createCompetitors(
	(options) =>
		sv('card', {
			...createSlotsCardConfig(),
			multiSlots: true,
			...options
		}),
	(build) => build({ base: 'card', ...createSlotsCardConfig() })
);

addTvComparison(
	'multi slots defaults',
	multiSlots,
	(fn) => materializeSlots(fn()),
	(fn) => materializeSlots(fn())
);

addTvComparison(
	'multi slots with props',
	multiSlots,
	(fn) => materializeSlots(fn(lgFilled)),
	(fn) => materializeSlots(fn(lgFilled)),
	(fn) => materializeSlots(fn({ ...lgFilled, ...tvNoCache }))
);

addTvComparison(
	'multi slots with slot props',
	multiSlots,
	(fn) => materializeSlots(fn(), lgFilled),
	(fn) => materializeSlots(fn(), lgFilled)
);

// --- Extend ---

const extended = createCompetitors(
	(options) =>
		sv({
			extend: sv('btn', { ...createSimpleButtonConfig(), ...options }),
			...createExtendedButtonConfig()
		}),
	(build) => {
		const parent = build({ base: 'btn', ...createSimpleButtonConfig() });

		return build({
			extend: parent,
			...createExtendedButtonConfig(),
			compoundVariants: [...createExtendedButtonConfig().compoundVariants]
		});
	}
);

addTvComparison(
	'extend defaults',
	extended,
	(fn) => fn(),
	(fn) => fn()
);

addTvComparison(
	'extend with props',
	extended,
	(fn) => fn({ color: 'danger', size: 'lg', rounded: 'full' }),
	(fn) => fn({ color: 'danger', size: 'lg', rounded: 'full' }),
	(fn) => fn({ color: 'danger', size: 'lg', rounded: 'full', ...tvNoCache })
);

const extendedSlots = createCompetitors(
	(options) =>
		sv({
			extend: sv('card', { ...createSlotsCardConfig(), ...options }),
			...createExtendedSlotsCardConfig()
		}),
	(build) => {
		const parent = build({ base: 'card', ...createSlotsCardConfig() });

		return build({ extend: parent, ...createExtendedSlotsCardConfig() });
	}
);

addTvComparison(
	'extend slots with props',
	extendedSlots,
	(fn) => fn({ size: 'lg', variant: 'filled', elevated: true }),
	(fn) =>
		materializeExtendedSlots(
			fn({ size: 'lg', variant: 'filled', elevated: true })
		),
	(fn) =>
		materializeExtendedSlots(
			fn({ size: 'lg', variant: 'filled', elevated: true, ...tvNoCache })
		)
);

await bench.run();

printBenchResults(bench);