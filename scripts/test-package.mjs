import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const temporaryDirectory = mkdtempSync(
	join(tmpdir(), 'slot-variants-package-')
);
const npmCache = join(temporaryDirectory, 'npm-cache');
const environment = { ...process.env, npm_config_cache: npmCache };

// Each TypeScript the project tests against, by its own launcher: both packages
// install a `tsc` bin, so `node_modules/.bin/tsc` is whichever was linked last.
const compilers = [
	join(root, 'node_modules', 'typescript', 'bin', 'tsc'),
	join(root, 'node_modules', 'typescript7', 'bin', 'tsc')
];

// Each consumer file with the module setting it is checked under.
const typeChecks = [
	{ module: 'NodeNext', file: 'consumer.ts' },
	{ module: 'Node16', file: 'consumer-commonjs.cts' },
	{ module: 'NodeNext', file: 'consumer-undefined.ts' }
];

const run = (command, args, cwd = root) =>
	execFileSync(command, args, {
		cwd,
		env: environment,
		stdio: 'pipe',
		encoding: 'utf8'
	});

try {
	const packageReport = JSON.parse(
		run('npm', ['pack', '--json', '--pack-destination', temporaryDirectory])
	)[0];
	const publishedFiles = packageReport.files.map(({ path }) => path).sort();
	const expectedFiles = [
		'LICENSE',
		'README.md',
		'SKILL.md',
		'dist/eslint-plugin.cjs',
		'dist/eslint-plugin.d.cts',
		'dist/eslint-plugin.d.ts',
		'dist/eslint-plugin.js',
		'dist/index.cjs',
		'dist/index.d.cts',
		'dist/index.d.ts',
		'dist/index.js',
		'logo.svg',
		'package.json'
	];

	if (JSON.stringify(publishedFiles) !== JSON.stringify(expectedFiles)) {
		throw new Error(
			`Unexpected package contents:\n${publishedFiles.join('\n')}`
		);
	}

	const tarball = join(temporaryDirectory, packageReport.filename);
	const consumerDirectory = join(temporaryDirectory, 'consumer');
	mkdirSync(consumerDirectory);

	run(
		'npm',
		[
			'install',
			'--ignore-scripts',
			'--no-package-lock',
			'--no-save',
			tarball
		],
		consumerDirectory
	);

	writeFileSync(
		join(consumerDirectory, 'package.json'),
		JSON.stringify({ private: true, type: 'module' })
	);
	writeFileSync(
		join(consumerDirectory, 'esm.mjs'),
		"import { sv } from 'slot-variants';\nimport plugin from 'slot-variants/eslint-plugin';\nif (sv('a', 'b') !== 'a b' || !plugin.rules['no-conflicting-classes']) process.exit(1);\n"
	);
	writeFileSync(
		join(consumerDirectory, 'commonjs.cjs'),
		"const { sv } = require('slot-variants');\nconst plugin = require('slot-variants/eslint-plugin').default;\nif (sv('a', 'b') !== 'a b' || !plugin.rules['no-conflicting-classes']) process.exit(1);\n"
	);
	writeFileSync(
		join(consumerDirectory, 'consumer.ts'),
		"import { sv, type VariantProps } from 'slot-variants';\nimport plugin from 'slot-variants/eslint-plugin';\nconst button = sv({ slots: { icon: 'icon' }, variants: { size: { sm: 'sm', lg: 'lg' } } });\ntype Props = VariantProps<typeof button>;\nconst props: Props = { size: 'sm' };\nconst result = button(props);\n// @ts-expect-error slot results are readonly\nresult.icon = 'changed';\nvoid plugin.rules;\n"
	);
	// A CommonJS module resolves both entry points through `require`, so it
	// needs CommonJS declarations rather than the ESM ones.
	writeFileSync(
		join(consumerDirectory, 'consumer-commonjs.cts'),
		"import { sv, type VariantProps } from 'slot-variants';\nimport { rules } from 'slot-variants/eslint-plugin';\nconst button = sv({ variants: { size: { sm: 'sm', lg: 'lg' } } });\nconst props: VariantProps<typeof button> = { size: 'sm' };\nvoid button(props);\nvoid rules['no-conflicting-classes'];\n"
	);

	// Without `exactOptionalPropertyTypes`, as consumers often compile, an
	// explicit `undefined` sets nothing, so it can't satisfy a requirement.
	writeFileSync(
		join(consumerDirectory, 'consumer-undefined.ts'),
		[
			"import { sv } from 'slot-variants';",
			"const parent = sv({ variants: { size: { sm: 'sm' } }, requiredVariants: ['size'] });",
			'// @ts-expect-error an undefined default leaves size required',
			'void sv({ extend: parent, variants: {}, defaultVariants: { size: undefined } });',
			'// @ts-expect-error an undefined default sets nothing',
			"void sv({ variants: { size: { sm: 'sm' } }, defaultVariants: { size: undefined } });",
			"const button = sv({ variants: { size: { sm: 'sm' } }, requiredVariants: ['size'], presets: { empty: { size: undefined } } });",
			'// @ts-expect-error a preset setting size to undefined leaves it required',
			"void button({ preset: 'empty' });",
			"void button({ preset: 'empty', size: 'sm' });",
			"const preset = sv({ variants: { size: { sm: 'sm' } }, requiredVariants: ['size'], presets: { small: { size: 'sm' } } });",
			'const kept = sv({ extend: preset, variants: {}, presets: { small: { size: undefined } } });',
			"void kept({ preset: 'small' });",
			''
		].join('\n')
	);

	run('node', ['esm.mjs'], consumerDirectory);
	run('node', ['commonjs.cjs'], consumerDirectory);

	for (const compiler of compilers) {
		for (const { module, file } of typeChecks) {
			run(
				process.execPath,
				[
					compiler,
					'--noEmit',
					'--strict',
					'--skipLibCheck',
					'--target',
					'ES2022',
					'--module',
					module,
					'--moduleResolution',
					module,
					file
				],
				consumerDirectory
			);
		}
	}

	console.log(
		'Packed package passed ESM, CommonJS, plugin, type (TypeScript 6 and 7), and contents checks.'
	);
} finally {
	rmSync(temporaryDirectory, { recursive: true, force: true });
}