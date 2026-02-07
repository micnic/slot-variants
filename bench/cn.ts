import { Bench } from 'tinybench';
import classnames from 'classnames';
import { cn } from '../src/index.ts';

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

console.log('\n');
console.table(
	bench.tasks
		.filter((task) => task.result)
		.map((task) => {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const { latency, throughput } = task.result as any;

			return {
				'Task': task.name,
				'ops/sec': Math.round(throughput.mean).toLocaleString(),
				'Mean (ns)': Math.round(latency.mean * 1_000_000),
				'Margin': `\xb1${latency.rme.toFixed(2)}%`
			};
		})
);