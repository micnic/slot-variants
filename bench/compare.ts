import type { Bench } from 'tinybench';
import { withoutJit } from './no-jit.ts';

type Run<T> = () => T;

export type SvBuildOptions = {
	cacheSize?: number;
	postProcess?: (className: string) => string;
};

type SvBuilds<F> = Record<string, F>;

// The sv() builds every comparison runs: compiled and interpreted, each with
// and without the cache.
export const svBuilds = <F>(
	create: (options: SvBuildOptions) => F
): SvBuilds<F> => ({
	sv: create({}),
	'sv (no cache)': create({ cacheSize: 0 }),
	'sv (no jit)': withoutJit(() => create({})),
	'sv (no jit, no cache)': withoutJit(() => create({ cacheSize: 0 }))
});

// The sv() builds that pipe their output through tailwind-merge, with and
// without the cache.
export const svMergeBuilds = <F>(
	create: (options: SvBuildOptions) => F,
	twMerge: (className: string) => string
): SvBuilds<F> => ({
	'sv + twMerge': create({ postProcess: twMerge }),
	'sv + twMerge (no cache)': create({ postProcess: twMerge, cacheSize: 0 })
});

// One benchmark run per build. `bind` returns the run itself, so each calls its
// variant function directly, at the same depth as the other competitors.
export const runEach = <F, T>(
	builds: SvBuilds<F>,
	bind: (fn: F) => Run<T>
): Record<string, Run<T>> =>
	Object.fromEntries(
		Object.entries(builds).map(([name, fn]) => [name, bind(fn)])
	);

// Asserts that every competitor in a group produced identical output for a
// given case, so the benchmark compares equivalent work. Throws on mismatch.
const assertSameOutput = <T>(
	label: string,
	outputs: Record<string, T>
): void => {
	let expectedName = '';
	let expected: string | undefined;

	for (const [name, value] of Object.entries(outputs)) {
		const serialized = JSON.stringify(value);

		if (expected === undefined) {
			expectedName = name;
			expected = serialized;
		} else if (serialized !== expected) {
			throw new Error(
				`Output mismatch in "${label}":\n` +
					`  ${expectedName} => ${expected}\n` +
					`  ${name} => ${serialized}`
			);
		}
	}
};

// Adds a `<competitor> - <label>` task per competitor, after checking that they
// all produce the same output, so the benchmark compares equivalent work.
export const addComparison = <T>(
	bench: Bench,
	label: string,
	competitors: Record<string, Run<T>>
) => {
	const outputs: Record<string, T> = {};

	for (const [name, run] of Object.entries(competitors)) {
		outputs[name] = run();
		bench.add(`${name} - ${label}`, run);
	}

	assertSameOutput(label, outputs);
};