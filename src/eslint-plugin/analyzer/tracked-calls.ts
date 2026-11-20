import type { AST, Rule } from 'eslint';
import type {
	CallExpression,
	Identifier,
	ImportDeclaration,
	Node
} from 'estree';
import { getOrCreate } from '../map-utils.ts';
import {
	type CallMatch,
	type ImportedFactory,
	matchSvCall
} from './call-matching.ts';
import { getImportSource, type ImportSource } from './components.ts';
import { getDestructuredRead } from './const-bindings.ts';
import {
	getModuleContext,
	type ModuleContext,
	resolveImportedFactory
} from './module-loader.ts';
import { getExportName } from './module-syntax.ts';
import { createStyledContext, type StyledContext } from './styled-values.ts';

// The tracked export each named-import local stands for, the locals bound to
// a whole-module namespace import, and whether the file imports anything
// else, which may be a `createSV()` factory.
type TrackedNames = {
	exportByLocal: Map<string, string>;
	namespaceNames: Set<string>;
	hasOtherImports: boolean;
};

// Everything the classifier needs from the rule that owns it, with the
// factories its imports were found to be, each looked up once per file.
type MatchContext = {
	names: TrackedNames;
	ctx: StyledContext;
	filename: string;
	moduleContext: ModuleContext;
	factories: Map<string, ImportedFactory | null>;
};

const TRACKED_EXPORTS = new Set(['sv', 'cn', 'createSV']);

// Every rule classifies every call of a file, and the outcome depends only on
// the file's AST and scopes, which the rules share, so it is worked out once.
const matchedCalls = new WeakMap<CallExpression, CallMatch | null>();

// A tracked-name identifier could still be a local binding that shadows the
// import (e.g. a function parameter named `cn`), so confirm it resolves to
// an import binding.
const identifierResolvesToImport = (
	{ ctx }: MatchContext,
	identifier: Identifier
): boolean => {
	const variable = ctx.variableOf(identifier);

	// Bound by a Vue template (`v-for="cn in list"`), not by the import.
	if (variable === null) {
		return false;
	}

	return variable.defs.some((def) => def.type === 'ImportBinding');
};

// Whether `node` reads a tracked namespace import (`import * as SV`), itself
// or through same-file `const` aliases.
const isTrackedNamespace = (match: MatchContext, node: Node): boolean => {
	const resolved = match.ctx.resolve(node);

	return (
		resolved.type === 'Identifier' &&
		match.names.namespaceNames.has(resolved.name) &&
		identifierResolvesToImport(match, resolved)
	);
};

// The export a namespace member names — `SV.sv` for
// `import * as SV from 'slot-variants'`. Null when the callee isn't a member of
// a tracked namespace binding, including a computed one (`SV[name]`), whose
// export can't be read statically.
const resolveNamespaceExportName = (
	match: MatchContext,
	callee: Node
): string | null => {
	if (callee.type !== 'MemberExpression' || callee.computed) {
		return null;
	}

	const { object, property } = callee;

	if (property.type !== 'Identifier' || !isTrackedNamespace(match, object)) {
		return null;
	}

	return property.name;
};

// The export a name destructured off a tracked namespace import binds
// (`const { sv } = SV`), or null for any other name.
const resolveDestructuredExportName = (
	match: MatchContext,
	identifier: Identifier
): string | null => {
	const read = getDestructuredRead(identifier, match.ctx.sourceCode);

	if (read === null || !isTrackedNamespace(match, read.object)) {
		return null;
	}

	return read.key;
};

// The export a call names, as a namespace member (`SV.sv(…)`), a named import
// or a name destructured off a namespace, read through same-file `const`
// aliases (`const cx = cn; cx(…)`) and type-only wrappers (`(sv as F)(…)`).
// A callee bound to a `createSV(...)` call is a pre-configured `sv()`, so it
// names `sv` and its call sites are analyzed exactly like `sv()` calls.
// `visited` holds the calls already on the path, so a callee bound back to one
// of them (`const f = f()`) names nothing instead of recursing forever.
const resolveExportName = (
	match: MatchContext,
	node: CallExpression,
	visited: Set<CallExpression> = new Set()
): string | null => {
	if (visited.has(node)) {
		return null;
	}

	visited.add(node);

	const resolved = match.ctx.resolve(node.callee);
	const namespaceExport = resolveNamespaceExportName(match, resolved);

	if (namespaceExport !== null) {
		return namespaceExport;
	}

	// An alias-resolved identifier names an export only as a tracked named
	// import, not as a local binding shadowing one.
	if (resolved.type === 'Identifier') {
		const exportName = match.names.exportByLocal.get(resolved.name);

		if (
			exportName === undefined ||
			!identifierResolvesToImport(match, resolved)
		) {
			return resolveDestructuredExportName(match, resolved);
		}

		return exportName;
	}

	if (
		resolved.type === 'CallExpression' &&
		resolveExportName(match, resolved, visited) === 'createSV'
	) {
		return 'sv';
	}

	return null;
};

// The `createSV(defaults)` call itself: its sole argument is unambiguously the
// shared config. Unlike `sv()`, whose last arg might be a cn-style class list,
// any object argument here is the config — so a spread or computed key is
// reported as dynamic rather than gating the whole object out.
const matchFactoryCall = (
	match: MatchContext,
	node: CallExpression
): CallMatch => {
	const [defaults] = node.arguments;

	if (defaults) {
		const resolved = match.ctx.resolve(defaults);

		if (resolved.type === 'ObjectExpression') {
			return {
				config: resolved,
				args: [],
				isFactoryConfig: true,
				keepsLastArg: false
			};
		}
	}

	return {
		config: null,
		args: [],
		isFactoryConfig: true,
		keepsLastArg: false
	};
};

// The import a call's callee names, through same-file `const` aliases. Null
// for anything else, including a namespace import called as a whole.
const findCalleeImport = (
	{ ctx }: MatchContext,
	node: CallExpression
): ImportSource | null => {
	if (node.callee.type !== 'Identifier') {
		return null;
	}

	const resolved = ctx.resolve(node.callee);

	if (resolved.type !== 'Identifier') {
		return null;
	}

	const def = ctx.variableOf(resolved)?.defs[0];

	if (def === undefined || def.type !== 'ImportBinding') {
		return null;
	}

	return getImportSource(def);
};

// A call through a `createSV()` factory imported from another module, read as
// an `sv()` call. Only a call passing a config is followed to the module: a
// class list alone isn't worth loading one for.
const matchImportedFactoryCall = (
	match: MatchContext,
	node: CallExpression
): CallMatch | null => {
	const source = findCalleeImport(match, node);

	if (source === null) {
		return null;
	}

	const call = matchSvCall(node, match.ctx.sourceCode);

	if (call.config === null) {
		return null;
	}

	const { specifier, exportName } = source;
	const factory = getOrCreate(
		match.factories,
		`${specifier}|${exportName}`,
		() =>
			resolveImportedFactory(
				specifier,
				exportName,
				match.filename,
				match.moduleContext
			)
	);

	if (factory === null) {
		return null;
	}

	return { ...call, imported: factory };
};

// Classifies a call as sv/cn-style by the export its callee names: `sv` and
// `cn` use their own conventions, and `createSV` names the factory call that
// validates defaults. A call through an imported factory is an `sv()` call.
// Null for anything untracked.
const matchTrackedCall = (
	match: MatchContext,
	node: CallExpression
): CallMatch | null => {
	const exportName = resolveExportName(match, node);

	if (exportName === 'sv') {
		return matchSvCall(node, match.ctx.sourceCode);
	}

	if (exportName === 'cn') {
		return {
			config: null,
			args: node.arguments,
			isFactoryConfig: false,
			keepsLastArg: false
		};
	}

	if (exportName === 'createSV') {
		return matchFactoryCall(match, node);
	}

	return matchImportedFactoryCall(match, node);
};

// Every import of the file, read up front rather than as the traversal meets
// them: a Svelte component's markup may come before its `<script>`, whose
// statements sit in a body of the script element's own.
const collectImportDeclarations = (
	program: AST.Program
): ImportDeclaration[] => {
	const imports: ImportDeclaration[] = [];

	for (const node of program.body) {
		if (node.type === 'ImportDeclaration') {
			imports.push(node);
			continue;
		}

		if ('body' in node && Array.isArray(node.body)) {
			const statements: ReadonlyArray<Node> = node.body;

			for (const statement of statements) {
				if (statement.type === 'ImportDeclaration') {
					imports.push(statement);
				}
			}
		}
	}

	return imports;
};

// The local names the file's `slot-variants` imports give `sv`, `cn` and
// `createSV`, and the namespaces they can be reached through.
const collectTrackedNames = (program: AST.Program): TrackedNames => {
	const names: TrackedNames = {
		exportByLocal: new Map<string, string>(),
		namespaceNames: new Set<string>(),
		hasOtherImports: false
	};

	for (const node of collectImportDeclarations(program)) {
		if (node.source.value !== 'slot-variants') {
			names.hasOtherImports = true;
			continue;
		}

		for (const specifier of node.specifiers) {
			// `import * as SV` reaches every export through one local binding,
			// so the export being called is only known at the call site.
			if (specifier.type === 'ImportNamespaceSpecifier') {
				names.namespaceNames.add(specifier.local.name);
				continue;
			}

			if (specifier.type !== 'ImportSpecifier') {
				continue;
			}

			const importedName = getExportName(specifier.imported);

			if (TRACKED_EXPORTS.has(importedName)) {
				names.exportByLocal.set(specifier.local.name, importedName);
			}
		}
	}

	return names;
};

// An on-demand classifier, for rules that need to ask whether an arbitrary call
// is a tracked sv/cn call outside a CallExpression visitor (`no-restyle`
// resolves callees and class-list parts that way). The file's imports are read
// before any call is classified.
export const createTrackedCallResolver = (
	context: Rule.RuleContext
): StyledContext => {
	const names = collectTrackedNames(context.sourceCode.ast);

	const hasTrackedImports =
		names.exportByLocal.size > 0 ||
		names.namespaceNames.size > 0 ||
		names.hasOtherImports;
	const ctx = createStyledContext(context.sourceCode, (node) => {
		if (!hasTrackedImports) {
			return null;
		}

		// A cached null, for a call that isn't tracked, is still a hit.
		return getOrCreate(matchedCalls, node, () =>
			matchTrackedCall(match, node)
		);
	});
	// Read lazily by the classifier above, so it is set before any call.
	const match: MatchContext = {
		names,
		ctx,
		filename: context.physicalFilename,
		moduleContext: getModuleContext(context),
		factories: new Map()
	};

	return ctx;
};

// Calls in a Vue `<template>` are only walked by a template visitor, so one
// is registered alongside the script's wherever the parser offers it.
export const createTrackedCallListeners = (
	context: Rule.RuleContext,
	onCall: (node: CallExpression, call: CallMatch, ctx: StyledContext) => void,
	onOtherCall?: (node: CallExpression, ctx: StyledContext) => void
): Rule.RuleListener => {
	const ctx = createTrackedCallResolver(context);
	const visitors = {
		CallExpression(node: CallExpression) {
			const call = ctx.matchCall(node);

			if (call) {
				onCall(node, call, ctx);
				return;
			}

			onOtherCall?.(node, ctx);
		}
	};
	const { defineTemplateBodyVisitor } = context.sourceCode.parserServices;

	if (typeof defineTemplateBodyVisitor === 'function') {
		return defineTemplateBodyVisitor(visitors, visitors);
	}

	return visitors;
};