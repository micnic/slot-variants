import type { Rule, Scope, SourceCode } from 'eslint';
import type {
	CallExpression,
	Identifier,
	ImportDeclaration,
	Node
} from 'estree';
import { type CallMatch, matchCnCall, matchSvCall } from './call-matching.ts';
import { findVariable, resolveStaticValueFrom } from './const-bindings.ts';
import { createStyledContext, type StyledContext } from './styled-values.ts';

/**
 * The scope an identifier is looked up from. Plain JS uses the node's own; a
 * Vue template expression, whose own scope never reaches the `<script>`
 * bindings it names, uses the script's module scope.
 */
type ScopeOf = (node: Node) => Scope.Scope;

// The tracked export each named-import local stands for, plus the locals bound
// to a whole-module namespace import.
type TrackedNames = {
	exportByLocal: Map<string, string>;
	namespaceNames: Set<string>;
};

// Everything the classifier needs from the rule that owns it.
type MatchContext = {
	sourceCode: SourceCode;
	names: TrackedNames;
	scopeOf: ScopeOf;
};

const TRACKED_EXPORTS = new Set(['sv', 'cn', 'createSV']);

const getImportedName = (
	specifier: ImportDeclaration['specifiers'][number]
): string | null => {
	if (specifier.type !== 'ImportSpecifier') {
		return null;
	}

	const { imported } = specifier;

	if (imported.type === 'Identifier') {
		return imported.name;
	}

	return String(imported.value);
};

const trackNamedImport = (
	specifier: ImportDeclaration['specifiers'][number],
	exportByLocal: Map<string, string>
) => {
	const importedName = getImportedName(specifier);

	if (importedName === null || !TRACKED_EXPORTS.has(importedName)) {
		return;
	}

	exportByLocal.set(specifier.local.name, importedName);
};

const createImportsTracker = () => {
	const names: TrackedNames = {
		exportByLocal: new Map<string, string>(),
		namespaceNames: new Set<string>()
	};

	const importsTracker = (node: ImportDeclaration) => {
		if (node.source.value !== 'slot-variants') {
			return;
		}

		for (const specifier of node.specifiers) {
			// `import * as SV` reaches every export through one local binding, so
			// the export being called is only known at the call site.
			if (specifier.type === 'ImportNamespaceSpecifier') {
				names.namespaceNames.add(specifier.local.name);
				continue;
			}

			trackNamedImport(specifier, names.exportByLocal);
		}
	};

	return { names, importsTracker };
};

// A tracked-name identifier could still be a local binding that shadows the
// import (e.g. a function parameter named `cn`), so confirm it resolves to
// an import binding.
const identifierResolvesToImport = (
	{ scopeOf }: MatchContext,
	identifier: Identifier
): boolean => {
	const variable = findVariable(scopeOf(identifier), identifier.name);

	/* c8 ignore next 3 -- a tracked-name identifier always resolves to a binding */
	if (!variable) {
		return false;
	}

	return variable.defs.some((def) => def.type === 'ImportBinding');
};

// Reads a node through same-file `const` aliases (`const cx = cn`) from the
// scope the context assigns it.
const resolve = ({ sourceCode, scopeOf }: MatchContext, node: Node): Node =>
	resolveStaticValueFrom(node, sourceCode, scopeOf(node));

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
const resolveExportName = (
	match: MatchContext,
	node: CallExpression
): string | null => {
	const namespaceExport = resolveNamespaceExportName(match, node);

	if (namespaceExport !== null) {
		return namespaceExport;
	}

	if (node.callee.type !== 'Identifier') {
		return null;
	}

	const resolved = resolve(match, node.callee);

	if (resolved.type !== 'Identifier') {
		return null;
	}

	return resolveIdentifierExportName(match, resolved);
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
		const resolved = resolve(match, defaults);

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
		return matchSvCall(node, match.sourceCode);
	}

	if (exportName === 'cn') {
		return matchCnCall(node);
	}

	if (exportName === 'createSV') {
		return matchFactoryCall(match, node);
	}

	return null;
};

// Classifies a call as sv/cn-style, reading the callee through same-file
// `const` aliases. A namespace member call (`SV.sv(…)`) or direct import names
// its export outright; a callee resolving to a `createSV(...)`-initialized
// binding is treated like `sv`. Null for anything untracked.
const matchTrackedCall = (
	match: MatchContext,
	node: CallExpression
): CallMatch | null => {
	const namespaceExport = resolveNamespaceExportName(match, node);

	if (namespaceExport !== null) {
		return matchExportCall(match, node, namespaceExport);
	}

	if (node.callee.type !== 'Identifier') {
		return null;
	}

	const resolved = resolve(match, node.callee);

	if (resolved.type === 'Identifier') {
		const exportName = resolveIdentifierExportName(match, resolved);

		if (exportName === null) {
			return null;
		}

		return matchExportCall(match, node, exportName);
	}

	// A `const button = createSV(...)` binding is a pre-configured `sv()`, so its
	// call sites are analyzed exactly like `sv()` calls.
	if (
		resolved.type === 'CallExpression' &&
		resolveExportName(match, resolved) === 'createSV'
	) {
		return matchSvCall(node, match.sourceCode);
	}

	return null;
};

// The import tracker plus an on-demand classifier, for rules that need to ask
// whether an arbitrary call is a tracked sv/cn call outside a CallExpression
// visitor (`no-restyle` resolves callees and class-list parts that way).
// `ImportDeclaration` is visited before any call in source order, so by the
// time `matchCall` runs the tracked names are already complete.
export const createTrackedCallResolver = (context: Rule.RuleContext) => {
	const { names, importsTracker } = createImportsTracker();

	const hasTrackedImports = (): boolean =>
		names.exportByLocal.size > 0 || names.namespaceNames.size > 0;

	// A classifier whose identifiers are looked up from the given scopes.
	const matchCallFrom =
		(scopeOf: ScopeOf) =>
		(node: CallExpression): CallMatch | null => {
			if (!hasTrackedImports()) {
				return null;
			}

			return matchTrackedCall(
				{ sourceCode: context.sourceCode, names, scopeOf },
				node
			);
		};

	return { importsTracker, matchCallFrom };
};

export const createTrackedCallListeners = (
	context: Rule.RuleContext,
	onCall: (node: CallExpression, call: CallMatch, ctx: StyledContext) => void
) => {
	const { importsTracker, matchCallFrom } =
		createTrackedCallResolver(context);
	const { sourceCode } = context;
	const ctx = createStyledContext(sourceCode, matchCallFrom, (node) =>
		sourceCode.getScope(node)
	);

	return {
		ImportDeclaration(node: ImportDeclaration) {
			importsTracker(node);
		},
		CallExpression(node: CallExpression) {
			const call = ctx.matchCall(node);

			if (call) {
				onCall(node, call, ctx);
			}
		}
	};
};