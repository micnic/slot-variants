import { statSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';

/** Prefix -> directory, as the `alias` rule option supplies it. */
export type AliasMap = ReadonlyMap<string, string>;

// Tried in order, so a `.ts` component wins over a stale `.js` build output
// sitting next to it.
const EXTENSIONS = [
	'.ts',
	'.tsx',
	'.mts',
	'.cts',
	'.js',
	'.jsx',
	'.mjs',
	'.cjs'
];

// TypeScript's ESM convention writes `./button.js` for a file that is really
// `./button.ts`, so a specifier that doesn't exist as written is retried with
// each source extension in place of its JavaScript one.
const REWRITABLE = new Map([
	['.js', ['.ts', '.tsx']],
	['.mjs', ['.mts']],
	['.cjs', ['.cts']],
	['.jsx', ['.tsx']]
]);

const isFile = (path: string): boolean => {
	try {
		return statSync(path).isFile();
	} catch {
		return false;
	}
};

const getExtension = (path: string): string => {
	const dot = path.lastIndexOf('.');
	const slash = path.lastIndexOf('/');

	if (dot <= slash + 1) {
		return '';
	}

	return path.slice(dot);
};

const withExtensions = (base: string): string | null => {
	for (const extension of EXTENSIONS) {
		const candidate = `${base}${extension}`;

		if (isFile(candidate)) {
			return candidate;
		}
	}

	return null;
};

const asDirectoryIndex = (base: string): string | null =>
	withExtensions(`${base}/index`);

// The file a resolved path points at: itself, the same path under a source
// extension, an extensionless path plus one, or a directory's index file.
const resolveFile = (base: string): string | null => {
	if (isFile(base)) {
		return base;
	}

	const extension = getExtension(base);
	const rewrites = REWRITABLE.get(extension);

	if (rewrites) {
		const stem = base.slice(0, -extension.length);

		for (const rewrite of rewrites) {
			const candidate = `${stem}${rewrite}`;

			if (isFile(candidate)) {
				return candidate;
			}
		}

		return null;
	}

	return withExtensions(base) ?? asDirectoryIndex(base);
};

const isRelative = (specifier: string): boolean =>
	specifier === '.' ||
	specifier === '..' ||
	specifier.startsWith('./') ||
	specifier.startsWith('../');

// The longest matching alias wins, so `@/ui/` can override a broader `@/`.
const applyAlias = (specifier: string, aliases: AliasMap): string | null => {
	let best: string | null = null;
	let bestPrefix = '';

	for (const [prefix, target] of aliases) {
		if (!specifier.startsWith(prefix) || prefix.length < bestPrefix.length) {
			continue;
		}

		bestPrefix = prefix;
		best = `${target}${specifier.slice(prefix.length)}`;
	}

	return best;
};

/**
 * The file a module specifier names, or null when it can't be resolved from
 * the filesystem: a bare package specifier with no matching alias, or a path
 * with no file behind it.
 */
export const resolveModulePath = (
	specifier: string,
	fromFile: string,
	aliases: AliasMap,
	cwd: string
): string | null => {
	if (isRelative(specifier)) {
		return resolveFile(resolve(dirname(fromFile), specifier));
	}

	if (isAbsolute(specifier)) {
		return resolveFile(specifier);
	}

	const aliased = applyAlias(specifier, aliases);

	if (aliased === null) {
		return null;
	}

	return resolveFile(resolve(cwd, aliased));
};

/** The `alias` option, with each target normalized against `cwd`. */
export const buildAliasMap = (
	option: Record<string, string> | undefined,
	cwd: string
): AliasMap => {
	const aliases = new Map<string, string>();

	if (!option) {
		return aliases;
	}

	for (const [prefix, target] of Object.entries(option)) {
		aliases.set(prefix, `${resolve(cwd, target)}/`);
	}

	return aliases;
};