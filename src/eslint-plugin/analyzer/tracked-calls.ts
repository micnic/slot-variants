import type { Rule } from 'eslint';
import type { CallExpression, Identifier, ImportDeclaration } from 'estree';
import { type CallMatch, matchSvCall } from './call-matching.ts';
import { getExportName } from './config-keys.ts';
import { findVariable } from './const-bindings.ts';
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
			// `import * as SV` reaches every export through one local binding,
			// so the export being called is only known at the call site.
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
	{ ctx }: MatchContext,
	identifier: Identifier
): boolean => {
	const variable = findVariable(ctx.scopeOf(identifier), identifier.name);

	/* c8 ignore next 3 -- a tracked name always resolves to a binding */
	if (!variable) {
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

	const resolved = match.ctx.resolve(node.callee);

	if (resolved.type === 'Identifier') {
		return resolveIdentifierExportName(match, resolved);
	}

	if (
		resolved.type === 'CallExpression' &&
		resolveExportName(match, resolved) === 'createSV'
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

// The import tracker plus an on-demand classifier, for rules that need to ask
// whether an arbitrary call is a tracked sv/cn call outside a CallExpression
// visitor (`no-restyle` resolves callees and class-list parts that way).
// `ImportDeclaration` is visited before any call in source order, so by the
// time `matchCall` runs the tracked names are already complete.
export const createTrackedCallResolver = (context: Rule.RuleContext) => {
	const { names, importsTracker } = createImportsTracker();

	const hasTrackedImports = (): boolean =>
		names.exportByLocal.size > 0 || names.namespaceNames.size > 0;

	// A context whose identifiers are looked up from the given scopes.
	const contextFrom = (scopeOf: StyledContext['scopeOf']): StyledContext => {
		const ctx = createStyledContext(
			context.sourceCode,
			(node) => {
				if (!hasTrackedImports()) {
					return null;
				}

				return matchTrackedCall(match, node);
			},
			scopeOf
		);
		// Read lazily by the classifier above, so it is set before any call.
		const match: MatchContext = { names, ctx };

		return ctx;
	};

	return { importsTracker, contextFrom };
};

export const createTrackedCallListeners = (
	context: Rule.RuleContext,
	onCall: (node: CallExpression, call: CallMatch, ctx: StyledContext) => void
) => {
	const { importsTracker, contextFrom } = createTrackedCallResolver(context);
	const { sourceCode } = context;
	const ctx = contextFrom((node) => sourceCode.getScope(node));

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