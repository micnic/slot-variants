import { Bench } from 'tinybench';
import classnames from 'classnames';
import { cn } from '../src/index.ts';
import { printBenchResults } from './report.ts';

const bench = new Bench({ warmupIterations: 1000 });

// Strings only
bench.add('cn - strings', () => {
	cn('foo', 'bar', 'baz');
});
bench.add('classnames - strings', () => {
	classnames('foo', 'bar', 'baz');
});

// Mixed strings and falsy values
bench.add('cn - strings with falsy', () => {
	cn('foo', false, 'bar', null, undefined, 'baz');
});
bench.add('classnames - strings with falsy', () => {
	classnames('foo', false, 'bar', null, undefined, 'baz');
});

// Object records
bench.add('cn - object', () => {
	cn({ foo: true, bar: false, baz: true, qux: true });
});
bench.add('classnames - object', () => {
	classnames({ foo: true, bar: false, baz: true, qux: true });
});

// Mixed strings and objects
bench.add('cn - mixed', () => {
	cn('foo', { bar: true, baz: false }, 'qux');
});
bench.add('classnames - mixed', () => {
	classnames('foo', { bar: true, baz: false }, 'qux');
});

// Nested arrays
bench.add('cn - nested arrays', () => {
	cn('foo', ['bar', ['baz', 'qux']]);
});
bench.add('classnames - nested arrays', () => {
	classnames('foo', ['bar', ['baz', 'qux']]);
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

await bench.run();

printBenchResults(bench);