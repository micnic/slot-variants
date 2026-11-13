import { readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import type { Linter, Rule, Scope } from 'eslint';
import type { Program } from 'estree';
import {
	type Component,
	DEFAULT_EXPORT,
	resolveComponentBinding
} from './components.ts';
import { getOrCreate } from '../map-utils.ts';
import { createForwardingScan, type ForwardedStyles } from './forwarding.ts';
import { collectExportTable, type ExportTarget } from './module-exports.ts';
import { type AliasMap, resolveModulePath } from './module-paths.ts';

/**
 * One place an export name leads: a component of the module, already resolved
 * to the classes it forwards, or a name to look up in another module.
 */
type ExportStep =
	| { kind: 'styles'; styles: ForwardedStyles }
	| { kind: 'forward'; specifier: string; name: string };

/**
 * What one imported module contributes, resolved while it's analyzed so the
 * cache holds no AST: each export name's steps, most direct first, the
 * `export * from` sources tried after them, and the classes a single-file
 * component forwards as the module itself.
 */
type ModuleAnalysis = {
	exports: ReadonlyMap<string, ReadonlyArray<ExportStep>>;
	starSources: ReadonlyArray<string>;
	self: ForwardedStyles | null;
};

type ModuleScan = {
	ast: Program;
	moduleScope: Scope.Scope;
	forwarded: ReadonlyMap<Component, ForwardedStyles>;
};

type LinterConstructor = new (options: { cwd: string }) => Linter;

// A plain object rather than a `let`, so the assignment made inside the nested
// lint run is visible to the caller's control flow.
type Collected = { analysis: ModuleAnalysis | null };

// A module is parsed with its importer's language options, or as a plain
// script where that fails, so those options are part of what makes an entry
// valid: ones that can't read the module (a JSX page importing a `.vue` file,
// or a Vue page with no TypeScript parser importing a `lang="ts"` one) must
// not hand their failure to ones that can. ESLint shares one options object
// between the files a config's blocks match alike, so its identity tells them
// apart.
type CacheEntry = {
	mtimeMs: number;
	languageOptions: Linter.LanguageOptions;
	analysis: ModuleAnalysis | null;
};

/** Everything cross-file resolution needs from the rule's context. */
export type ModuleContext = {
	aliases: AliasMap;
	cwd: string;
	languageOptions: Linter.LanguageOptions;
};

// `eslint` is an optional peer dependency, so it is resolved on use from the
// project being linted rather than imported at load time — under a host that
// doesn't ship it (oxlint), cross-file resolution simply stays off instead of
// breaking the whole plugin. Resolved once per directory, since packages of a
// monorepo may each install their own.
const linterConstructors = new Map<string, LinterConstructor | null>();

// `**/*.*` matches any file with an extension, which every resolved module
// path has — a bare `**/*` is treated as a universal pattern and matches
// nothing on its own. The nested run is rooted at the module's own directory,
// since a flat config never matches a path outside its base directory and an
// imported module can sit anywhere.
const FILE_PATTERN = ['**/*.*'];

// typescript-eslint's switches for type-aware parsing. An imported module is
// only read for its syntax, and a type-aware parse both costs a TypeScript
// program and fails outright for a module the project doesn't contain.
const TYPE_AWARE_PARSER_OPTIONS = new Set([
	'project',
	'projectService',
	'programs'
]);

// Bounded so a long-lived editor session can't accumulate every module it has
// ever seen. Eviction is FIFO — a hit is a plain `get`, with no reordering.
const MAX_CACHED_MODULES = 200;

const moduleCache = new Map<string, CacheEntry>();

// How many re-exports deep an import is followed: enough to walk a barrel or
// two without following a pathological chain. Sibling `export *` entries of
// one barrel are the same depth, however many it has.
const MAX_MODULE_HOPS = 10;

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

const findLinterConstructor = (
	directory: string,
	cwd: string
): LinterConstructor | null => {
	let loaded: LinterConstructor | null = null;

	for (const base of [directory, cwd, process.cwd()]) {
		loaded = loadLinterFrom(base);

		if (loaded !== null) {
			break;
		}
	}

	return loaded;
};

/**
 * ESLint's own `Linter`, reached from the module's directory, then the working
 * directory, then the process's. Walking up from the module first is what makes
 * a monorepo package with its own `node_modules` resolve its own ESLint, and
 * the process's own directory is where the running ESLint must live — so a
 * directory that finds none is remembered too.
 */
const getLinterConstructor = (
	fromFile: string,
	cwd: string
): LinterConstructor | null =>
	getOrCreate(linterConstructors, `${dirname(fromFile)}\0${cwd}`, () =>
		findLinterConstructor(dirname(fromFile), cwd)
	);

// Where one export target leads, or null when it reaches no component that
// forwards a class prop. A local name is a function declared in the module,
// or a binding it imported and re-exports — followed on to that module.
const toStylesStep = (
	component: Component,
	forwarded: ReadonlyMap<Component, ForwardedStyles>
): ExportStep | null => {
	const styles = forwarded.get(component);

	if (styles === undefined) {
		return null;
	}

	return { kind: 'styles', styles };
};

// Where one export target leads, or null when it reaches no component that
// forwards a class prop. A local name is a function declared in the module,
// or a binding it imported and re-exports — followed on to that module.
const toExportStep = (
	target: ExportTarget,
	{ moduleScope, forwarded }: ModuleScan
): ExportStep | null => {
	if (target.kind === 'forward') {
		return target;
	}

	if (target.kind === 'node') {
		return toStylesStep(target.node, forwarded);
	}

	const binding = resolveComponentBinding(target.name, moduleScope);

	if (binding === null) {
		return null;
	}

	if (binding.kind === 'local') {
		return toStylesStep(binding.fn, forwarded);
	}

	return {
		kind: 'forward',
		specifier: binding.source.specifier,
		name: binding.source.exportName
	};
};

const analyzeScan = (scan: ModuleScan): ModuleAnalysis => {
	const { named, starSources } = collectExportTable(scan.ast);
	const exports = new Map<string, ExportStep[]>();

	for (const [name, targets] of named) {
		const steps: ExportStep[] = [];

		for (const target of targets) {
			const step = toExportStep(target, scan);

			if (step !== null) {
				steps.push(step);
			}
		}

		exports.set(name, steps);
	}

	return {
		exports,
		starSources,
		self: scan.forwarded.get(scan.ast) ?? null
	};
};

const createCollector = (collected: Collected): Rule.RuleModule => ({
	create(context) {
		const scan = createForwardingScan(context, {
			onExit() {
				collected.analysis = analyzeScan({
					ast: context.sourceCode.ast,
					moduleScope: scan.moduleScope(),
					forwarded: scan.forwarded
				});
			}
		});

		return scan.listener;
	}
});

// The importer's options, minus what reading a module's syntax can't take:
// the type-aware parser options, and the `env` oxlint adds, which ESLint's
// flat config rejects.
const toSyntaxOnly = (
	languageOptions: Linter.LanguageOptions
): Linter.LanguageOptions => {
	const { env: _env, ...rest } = languageOptions;
	const parserOptions: Linter.ParserOptions = {};

	for (const [key, value] of Object.entries({
		...languageOptions.parserOptions
	})) {
		if (!TYPE_AWARE_PARSER_OPTIONS.has(key)) {
			parserOptions[key] = value;
		}
	}

	return { ...rest, parserOptions };
};

const isParser = (
	value: Linter.ParserOptions[string]
): value is Linter.Parser =>
	typeof value === 'object' &&
	value !== null &&
	(typeof value.parse === 'function' ||
		typeof value.parseForESLint === 'function');

/**
 * The options a module is read with as a plain script, for one its importer's
 * parser can't read — a `.ts` barrel imported from a Svelte component. A
 * single-file-component parser takes its script parser as
 * `parserOptions.parser`; without one (or with a per-language map of them),
 * ESLint's default parser is used — the importer's own one may be that
 * already, in which case the module fails once more, and the cached result
 * keeps it from being read again.
 */
const toScriptOptions = (
	languageOptions: Linter.LanguageOptions
): Linter.LanguageOptions => {
	const { parser: scriptParser, ...parserOptions } = {
		...languageOptions.parserOptions
	};
	const { parser: _parser, ...rest } = languageOptions;

	if (isParser(scriptParser)) {
		return { ...rest, parser: scriptParser, parserOptions };
	}

	return { ...rest, parserOptions };
};

const collectModule = (
	LinterClass: LinterConstructor,
	path: string,
	text: string,
	languageOptions: Linter.LanguageOptions
): ModuleAnalysis | null => {
	const collected: Collected = { analysis: null };

	new LinterClass({ cwd: dirname(path) }).verify(
		text,
		[
			{
				files: FILE_PATTERN,
				languageOptions: toSyntaxOnly(languageOptions),
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

	return collected.analysis;
};

const analyzeModule = (
	path: string,
	cwd: string,
	languageOptions: Linter.LanguageOptions
): ModuleAnalysis | null => {
	const LinterClass = getLinterConstructor(path, cwd);

	/* c8 ignore next 3 -- eslint is present whenever this plugin runs */
	if (LinterClass === null) {
		return null;
	}

	try {
		const text = readFileSync(path, 'utf8');
		const analysis = collectModule(
			LinterClass,
			path,
			text,
			languageOptions
		);

		if (analysis !== null) {
			return analysis;
		}

		// A parse failure leaves nothing collected: the module may be a
		// plain script the importer's parser doesn't read
		return collectModule(
			LinterClass,
			path,
			text,
			toScriptOptions(languageOptions)
		);
		/* c8 ignore next 6 -- a parse failure is reported, not thrown; this
		   catches an I/O race (the file vanishing between stat and read) and a
		   host parser that throws instead of reporting */
	} catch {
		return null;
	}
};

const loadModule = (
	path: string,
	cwd: string,
	languageOptions: Linter.LanguageOptions
): ModuleAnalysis | null => {
	let mtimeMs: number;

	try {
		mtimeMs = statSync(path).mtimeMs;
		/* c8 ignore next 3 -- the path came from a successful stat already */
	} catch {
		return null;
	}

	const cached = moduleCache.get(path);

	if (
		cached &&
		cached.mtimeMs === mtimeMs &&
		cached.languageOptions === languageOptions
	) {
		return cached.analysis;
	}

	const analysis = analyzeModule(path, cwd, languageOptions);

	// A stale entry is replaced rather than counted, and requeued as the newest
	moduleCache.delete(path);

	if (moduleCache.size >= MAX_CACHED_MODULES) {
		const oldest = moduleCache.keys().next().value;

		// Always set, as the map is full; the check narrows the type
		if (oldest !== undefined) {
			moduleCache.delete(oldest);
		}
	}

	moduleCache.set(path, { mtimeMs, languageOptions, analysis });

	return analysis;
};

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
	seen: Set<string>,
	depth: number
): ForwardedStyles | null => {
	if (depth >= MAX_MODULE_HOPS) {
		return null;
	}

	const path = resolveModulePath(specifier, fromFile, moduleContext.aliases);

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

	const follow = (specifier: string, name: string) =>
		resolveImportedComponent(
			specifier,
			name,
			path,
			moduleContext,
			seen,
			depth + 1
		);

	for (const step of analysis.exports.get(exportName) ?? []) {
		if (step.kind === 'styles') {
			return step.styles;
		}

		const found = follow(step.specifier, step.name);

		if (found !== null) {
			return found;
		}
	}

	for (const specifier of analysis.starSources) {
		const found = follow(specifier, exportName);

		if (found !== null) {
			return found;
		}
	}

	// A single-file component (Svelte, Vue) declares no export of its own: the
	// module itself is what a default import receives.
	if (exportName === DEFAULT_EXPORT) {
		return analysis.self;
	}

	return null;
};