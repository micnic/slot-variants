import { Bench } from 'tinybench';
import classnames from 'classnames';
import { clsx } from 'clsx';
import { cn } from '../src/index.ts';
import { assertSameOutput, printBenchResults } from './report.ts';

const bench = new Bench({ warmupIterations: 1000 });

// Strings only
bench.add('cn - strings', () => {
	cn('foo', 'bar', 'baz');
});
bench.add('classnames - strings', () => {
	classnames('foo', 'bar', 'baz');
});
bench.add('clsx - strings', () => {
	clsx('foo', 'bar', 'baz');
});

// Mixed strings and falsy values
bench.add('cn - strings with falsy', () => {
	cn('foo', false, 'bar', null, undefined, 'baz');
});
bench.add('classnames - strings with falsy', () => {
	classnames('foo', false, 'bar', null, undefined, 'baz');
});
bench.add('clsx - strings with falsy', () => {
	clsx('foo', false, 'bar', null, undefined, 'baz');
});

// Object records
bench.add('cn - object', () => {
	cn({ foo: true, bar: false, baz: true, qux: true });
});
bench.add('classnames - object', () => {
	classnames({ foo: true, bar: false, baz: true, qux: true });
});
bench.add('clsx - object', () => {
	clsx({ foo: true, bar: false, baz: true, qux: true });
});

// Mixed strings and objects
bench.add('cn - mixed', () => {
	cn('foo', { bar: true, baz: false }, 'qux');
});
bench.add('classnames - mixed', () => {
	classnames('foo', { bar: true, baz: false }, 'qux');
});
bench.add('clsx - mixed', () => {
	clsx('foo', { bar: true, baz: false }, 'qux');
});

// Nested arrays
bench.add('cn - nested arrays', () => {
	cn('foo', ['bar', ['baz', 'qux']]);
});
bench.add('classnames - nested arrays', () => {
	classnames('foo', ['bar', ['baz', 'qux']]);
});
bench.add('clsx - nested arrays', () => {
	clsx('foo', ['bar', ['baz', 'qux']]);
});

// Complex mixed
bench.add('cn - complex', () => {
	cn('btn', ['btn-primary', { 'btn-lg': true }], { disabled: false }, 'mx-2');
});
bench.add('classnames - complex', () => {
	classnames(
		'btn',
		['btn-primary', { 'btn-lg': true }],
		{ disabled: false },
		'mx-2'
	);
});
bench.add('clsx - complex', () => {
	clsx('btn', ['btn-primary', { 'btn-lg': true }], { disabled: false }, 'mx-2');
});

// Validate that all competitors produce identical output for each case
assertSameOutput('strings', {
	cn: cn('foo', 'bar', 'baz'),
	classnames: classnames('foo', 'bar', 'baz'),
	clsx: clsx('foo', 'bar', 'baz')
});
assertSameOutput('strings with falsy', {
	cn: cn('foo', false, 'bar', null, undefined, 'baz'),
	classnames: classnames('foo', false, 'bar', null, undefined, 'baz'),
	clsx: clsx('foo', false, 'bar', null, undefined, 'baz')
});
assertSameOutput('object', {
	cn: cn({ foo: true, bar: false, baz: true, qux: true }),
	classnames: classnames({ foo: true, bar: false, baz: true, qux: true }),
	clsx: clsx({ foo: true, bar: false, baz: true, qux: true })
});
assertSameOutput('mixed', {
	cn: cn('foo', { bar: true, baz: false }, 'qux'),
	classnames: classnames('foo', { bar: true, baz: false }, 'qux'),
	clsx: clsx('foo', { bar: true, baz: false }, 'qux')
});
assertSameOutput('nested arrays', {
	cn: cn('foo', ['bar', ['baz', 'qux']]),
	classnames: classnames('foo', ['bar', ['baz', 'qux']]),
	clsx: clsx('foo', ['bar', ['baz', 'qux']])
});
assertSameOutput('complex', {
	cn: cn('btn', ['btn-primary', { 'btn-lg': true }], { disabled: false }, 'mx-2'),
	classnames: classnames(
		'btn',
		['btn-primary', { 'btn-lg': true }],
		{ disabled: false },
		'mx-2'
	),
	clsx: clsx('btn', ['btn-primary', { 'btn-lg': true }], { disabled: false }, 'mx-2')
});

await bench.run();

printBenchResults(bench);