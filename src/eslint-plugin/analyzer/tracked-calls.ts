import type { AST, Rule } from 'eslint';
import type {
	CallExpression,
	Identifier,
	ImportDeclaration,
	Node
} from 'estree';
import { getOrCreate } from '../map-utils.ts';
import { type CallMatch, matchSvCall } from './call-matching.ts';
import { getExportName } from './module-syntax.ts';
import { createStyledContext, type StyledContext } from './styled-values.ts';

// The tracked export each named-import local stands for, plus the locals bound
// to a whole-module namespace import.
type TrackedNames = {
	exportByLocal: Map<string, string>;
	namespaceNames: Set<string>;
};

// Everything the classifier needs from the rule that owns it.
type MatchContext = {
	names: TrackedNames;
	ctx: StyledContext;
};

const TRACKED_EXPORTS = new Set(['sv', 'cn', 'createSV']);

// Every rule classifies every call of a file, and the outcome depends only on
// the file's AST and scopes, which the rules share, so it is worked out once.
const matchedCalls = new WeakMap<CallExpression, CallMatch | null>();

const trackNamedImport = (
	specifier: ImportDeclaration['specifiers'][number],
	exportByLocal: Map<string, string>
) => {
	if (specifier.type !== 'ImportSpecifier') {
		return;
	}

	const importedName = getExportName(specifier.imported);

	if (!TRACKED_EXPORTS.has(importedName)) {
		return;
	}

	exportByLocal.set(specifier.local.name, importedName);
};

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

// The export a namespace member call names — `SV.sv(…)` for
// `import * as SV from 'slot-variants'`. Null when the callee isn't a member of
// a tracked namespace binding, including a computed one (`SV[name](…)`), whose
// export can't be read statically.
const resolveNamespaceExportName = (
	match: MatchContext,
	node: CallExpression
): string | null => {
	const { callee } = node;

	if (callee.type !== 'MemberExpression' || callee.computed) {
		return null;
	}

	const { object, property } = callee;

	if (object.type !== 'Identifier' || property.type !== 'Identifier') {
		return null;
	}

	if (
		!match.names.namespaceNames.has(object.name) ||
		!identifierResolvesToImport(match, object)
	) {
		return null;
	}

	return property.name;
};

// The export an alias-resolved callee identifier names, when it's a tracked
// named import rather than a local binding shadowing one.
const resolveIdentifierExportName = (
	match: MatchContext,
	identifier: Identifier
): string | null => {
	const exportName = match.names.exportByLocal.get(identifier.name);

	if (
		exportName === undefined ||
		!identifierResolvesToImport(match, identifier)
	) {
		return null;
	}

	return exportName;
};

// The export a call names, either as a namespace member (`SV.sv(…)`) or through
// a named import read via same-file `const` aliases (`const cx = cn; cx(…)`).
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

	const namespaceExport = resolveNamespaceExportName(match, node);

	if (namespaceExport !== null) {
		return namespaceExport;
	}

	if (node.callee.type !== 'Identifier') {
		return null;
	}

	const resolved = match.ctx.resolve(node.callee);

	if (resolved.type === 'Identifier') {
		return resolveIdentifierExportName(match, resolved);
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
			return { config: resolved, args: [], isFactoryConfig: true };
		}
	}

	return { config: null, args: [], isFactoryConfig: true };
};

// Matches a call by the export its callee names: `sv` and `cn` use their own
// conventions, and `createSV` names the factory call that validates defaults.
const matchExportCall = (
	match: MatchContext,
	node: CallExpression,
	exportName: string
): CallMatch | null => {
	if (exportName === 'sv') {
		return matchSvCall(node, match.ctx.resolve);
	}

	if (exportName === 'cn') {
		return { config: null, args: node.arguments, isFactoryConfig: false };
	}

	if (exportName === 'createSV') {
		return matchFactoryCall(match, node);
	}

	return null;
};

// Classifies a call as sv/cn-style by the export its callee names. Null for
// anything untracked.
const matchTrackedCall = (
	match: MatchContext,
	node: CallExpression
): CallMatch | null => {
	const exportName = resolveExportName(match, node);

	if (exportName === null) {
		return null;
	}

	return matchExportCall(match, node, exportName);
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
		namespaceNames: new Set<string>()
	};

	for (const node of collectImportDeclarations(program)) {
		if (node.source.value !== 'slot-variants') {
			continue;
		}

		for (const specifier of node.specifiers) {
			// `import * as SV` reaches every export through one local binding,
			// so the export being called is only known at the call site.
			if (specifier.type === 'ImportNamespaceSpecifier') {
				names.namespaceNames.add(specifier.local.name);
				continue;
			}

			trackNamedImport(specifier, names.exportByLocal);
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
		names.exportByLocal.size > 0 || names.namespaceNames.size > 0;
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
	const match: MatchContext = { names, ctx };

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