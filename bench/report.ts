import type { Bench } from 'tinybench';

type Align = 'left' | 'right';

type Column = {
	title: string;
	align: Align;
};

// One task's cells between the index and the relative speed, in column order,
// its case, and its throughput.
type ResultRow = {
	group: string;
	cells: string[];
	opsPerSec: number;
};

// Box-drawing characters for one horizontal border of the table.
type Border = {
	left: string;
	middle: string;
	right: string;
};

const columns: readonly Column[] = [
	{ title: '(index)', align: 'left' },
	{ title: 'Task', align: 'left' },
	{ title: 'ops/sec', align: 'right' },
	{ title: 'Mean (ns)', align: 'right' },
	{ title: 'Margin', align: 'right' },
	{ title: 'Relative', align: 'right' }
];

const topBorder: Border = { left: '┌', middle: '┬', right: '┐' };
const innerBorder: Border = { left: '├', middle: '┼', right: '┤' };
const bottomBorder: Border = { left: '└', middle: '┴', right: '┘' };

// Task names are `<competitor> - <case>`; the case groups the rows.
const getGroup = (taskName: string): string =>
	taskName.slice(taskName.lastIndexOf(' - ') + 3);

const pad = (value: string, width: number, align: Align): string => {
	if (align === 'right') {
		return value.padStart(width);
	}

	return value.padEnd(width);
};

const formatBorder = (widths: readonly number[], border: Border): string =>
	border.left +
	widths.map((width) => '─'.repeat(width + 2)).join(border.middle) +
	border.right;

const formatRow = (widths: readonly number[], cells: readonly string[]) =>
	`│ ${cells
		.map((cell, index) => {
			const column = columns[index];
			const width = widths[index];

			if (column === undefined || width === undefined) {
				return cell;
			}

			return pad(cell, width, column.align);
		})
		.join(' │ ')} │`;

const getResultRows = (bench: Bench): ResultRow[] =>
	bench.tasks.flatMap((task): ResultRow[] => {
		const { result } = task;

		if (result.state !== 'completed') {
			return [];
		}

		const { latency, throughput } = result;

		return [
			{
				group: getGroup(task.name),
				opsPerSec: throughput.mean,
				cells: [
					task.name,
					Math.round(throughput.mean).toLocaleString(),
					Math.round(latency.mean * 1_000_000).toString(),
					`\xb1${latency.rme.toFixed(2)}%`
				]
			}
		];
	});

// Prints the results as a table, with a separator between the rows of each
// benchmarked case.
export function printBenchResults(bench: Bench): void {
	const resultRows = getResultRows(bench);
	const slowestByGroup = new Map<string, number>();

	for (const { group, opsPerSec } of resultRows) {
		const slowest = slowestByGroup.get(group) ?? opsPerSec;

		slowestByGroup.set(group, Math.min(slowest, opsPerSec));
	}

	// Speed relative to the slowest task of the same case, which shows x1.00.
	const rows = resultRows.map((row, index) => {
		const slowest = slowestByGroup.get(row.group) ?? row.opsPerSec;

		return {
			group: row.group,
			cells: [
				index.toString(),
				...row.cells,
				`x${(row.opsPerSec / slowest).toFixed(2)}`
			]
		};
	});

	const widths = columns.map((column, index) =>
		Math.max(
			column.title.length,
			...rows.map((row) => row.cells[index]?.length ?? 0)
		)
	);

	const lines = [
		formatBorder(widths, topBorder),
		formatRow(
			widths,
			columns.map((column) => column.title)
		),
		formatBorder(widths, innerBorder)
	];

	rows.forEach((row, index) => {
		if (index > 0 && row.group !== rows[index - 1]?.group) {
			lines.push(formatBorder(widths, innerBorder));
		}

		lines.push(formatRow(widths, row.cells));
	});

	lines.push(formatBorder(widths, bottomBorder));

	console.log(`\n\n${lines.join('\n')}`);
}