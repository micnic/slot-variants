import type { Bench } from 'tinybench';

type ResultRow = {
	Task: string;
	'ops/sec': string;
	'Mean (ns)': number;
	Margin: string;
};

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