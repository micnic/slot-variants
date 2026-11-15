import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, type Options } from 'tsup';

type EsbuildPlugin = NonNullable<Options['esbuildPlugins']>[number];

type PackageVersion = { version: string };

const manifestPath = resolve('package.json');

const { version }: PackageVersion = JSON.parse(
	readFileSync(manifestPath, 'utf8')
);

// The plugin reads only `version` from the manifest, so the bundles get that
// field alone instead of the whole file, scripts and devDependencies included.
// Unbuilt, `src/` still imports the real file.
const packageVersionOnly: EsbuildPlugin = {
	name: 'package-version-only',
	setup(build) {
		build.onLoad({ filter: /package\.json$/ }, ({ path }) => {
			if (path !== manifestPath) {
				return undefined;
			}

			return { contents: JSON.stringify({ version }), loader: 'json' };
		});
	}
};

export default defineConfig({
	entry: ['src/index.ts', 'src/eslint-plugin.ts'],
	clean: true,
	tsconfig: 'tsconfig.build.json',
	dts: true,
	format: ['cjs', 'esm'],
	esbuildPlugins: [packageVersionOnly]
});