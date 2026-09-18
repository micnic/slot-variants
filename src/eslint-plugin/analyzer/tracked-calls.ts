import type { Rule, Scope, SourceCode } from 'eslint';
import type {
	CallExpression,
	Identifier,
	ImportDeclaration,
	Node
} from 'estree';
import {
	type CallMatch,
	matchCnCall,
	matchSvCall,
	matchSvCnCall,
	type TrackedNames
} from './call-matching.ts';
import { findVariable, resolveStaticValueFrom } from './const-bindings.ts';
import { createStyledContext, type StyledContext } from './styled-values.ts';

/**
 * The scope an identifier is looked up from. Plain JS uses the node's own; a
 * Vue template expression, whose own scope never reaches the `<script>`
 * bindings it names, uses the script's module scope.
 */
export type ScopeOf = (node: Node) => Scope.Scope;

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
	trackedNamesByImport: Record<string, Set<string>>
) => {
	const importedName = getImportedName(specifier);

	if (importedName === null) {
		return;
	}

	trackedNamesByImport[importedName]?.add(specifier.local.name);
};

const createImportsTracker = () => {
	const names: TrackedNames = {
		cnNames: new Set<string>(),
		svNames: new Set<string>(),
		createSvNames: new Set<string>(),
		namespaceNames: new Set<string>()
	};
	const trackedNamesByImport: Record<string, Set<string>> = {
		cn: names.cnNames,
		sv: names.svNames,
		createSV: names.createSvNames
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

			trackNamedImport(specifier, trackedNamesByImport);
		}
	};

	return { names, importsTracker };
};

// Everything the classifier needs from the rule that owns it.
type MatchContext = {
	sourceCode: SourceCode;
	names: TrackedNames;
	scopeOf: ScopeOf;
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

// Reads the callee through same-file `const` aliases so aliased sv/cn bindings
// stay tracked. Null when the callee isn't an identifier, or is an alias of a
// non-identifier value.
const resolveCalleeIdentifier = (
	match: MatchContext,
	node: CallExpression
): Identifier | null => {
	if (node.callee.type !== 'Identifier') {
		return null;
	}

	const resolved = resolve(match, node.callee);

	if (resolved.type !== 'Identifier') {
		return null;
	}

	return resolved;
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

// A namespace member call names its export outright, so there are no aliases to
// resolve — `SV.sv(…)` is an `sv()` call by construction.
const matchNamespaceCall = (
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

// A `createSV(...)` factory call whose callee resolves to a tracked createSV
// import, named directly or reached through a namespace binding. The `const`
// binding it initializes is a pre-configured `sv()`, so its call sites are
// analyzed exactly like `sv()` calls.
const isCreateSvFactoryCall = (
	match: MatchContext,
	node: CallExpression
): boolean => {
	if (resolveNamespaceExportName(match, node) === 'createSV') {
		return true;
	}

	const factoryCallee = resolveCalleeIdentifier(match, node);

	if (!factoryCallee) {
		return false;
	}

	return (
		match.names.createSvNames.has(factoryCallee.name) &&
		identifierResolvesToImport(match, factoryCallee)
	);
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

	if (!defaults) {
		return { config: null, args: [], isFactoryConfig: true };
	}

	const resolved = resolve(match, defaults);

	if (resolved.type === 'ObjectExpression') {
		return { config: resolved, args: [], isFactoryConfig: true };
	}

	return { config: null, args: [], isFactoryConfig: true };
};

// Classifies a call as sv/cn-style, reading the callee through same-file
// `const` aliases. A namespace member call (`SV.sv(…)`) names its export
// directly; a callee resolving to a `createSV(...)`-initialized binding is
// treated like `sv`; a direct `createSV` import names a factory call; a direct
// sv/cn import uses the sv/cn convention. Null for anything untracked.
const matchTrackedCall = (
	match: MatchContext,
	node: CallExpression
): CallMatch | null => {
	const namespaceExport = resolveNamespaceExportName(match, node);

	if (namespaceExport !== null) {
		return matchNamespaceCall(match, node, namespaceExport);
	}

	if (node.callee.type !== 'Identifier') {
		return null;
	}

	const resolved = resolve(match, node.callee);

	// A `const button = createSV(...)(…)` binding behaves like `sv`.
	if (resolved.type === 'CallExpression') {
		if (isCreateSvFactoryCall(match, resolved)) {
			return matchSvCall(node, match.sourceCode);
		}

		return null;
	}

	if (resolved.type !== 'Identifier') {
		return null;
	}

	// The `createSV(defaults)` factory call itself — validate its defaults.
	if (match.names.createSvNames.has(resolved.name)) {
		if (identifierResolvesToImport(match, resolved)) {
			return matchFactoryCall(match, node);
		}

		return null;
	}

	const call = matchSvCnCall(
		node,
		resolved.name,
		match.names,
		match.sourceCode
	);

	if (call && identifierResolvesToImport(match, resolved)) {
		return call;
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
		names.svNames.size > 0 ||
		names.cnNames.size > 0 ||
		names.createSvNames.size > 0 ||
		names.namespaceNames.size > 0;

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
	const { importsTracker, matchCallFrom } = createTrackedCallResolver(context);
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