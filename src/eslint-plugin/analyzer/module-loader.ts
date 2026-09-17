import { readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import type { Linter, Rule, Scope } from 'eslint';
import type { ImportDeclaration, Program } from 'estree';
import {
	type ComponentFunction,
	type ForwardedStyles,
	resolveComponentFunction
} from './components.ts';
import { createForwardingScan } from './forwarding.ts';
import { findExportTargets } from './module-exports.ts';
import { type AliasMap, resolveModulePath } from './module-paths.ts';

/** What one imported module contributes: its components and their configs. */
export type ModuleAnalysis = {
	ast: Program;
	moduleScope: Scope.Scope;
	forwarded: Map<ComponentFunction, ForwardedStyles>;
};

type LinterConstructor = new (options: { cwd: string }) => Linter;

// `eslint` is an optional peer dependency, so it is resolved on first use from
// the project being linted rather than imported at load time — under a host
// that doesn't ship it (oxlint), cross-file resolution simply stays off
// instead of breaking the whole plugin.
let linterConstructor: LinterConstructor | null | undefined;

const loadLinterFrom = (base: string): LinterConstructor | null => {
	try {
		const required = createRequire(resolve(base, 'slot-variants.js'));
		const loaded = required('eslint');

		/* c8 ignore next 3 -- the eslint package always exports Linter */
		if (typeof loaded?.Linter !== 'function') {
			return null;
		}

		return loaded.Linter;
	} catch {
		return null;
	}
};

/**
 * ESLint's own `Linter`, reached from the file being linted, then the working
 * directory, then the process's. Walking up from the linted file first is what
 * makes a monorepo package with its own `node_modules` resolve correctly, and
 * the process's own directory is where the running ESLint must live — so a
 * failure across all three is permanent and worth remembering.
 */
const getLinterConstructor = (
	fromFile: string,
	cwd: string
): LinterConstructor | null => {
	if (linterConstructor !== undefined) {
		return linterConstructor;
	}

	linterConstructor = null;

	for (const base of [dirname(fromFile), cwd, process.cwd()]) {
		const loaded = loadLinterFrom(base);

		if (loaded !== null) {
			linterConstructor = loaded;

			break;
		}
	}

	return linterConstructor;
};

// A plain object rather than a `let`, so the assignment made inside the nested
// lint run is visible to the caller's control flow.
type Collected = { analysis: ModuleAnalysis | null };

const createCollector = (collected: Collected): Rule.RuleModule => ({
	create(context) {
		const scan = createForwardingScan(context);

		return {
			ImportDeclaration(node: ImportDeclaration) {
				scan.importsTracker(node);
			},
			':function'(node: Rule.Node) {
				scan.enterFunction(node);
			},
			':function:exit'() {
				scan.exitFunction();
			},
			CallExpression(node) {
				scan.visitCall(node);
			},
			'Program:exit'() {
				collected.analysis = {
					ast: context.sourceCode.ast,
					moduleScope: scan.moduleScope(),
					forwarded: scan.forwarded
				};
			}
		};
	}
});

// `**/*.*` matches any file with an extension, which every resolved module
// path has — a bare `**/*` is treated as a universal pattern and matches
// nothing on its own. The nested run is rooted at the module's own directory,
// since a flat config never matches a path outside its base directory and an
// imported module can sit anywhere.
const FILE_PATTERN = ['**/*.*'];

const analyzeModule = (
	path: string,
	cwd: string,
	languageOptions: Linter.LanguageOptions
): ModuleAnalysis | null => {
	const LinterClass = getLinterConstructor(path, cwd);

	/* c8 ignore next 3 -- eslint is present whenever this plugin runs under it */
	if (LinterClass === null) {
		return null;
	}

	const collected: Collected = { analysis: null };

	try {
		const text = readFileSync(path, 'utf8');

		new LinterClass({ cwd: dirname(path) }).verify(
			text,
			[
				{
					files: FILE_PATTERN,
					languageOptions,
					plugins: {
						'slot-variants-internal': {
							rules: { collect: createCollector(collected) }
						}
					},
					rules: { 'slot-variants-internal/collect': 'error' }
				}
			],
			path
		);
		/* c8 ignore next 6 -- a parse failure is reported, not thrown; this
		   catches an I/O race (the file vanishing between stat and read) and a
		   host parser that throws instead of reporting */
	} catch {
		return null;
	}

	return collected.analysis;
};

type CacheEntry = { mtimeMs: number; analysis: ModuleAnalysis | null };

// Bounded so a long-lived editor session can't accumulate every module it has
// ever seen. Eviction is FIFO — a hit is a plain `get`, with no reordering.
const MAX_CACHED_MODULES = 200;

const moduleCache = new Map<string, CacheEntry>();

const getModifiedTime = (path: string): number | null => {
	try {
		return statSync(path).mtimeMs;
		/* c8 ignore next 3 -- the path came from a successful stat already */
	} catch {
		return null;
	}
};

const loadModule = (
	path: string,
	cwd: string,
	languageOptions: Linter.LanguageOptions
): ModuleAnalysis | null => {
	const mtimeMs = getModifiedTime(path);

	/* c8 ignore next 3 -- the path came from a successful stat already */
	if (mtimeMs === null) {
		return null;
	}

	const cached = moduleCache.get(path);

	if (cached && cached.mtimeMs === mtimeMs) {
		return cached.analysis;
	}

	const analysis = analyzeModule(path, cwd, languageOptions);

	if (moduleCache.size >= MAX_CACHED_MODULES) {
		const oldest = moduleCache.keys().next().value;

		/* c8 ignore next 3 -- a non-empty map always yields a first key */
		if (oldest !== undefined) {
			moduleCache.delete(oldest);
		}
	}

	moduleCache.set(path, { mtimeMs, analysis });

	return analysis;
};

/** Everything cross-file resolution needs from the rule's context. */
export type ModuleContext = {
	aliases: AliasMap;
	cwd: string;
	languageOptions: Linter.LanguageOptions;
};

// Enough to walk a barrel or two without following a pathological chain.
const MAX_MODULE_HOPS = 10;

/**
 * The component an import names, followed through re-exports and barrel files.
 * Null when the module can't be resolved or read, when the export doesn't
 * lead to a function, or when that function forwards no class prop.
 */
export const resolveImportedComponent = (
	specifier: string,
	exportName: string,
	fromFile: string,
	moduleContext: ModuleContext,
	seen: Set<string>
): ForwardedStyles | null => {
	if (seen.size >= MAX_MODULE_HOPS) {
		return null;
	}

	const path = resolveModulePath(
		specifier,
		fromFile,
		moduleContext.aliases,
		moduleContext.cwd
	);

	if (path === null) {
		return null;
	}

	const key = `${path}|${exportName}`;

	if (seen.has(key)) {
		return null;
	}

	seen.add(key);

	const analysis = loadModule(
		path,
		moduleContext.cwd,
		moduleContext.languageOptions
	);

	if (analysis === null) {
		return null;
	}

	for (const target of findExportTargets(analysis.ast, exportName)) {
		const found = followExportTarget(
			target,
			analysis,
			path,
			moduleContext,
			seen
		);

		if (found !== null) {
			return found;
		}
	}

	return null;
};

const followExportTarget = (
	target: ReturnType<typeof findExportTargets>[number],
	analysis: ModuleAnalysis,
	path: string,
	moduleContext: ModuleContext,
	seen: Set<string>
): ForwardedStyles | null => {
	if (target.kind === 'forward') {
		return resolveImportedComponent(
			target.specifier,
			target.name,
			path,
			moduleContext,
			seen
		);
	}

	if (target.kind === 'node') {
		return analysis.forwarded.get(target.node) ?? null;
	}

	const fn = resolveComponentFunction(target.name, analysis.moduleScope);

	if (fn === null) {
		return null;
	}

	return analysis.forwarded.get(fn) ?? null;
};