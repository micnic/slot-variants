import type { Bench } from 'tinybench';

type ResultRow = {
	Task: string;
	'ops/sec': string;
	'Mean (ns)': number;
	Margin: string;
};

// Asserts that every competitor in a group produced identical output for a
// given case, so the benchmark compares equivalent work. Throws on mismatch.
export function assertSameOutput<T>(
	label: string,
	outputs: Record<string, T>
): void {
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
}

export function printBenchResults(bench: Bench): void {
	console.log('\n');
	console.table(
		bench.tasks.flatMap((task): ResultRow[] => {
			const { result } = task;

			if (result.state !== 'completed') {
				return [];
			}

			const { latency, throughput } = result;

			return [
				{
					Task: task.name,
					'ops/sec': Math.round(throughput.mean).toLocaleString(),
					'Mean (ns)': Math.round(latency.mean * 1_000_000),
					Margin: `\xb1${latency.rme.toFixed(2)}%`
				}
			];
		})
	);
}