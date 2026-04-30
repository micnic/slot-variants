import type { Bench } from 'tinybench';

type BenchTaskResult = {
	latency: {
		mean: number;
		rme: number;
	};
	throughput: {
		mean: number;
	};
};

export function printBenchResults(bench: Bench): void {
	console.log('\n');
	console.table(
		bench.tasks
			.filter((task) => task.result)
			.map((task) => {
				const { latency, throughput } = task.result as BenchTaskResult;

				return {
					'Task': task.name,
					'ops/sec': Math.round(throughput.mean).toLocaleString(),
					'Mean (ns)': Math.round(latency.mean * 1_000_000),
					'Margin': `\xb1${latency.rme.toFixed(2)}%`
				};
			})
	);
}