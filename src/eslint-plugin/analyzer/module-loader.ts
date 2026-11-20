import { readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import type { Linter, Rule } from 'eslint';
import type { Node } from 'estree';
import { getOrCreate } from '../map-utils.ts';
import type { ImportedFactory } from './call-matching.ts';
import { type Component, resolveComponentBinding } from './components.ts';
import {
	findSingleBinding,
	getConstDefInit,
	isTransparentWrapper
} from './const-bindings.ts';
import {
	createForwardingScan,
	type ForwardedStyles,
	type ModuleScan
} from './forwarding.ts';
import { collectExportTable, type ExportTarget } from './module-exports.ts';
import {
	type AliasMap,
	buildAliasMap,
	type ModuleFile,
	resolveModulePath
} from './module-paths.ts';
import { DEFAULT_EXPORT } from './module-syntax.ts';
import { getDefaultKeys, type StyledContext } from './styled-values.ts';

/**
 * One place an export name leads: a component of the module, already resolved
 * to the classes it forwards, a `createSV()` factory, or a name to look up in
 * another module.
 */
type ExportStep =
	| { kind: 'styles'; styles: ForwardedStyles }
	| { kind: 'factory'; factory: ImportedFactory }
	| { kind: 'forward'; specifier: string; name: string };

// What an import is resolved to: the step of the module declaring it that
// answers, or the module itself as a single-file component.
type ExportReader<T> = {
	step: (step: ExportStep) => T | null;
	self: (analysis: ModuleAnalysis) => T | null;
};

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

type DiskModule = { mtimeMs: number; text: string };

type LinterConstructor = new (options: { cwd: string }) => Linter;

// A plain object rather than a `let`, so the assignment made inside the nested
// lint run is visible to the caller's control flow.
type Collected = { analysis: ModuleAnalysis | null };

type CacheEntry = { mtimeMs: number; analysis: ModuleAnalysis | null };

/** Everything cross-file resolution needs from the rule's context. */
export type ModuleContext = {
	aliases: AliasMap;
	cwd: string;
	languageOptions: Linter.LanguageOptions;
};

type SettingsRecord = Readonly<Record<string, unknown>>;

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

// Keyed by path and the importer's language options. A module is parsed with
// those options, or as a plain script where that fails, so ones that can't
// read the module (a JSX page importing a `.vue` file, or a Vue page with no
// TypeScript parser importing a `lang="ts"` one) must not hand their failure
// to ones that can, and config blocks with different options each keep their
// own entry rather than evicting each other's. ESLint shares one options
// object between the files a config's blocks match alike, so its identity
// tells them apart.
const moduleCache = new Map<string, CacheEntry>();

// An id for each language options object a cache key names.
const languageOptionsIds = new WeakMap<Linter.LanguageOptions, number>();

// The plugin's key in ESLint's shared `settings`.
const SETTINGS_KEY = 'slot-variants';

// The paths whose analysis is under way, so modules importing each other
// read as unknown rather than analyzing each other forever.
const loadingModules = new Set<string>();

// The context of the module analysis under way, read by the rules a nested
// lint run creates. ESLint copies `languageOptions` for each run, so the
// modules that run follows in turn are loaded under the importer's context
// instead, sharing its cache entries.
let nestedContext: ModuleContext | null = null;

let nextLanguageOptionsId = 0;

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
): LinterConstructor | null => {
	const directory = dirname(fromFile);

	return getOrCreate(linterConstructors, `${directory}\0${cwd}`, () =>
		findLinterConstructor(directory, cwd)
	);
};

const isSettingsRecord = (value: unknown): value is SettingsRecord =>
	typeof value === 'object' && value !== null;

// The string targets of the `alias` map in the plugin's shared settings
// (`settings: { 'slot-variants': { alias } }`).
const readAliasSetting = (
	settings: SettingsRecord
): Record<string, string> | undefined => {
	const shared = settings[SETTINGS_KEY];

	if (!isSettingsRecord(shared) || !isSettingsRecord(shared.alias)) {
		return undefined;
	}

	const aliases: Record<string, string> = {};

	for (const [prefix, target] of Object.entries(shared.alias)) {
		if (typeof target === 'string') {
			aliases[prefix] = target;
		}
	}

	return aliases;
};

/**
 * What following a file's imports needs: the importer's context in a nested
 * run analyzing an imported module, or else the rule's own, with `alias` (a
 * rule option) in place of the shared setting's aliases when given.
 */
export const getModuleContext = (
	context: Rule.RuleContext,
	alias?: Record<string, string>
): ModuleContext => {
	if (nestedContext !== null) {
		return nestedContext;
	}

	return {
		aliases: buildAliasMap(
			alias ?? readAliasSetting(context.settings),
			context.cwd
		),
		cwd: context.cwd,
		languageOptions: context.languageOptions
	};
};

// The `createSV()` factory `node` is, read through `const` bindings and
// type-only wrappers, or null for anything else.
const readFactory = (
	node: Node,
	ctx: StyledContext
): ImportedFactory | null => {
	const call = ctx.resolve(node);

	if (
		call.type !== 'CallExpression' ||
		!ctx.matchCall(call)?.isFactoryConfig
	) {
		return null;
	}

	return { defaultKeys: getDefaultKeys(call, ctx) };
};

// The factory a module-scope `const` holds, or null when it holds none.
const readFactoryBinding = (
	name: string,
	{ moduleScope, ctx }: ModuleScan
): ExportStep | null => {
	const binding = findSingleBinding(moduleScope, name);

	if (binding === null) {
		return null;
	}

	const init = getConstDefInit(binding.def);

	if (!init) {
		return null;
	}

	const factory = readFactory(init, ctx);

	if (factory === null) {
		return null;
	}

	return { kind: 'factory', factory };
};

// The step for a component that forwards its class prop, or null when it
// forwards none.
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
	scan: ModuleScan
): ExportStep | null => {
	const { moduleScope, forwarded } = scan;

	if (target.kind === 'forward') {
		return target;
	}

	if (target.kind === 'node') {
		return toStylesStep(target.node, forwarded);
	}

	const factory = readFactoryBinding(target.name, scan);

	if (factory !== null) {
		return factory;
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

// The factory an anonymous default export is (`export default createSV()`),
// which names no binding to look up.
const readDefaultFactory = ({ ast, ctx }: ModuleScan): ExportStep | null => {
	for (const node of ast.body) {
		if (node.type !== 'ExportDefaultDeclaration') {
			continue;
		}

		const { declaration } = node;

		if (
			declaration.type !== 'CallExpression' &&
			!isTransparentWrapper(declaration)
		) {
			return null;
		}

		const factory = readFactory(declaration, ctx);

		if (factory === null) {
			return null;
		}

		return { kind: 'factory', factory };
	}

	return null;
};

const analyzeScan = (scan: ModuleScan): ModuleAnalysis => {
	const { named, starSources } = collectExportTable(scan.ast);
	const exports = new Map<string, ExportStep[]>();
	const defaultFactory = readDefaultFactory(scan);

	if (defaultFactory !== null) {
		exports.set(DEFAULT_EXPORT, [defaultFactory]);
	}

	for (const [name, targets] of named) {
		const steps: ExportStep[] = [];

		for (const target of targets) {
			const step = toExportStep(target, scan);

			if (step !== null) {
				steps.push(step);
			}
		}

		exports.set(name, [...(exports.get(name) ?? []), ...steps]);
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
			onExit(moduleScan) {
				collected.analysis = analyzeScan(moduleScan);
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
	languageOptions: Linter.LanguageOptions,
	moduleContext: ModuleContext
): ModuleAnalysis | null => {
	const collected: Collected = { analysis: null };
	const outerContext = nestedContext;

	nestedContext = moduleContext;

	try {
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
	} finally {
		nestedContext = outerContext;
	}

	return collected.analysis;
};

const analyzeModule = (
	path: string,
	moduleContext: ModuleContext
): ModuleAnalysis | null => {
	const { cwd, languageOptions } = moduleContext;
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
			languageOptions,
			moduleContext
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
			toScriptOptions(languageOptions),
			moduleContext
		);
		/* c8 ignore next 6 -- a parse failure is reported, not thrown; this
		   catches an I/O race (the file vanishing between stat and read) and a
		   host parser that throws instead of reporting */
	} catch {
		return null;
	}
};

const getCacheKey = (
	path: string,
	languageOptions: Linter.LanguageOptions
): string => {
	const id = getOrCreate(languageOptionsIds, languageOptions, () => {
		const next = nextLanguageOptionsId;

		nextLanguageOptionsId += 1;

		return next;
	});

	return `${id}\0${path}`;
};

// A stale entry is replaced rather than counted, and requeued as the newest.
const storeModule = (key: string, entry: CacheEntry) => {
	moduleCache.delete(key);

	if (moduleCache.size >= MAX_CACHED_MODULES) {
		const oldest = moduleCache.keys().next().value;

		// Always set, as the map is full; the check narrows the type
		if (oldest !== undefined) {
			moduleCache.delete(oldest);
		}
	}

	moduleCache.set(key, entry);
};

const loadModule = (
	{ path, mtimeMs }: ModuleFile,
	moduleContext: ModuleContext
): ModuleAnalysis | null => {
	const key = getCacheKey(path, moduleContext.languageOptions);
	const cached = moduleCache.get(key);

	if (cached && cached.mtimeMs === mtimeMs) {
		return cached.analysis;
	}

	if (loadingModules.has(path)) {
		return null;
	}

	loadingModules.add(path);

	let analysis: ModuleAnalysis | null;

	try {
		analysis = analyzeModule(path, moduleContext);
	} finally {
		loadingModules.delete(path);
	}

	storeModule(key, { mtimeMs, analysis });

	return analysis;
};

// Whether a module leads an import anywhere: a component forwarding its class
// prop, a re-export, or itself as a single-file component.
const leadsAnywhere = (analysis: ModuleAnalysis) => {
	if (analysis.self !== null || analysis.starSources.length > 0) {
		return true;
	}

	for (const steps of analysis.exports.values()) {
		if (steps.length > 0) {
			return true;
		}
	}

	return false;
};

// The file's text and modification time on disk, or null when it can't be
// read (a path that names no file, like ESLint's `<text>` for stdin).
const readDiskModule = (path: string): DiskModule | null => {
	try {
		const { mtimeMs } = statSync(path);

		return { mtimeMs, text: readFileSync(path, 'utf8') };
	} catch {
		return null;
	}
};

/**
 * Caches the analysis of the file being linted, so a file importing it later
 * in the same run reads it from there instead of parsing it again. Only a
 * file that leads an import anywhere is worth the disk read, and only text
 * that is what the file holds on disk is cached — not an unsaved editor
 * buffer, a fix pass, or a processor's code block.
 */
export const cacheLintedModule = (
	context: Rule.RuleContext,
	scan: ModuleScan
) => {
	const analysis = analyzeScan(scan);

	if (!leadsAnywhere(analysis)) {
		return;
	}

	const path = context.physicalFilename;
	const disk = readDiskModule(path);

	if (disk === null || disk.text !== context.sourceCode.text) {
		return;
	}

	storeModule(getCacheKey(path, context.languageOptions), {
		mtimeMs: disk.mtimeMs,
		analysis
	});
};

// What an import names, followed through re-exports and barrel files to the
// module whose step `read` answers. Null when the module can't be resolved or
// read, or when no step answers.
const resolveImport = <T>(
	specifier: string,
	exportName: string,
	fromFile: string,
	moduleContext: ModuleContext,
	read: ExportReader<T>,
	seen: Set<string>,
	depth: number
): T | null => {
	if (depth >= MAX_MODULE_HOPS) {
		return null;
	}

	const file = resolveModulePath(specifier, fromFile, moduleContext.aliases);

	if (file === null) {
		return null;
	}

	const key = `${file.path}|${exportName}`;

	if (seen.has(key)) {
		return null;
	}

	seen.add(key);

	const analysis = loadModule(file, moduleContext);

	if (analysis === null) {
		return null;
	}

	const follow = (specifier: string, name: string) =>
		resolveImport(
			specifier,
			name,
			file.path,
			moduleContext,
			read,
			seen,
			depth + 1
		);

	for (const step of analysis.exports.get(exportName) ?? []) {
		if (step.kind !== 'forward') {
			const found = read.step(step);

			if (found !== null) {
				return found;
			}

			continue;
		}

		const found = follow(step.specifier, step.name);

		if (found !== null) {
			return found;
		}
	}

	// A single-file component (Svelte, Vue) declares no export of its own: the
	// module itself is what a default import receives. `export *` never
	// re-exports a default.
	if (exportName === DEFAULT_EXPORT) {
		return read.self(analysis);
	}

	// A name the module exports itself shadows every `export *` of it.
	if (analysis.exports.has(exportName)) {
		return null;
	}

	for (const specifier of analysis.starSources) {
		const found = follow(specifier, exportName);

		if (found !== null) {
			return found;
		}
	}

	return null;
};

const STYLES_READER: ExportReader<ForwardedStyles> = {
	step(step) {
		if (step.kind !== 'styles') {
			return null;
		}

		return step.styles;
	},
	self: (analysis) => analysis.self
};

const FACTORY_READER: ExportReader<ImportedFactory> = {
	step(step) {
		if (step.kind !== 'factory') {
			return null;
		}

		return step.factory;
	},
	self: () => null
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
	moduleContext: ModuleContext
): ForwardedStyles | null =>
	resolveImport(
		specifier,
		exportName,
		fromFile,
		moduleContext,
		STYLES_READER,
		new Set(),
		0
	);

/**
 * The `createSV()` factory an import names, followed through re-exports and
 * barrel files. Null when the module can't be resolved or read, or when the
 * export is no factory.
 */
export const resolveImportedFactory = (
	specifier: string,
	exportName: string,
	fromFile: string,
	moduleContext: ModuleContext
): ImportedFactory | null =>
	resolveImport(
		specifier,
		exportName,
		fromFile,
		moduleContext,
		FACTORY_READER,
		new Set(),
		0
	);