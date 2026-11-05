import { Bench } from 'tinybench';
import { cva } from 'class-variance-authority';
import { sv } from '../src/index.ts';
import { addComparison, runEach, svBuilds } from './compare.ts';
import {
	createCompoundButtonConfig,
	createManyVariantsConfig,
	createSimpleButtonConfig
} from './fixtures.ts';
import { printBenchResults } from './report.ts';

const bench = new Bench({ warmupIterations: 1000 });

const compoundButtonConfig = createCompoundButtonConfig();

// --- Simple variants ---

const svButton = svBuilds((options) =>
	sv('btn', { ...createSimpleButtonConfig(), ...options })
);

const cvaButton = cva('btn', createSimpleButtonConfig());

addComparison(bench, 'simple defaults', {
	...runEach(svButton, (fn) => () => fn()),
	cva: () => cvaButton()
});

addComparison(bench, 'simple with props', {
	...runEach(svButton, (fn) => () => fn({ color: 'secondary', size: 'lg' })),
	cva: () => cvaButton({ color: 'secondary', size: 'lg' })
});

// --- Compound variants ---

const svCompound = svBuilds((options) =>
	sv('btn', { ...createCompoundButtonConfig(), ...options })
);

const cvaCompound = cva('btn', {
	...compoundButtonConfig,
	compoundVariants: [...compoundButtonConfig.compoundVariants]
});

addComparison(bench, 'compound match', {
	...runEach(svCompound, (fn) => () => fn({ color: 'primary', size: 'lg' })),
	cva: () => cvaCompound({ color: 'primary', size: 'lg' })
});

addComparison(bench, 'compound no match', {
	...runEach(svCompound, (fn) => () => fn({ color: 'primary', size: 'sm' })),
	cva: () => cvaCompound({ color: 'primary', size: 'sm' })
});

// --- Many variants ---

const svMany = svBuilds((options) =>
	sv('component', { ...createManyVariantsConfig(), ...options })
);

const cvaMany = cva('component', createManyVariantsConfig());

addComparison(bench, 'many variants defaults', {
	...runEach(svMany, (fn) => () => fn()),
	cva: () => cvaMany()
});

addComparison(bench, 'many variants with props', {
	...runEach(
		svMany,
		(fn) => () =>
			fn({ size: 'lg', color: 'danger', rounded: 'full', shadow: 'lg' })
	),
	cva: () =>
		cvaMany({ size: 'lg', color: 'danger', rounded: 'full', shadow: 'lg' })
});

await bench.run();

printBenchResults(bench);