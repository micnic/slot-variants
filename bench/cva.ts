import { Bench } from 'tinybench';
import { cva } from 'class-variance-authority';
import { sv } from '../src/index.ts';
import {
	createCompoundButtonConfig,
	createManyVariantsConfig,
	createSimpleButtonConfig
} from './fixtures.ts';
import { printBenchResults } from './report.ts';

const bench = new Bench({ warmupIterations: 1000 });

const compoundButtonConfig = createCompoundButtonConfig();

// --- Simple variants ---

const svButton = sv('btn', createSimpleButtonConfig());

const cvaButton = cva('btn', createSimpleButtonConfig());

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

const svCompound = sv('btn', createCompoundButtonConfig());

const cvaCompound = cva('btn', {
	...compoundButtonConfig,
	compoundVariants: [...compoundButtonConfig.compoundVariants]
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

const svMany = sv('component', createManyVariantsConfig());

const cvaMany = cva('component', createManyVariantsConfig());

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

printBenchResults(bench);