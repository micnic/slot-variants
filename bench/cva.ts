import { Bench } from 'tinybench';
import { cva } from 'class-variance-authority';
import { sv } from '../src/index.ts';
import {
	createCompoundButtonConfig,
	createManyVariantsConfig,
	createSimpleButtonConfig
} from './fixtures.ts';
import { assertSameOutput, printBenchResults } from './report.ts';

const bench = new Bench({ warmupIterations: 1000 });

const compoundButtonConfig = createCompoundButtonConfig();

// --- Simple variants ---

const svButton = sv('btn', createSimpleButtonConfig());

const svButtonNoCache = sv('btn', { ...createSimpleButtonConfig(), cacheSize: 0 });

const cvaButton = cva('btn', createSimpleButtonConfig());

bench.add('sv - simple defaults', () => {
	svButton();
});
bench.add('sv (no cache) - simple defaults', () => {
	svButtonNoCache();
});
bench.add('cva - simple defaults', () => {
	cvaButton();
});

bench.add('sv - simple with props', () => {
	svButton({ color: 'secondary', size: 'lg' });
});
bench.add('sv (no cache) - simple with props', () => {
	svButtonNoCache({ color: 'secondary', size: 'lg' });
});
bench.add('cva - simple with props', () => {
	cvaButton({ color: 'secondary', size: 'lg' });
});

// --- Compound variants ---

const svCompound = sv('btn', createCompoundButtonConfig());

const svCompoundNoCache = sv('btn', {
	...createCompoundButtonConfig(),
	cacheSize: 0
});

const cvaCompound = cva('btn', {
	...compoundButtonConfig,
	compoundVariants: [...compoundButtonConfig.compoundVariants]
});

bench.add('sv - compound match', () => {
	svCompound({ color: 'primary', size: 'lg' });
});
bench.add('sv (no cache) - compound match', () => {
	svCompoundNoCache({ color: 'primary', size: 'lg' });
});
bench.add('cva - compound match', () => {
	cvaCompound({ color: 'primary', size: 'lg' });
});

bench.add('sv - compound no match', () => {
	svCompound({ color: 'primary', size: 'sm' });
});
bench.add('sv (no cache) - compound no match', () => {
	svCompoundNoCache({ color: 'primary', size: 'sm' });
});
bench.add('cva - compound no match', () => {
	cvaCompound({ color: 'primary', size: 'sm' });
});

// --- Many variants ---

const svMany = sv('component', createManyVariantsConfig());

const svManyNoCache = sv('component', {
	...createManyVariantsConfig(),
	cacheSize: 0
});

const cvaMany = cva('component', createManyVariantsConfig());

bench.add('sv - many variants defaults', () => {
	svMany();
});
bench.add('sv (no cache) - many variants defaults', () => {
	svManyNoCache();
});
bench.add('cva - many variants defaults', () => {
	cvaMany();
});

bench.add('sv - many variants with props', () => {
	svMany({ size: 'lg', color: 'danger', rounded: 'full', shadow: 'lg' });
});
bench.add('sv (no cache) - many variants with props', () => {
	svManyNoCache({ size: 'lg', color: 'danger', rounded: 'full', shadow: 'lg' });
});
bench.add('cva - many variants with props', () => {
	cvaMany({ size: 'lg', color: 'danger', rounded: 'full', shadow: 'lg' });
});

// Validate that sv and cva produce identical output for each case
assertSameOutput('simple defaults', {
	sv: svButton(),
	'sv (no cache)': svButtonNoCache(),
	cva: cvaButton()
});
assertSameOutput('simple with props', {
	sv: svButton({ color: 'secondary', size: 'lg' }),
	'sv (no cache)': svButtonNoCache({ color: 'secondary', size: 'lg' }),
	cva: cvaButton({ color: 'secondary', size: 'lg' })
});
assertSameOutput('compound match', {
	sv: svCompound({ color: 'primary', size: 'lg' }),
	'sv (no cache)': svCompoundNoCache({ color: 'primary', size: 'lg' }),
	cva: cvaCompound({ color: 'primary', size: 'lg' })
});
assertSameOutput('compound no match', {
	sv: svCompound({ color: 'primary', size: 'sm' }),
	'sv (no cache)': svCompoundNoCache({ color: 'primary', size: 'sm' }),
	cva: cvaCompound({ color: 'primary', size: 'sm' })
});
assertSameOutput('many variants defaults', {
	sv: svMany(),
	'sv (no cache)': svManyNoCache(),
	cva: cvaMany()
});
assertSameOutput('many variants with props', {
	sv: svMany({ size: 'lg', color: 'danger', rounded: 'full', shadow: 'lg' }),
	'sv (no cache)': svManyNoCache({
		size: 'lg',
		color: 'danger',
		rounded: 'full',
		shadow: 'lg'
	}),
	cva: cvaMany({ size: 'lg', color: 'danger', rounded: 'full', shadow: 'lg' })
});

await bench.run();

printBenchResults(bench);