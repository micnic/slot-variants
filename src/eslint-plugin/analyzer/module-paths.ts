import { statSync } from 'node:fs';
import { dirname, extname, isAbsolute, resolve } from 'node:path';

/** Prefix -> directory, as the `alias` rule option supplies it. */
export type AliasMap = ReadonlyMap<string, string>;

/** A resolved module file and when it last changed. */
export type ModuleFile = { path: string; mtimeMs: number };

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
// `./button.ts`, so such a specifier tries each source extension in place of
// its JavaScript one first, as TypeScript does, and only then the file as
// written, which may be stale build output.
const REWRITABLE = new Map([
	['.js', ['.ts', '.tsx']],
	['.mjs', ['.mts']],
	['.cjs', ['.cts']],
	['.jsx', ['.tsx']]
]);

// The file at `path`, or null for anything else. Most probes miss, and a miss
// that doesn't throw is several times cheaper. Other errors (a name too long,
// a symlink loop) still throw.
export const statFile = (path: string): ModuleFile | null => {
	try {
		const stats = statSync(path, { throwIfNoEntry: false });

		if (stats === undefined || !stats.isFile()) {
			return null;
		}

		return { path, mtimeMs: stats.mtimeMs };
	} catch {
		return null;
	}
};

// The first existing file among `stem` plus each extension, in order.
const findFile = (
	stem: string,
	extensions: ReadonlyArray<string>
): ModuleFile | null => {
	for (const extension of extensions) {
		const file = statFile(`${stem}${extension}`);

		if (file !== null) {
			return file;
		}
	}

	return null;
};

// The file a resolved path points at: a JavaScript path's source file under
// a source extension, itself, an extensionless path plus one, or a directory's
// index file.
const resolveFile = (base: string): ModuleFile | null => {
	const extension = extname(base);
	const rewrites = REWRITABLE.get(extension);

	if (rewrites) {
		const stem = base.slice(0, -extension.length);

		return findFile(stem, rewrites) ?? findFile(stem, [extension]);
	}

	return (
		statFile(base) ??
		findFile(base, EXTENSIONS) ??
		findFile(`${base}/index`, EXTENSIONS)
	);
};

// Whether a specifier can only name a directory, as Node reads it: `.`, `..`,
// or one ending in `/`, `/.` or `/..`, whose index file it then names.
const namesDirectory = (specifier: string): boolean =>
	specifier === '.' ||
	specifier === '..' ||
	specifier.endsWith('/') ||
	specifier.endsWith('/.') ||
	specifier.endsWith('/..');

// The file a specifier resolved to `base` names: a directory's index for one
// that can only name a directory, else any file `resolveFile` finds.
const resolveSpecifierFile = (
	specifier: string,
	base: string
): ModuleFile | null => {
	if (namesDirectory(specifier)) {
		return findFile(`${base}/index`, EXTENSIONS);
	}

	return resolveFile(base);
};

const isRelative = (specifier: string): boolean =>
	specifier === '.' ||
	specifier === '..' ||
	specifier.startsWith('./') ||
	specifier.startsWith('../');

// Whether an alias prefix matches a specifier: in full, or as whole path
// segments, so `ui` maps `ui/button` but not `uikit/button`. A prefix ending
// in `/` already ends a segment.
const matchesAlias = (specifier: string, prefix: string): boolean =>
	specifier.startsWith(prefix) &&
	(prefix.endsWith('/') ||
		specifier.length === prefix.length ||
		specifier.charAt(prefix.length) === '/');

// The longest matching alias wins, so `@/ui/` can override a broader `@/`.
const applyAlias = (specifier: string, aliases: AliasMap): string | null => {
	let best: string | null = null;
	let bestPrefix = '';

	for (const [prefix, target] of aliases) {
		if (
			!matchesAlias(specifier, prefix) ||
			prefix.length < bestPrefix.length
		) {
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
	aliases: AliasMap
): ModuleFile | null => {
	if (isRelative(specifier)) {
		return resolveSpecifierFile(
			specifier,
			resolve(dirname(fromFile), specifier)
		);
	}

	if (isAbsolute(specifier)) {
		return resolveSpecifierFile(specifier, specifier);
	}

	const aliased = applyAlias(specifier, aliases);

	if (aliased === null) {
		return null;
	}

	// Alias targets are already absolute; resolving only normalizes the path.
	return resolveSpecifierFile(specifier, resolve(aliased));
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