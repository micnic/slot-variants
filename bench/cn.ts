import { Bench } from 'tinybench';
import classnames from 'classnames';
import { clsx } from 'clsx';
import { cn as tvCn } from 'tailwind-variants';
import { cn } from '../src/index.ts';
import { addComparison } from './compare.ts';
import { printBenchResults } from './report.ts';

const bench = new Bench({ warmupIterations: 1000 });

// Strings only
addComparison(bench, 'strings', {
	cn: () => cn('foo', 'bar', 'baz'),
	classnames: () => classnames('foo', 'bar', 'baz'),
	clsx: () => clsx('foo', 'bar', 'baz'),
	'tv cn': () => tvCn('foo', 'bar', 'baz')
});

// Mixed strings and falsy values
addComparison(bench, 'strings with falsy', {
	cn: () => cn('foo', false, 'bar', null, undefined, 'baz'),
	classnames: () => classnames('foo', false, 'bar', null, undefined, 'baz'),
	clsx: () => clsx('foo', false, 'bar', null, undefined, 'baz'),
	'tv cn': () => tvCn('foo', false, 'bar', null, undefined, 'baz')
});

// Object records
addComparison(bench, 'object', {
	cn: () => cn({ foo: true, bar: false, baz: true, qux: true }),
	classnames: () =>
		classnames({ foo: true, bar: false, baz: true, qux: true }),
	clsx: () => clsx({ foo: true, bar: false, baz: true, qux: true }),
	'tv cn': () => tvCn({ foo: true, bar: false, baz: true, qux: true })
});

// Mixed strings and objects
addComparison(bench, 'mixed', {
	cn: () => cn('foo', { bar: true, baz: false }, 'qux'),
	classnames: () => classnames('foo', { bar: true, baz: false }, 'qux'),
	clsx: () => clsx('foo', { bar: true, baz: false }, 'qux'),
	'tv cn': () => tvCn('foo', { bar: true, baz: false }, 'qux')
});

// Nested arrays
addComparison(bench, 'nested arrays', {
	cn: () => cn('foo', ['bar', ['baz', 'qux']]),
	classnames: () => classnames('foo', ['bar', ['baz', 'qux']]),
	clsx: () => clsx('foo', ['bar', ['baz', 'qux']]),
	'tv cn': () => tvCn('foo', ['bar', ['baz', 'qux']])
});

// Complex mixed
addComparison(bench, 'complex', {
	cn: () =>
		cn(
			'btn',
			['btn-primary', { 'btn-lg': true }],
			{ disabled: false },
			'mx-2'
		),
	classnames: () =>
		classnames(
			'btn',
			['btn-primary', { 'btn-lg': true }],
			{ disabled: false },
			'mx-2'
		),
	clsx: () =>
		clsx(
			'btn',
			['btn-primary', { 'btn-lg': true }],
			{ disabled: false },
			'mx-2'
		),
	'tv cn': () =>
		tvCn(
			'btn',
			['btn-primary', { 'btn-lg': true }],
			{ disabled: false },
			'mx-2'
		)
});

await bench.run();

printBenchResults(bench);