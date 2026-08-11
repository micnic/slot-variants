import type { Rule, SourceCode } from 'eslint';
import type { CallExpression, Identifier, ImportDeclaration } from 'estree';
import {
	type CallMatch,
	matchCnCall,
	matchSvCall,
	matchSvCnCall,
	type TrackedNames
} from './call-matching.ts';
import { findVariable, resolveStaticValue } from './const-bindings.ts';

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

// A tracked-name identifier could still be a local binding that shadows the
// import (e.g. a function parameter named `cn`), so confirm it resolves to
// an import binding.
const identifierResolvesToImport = (
	context: Rule.RuleContext,
	identifier: Identifier
): boolean => {
	const variable = findVariable(
		context.sourceCode.getScope(identifier),
		identifier.name
	);

	/* c8 ignore next 3 -- a tracked-name identifier always resolves to a binding */
	if (!variable) {
		return false;
	}

	return variable.defs.some((def) => def.type === 'ImportBinding');
};

// Reads the callee through same-file `const` aliases (`const cx = cn`) so
// aliased sv/cn bindings stay tracked. Null when the callee isn't an
// identifier, or is an alias of a non-identifier value.
const resolveCalleeIdentifier = (
	context: Rule.RuleContext,
	node: CallExpression
): Identifier | null => {
	if (node.callee.type !== 'Identifier') {
		return null;
	}

	const resolved = resolveStaticValue(node.callee, context.sourceCode);

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
	context: Rule.RuleContext,
	node: CallExpression,
	namespaceNames: Set<string>
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
		!namespaceNames.has(object.name) ||
		!identifierResolvesToImport(context, object)
	) {
		return null;
	}

	return property.name;
};

// A namespace member call names its export outright, so there are no aliases to
// resolve — `SV.sv(…)` is an `sv()` call by construction.
const matchNamespaceCall = (
	node: CallExpression,
	exportName: string,
	sourceCode: SourceCode
): CallMatch | null => {
	if (exportName === 'sv') {
		return matchSvCall(node, sourceCode);
	}

	if (exportName === 'cn') {
		return matchCnCall(node);
	}

	if (exportName === 'createSV') {
		return matchFactoryCall(node, sourceCode);
	}

	return null;
};

// A `createSV(...)` factory call whose callee resolves to a tracked createSV
// import, named directly or reached through a namespace binding. The `const`
// binding it initializes is a pre-configured `sv()`, so its call sites are
// analyzed exactly like `sv()` calls.
const isCreateSvFactoryCall = (
	context: Rule.RuleContext,
	node: CallExpression,
	names: TrackedNames
): boolean => {
	if (
		resolveNamespaceExportName(context, node, names.namespaceNames) ===
		'createSV'
	) {
		return true;
	}

	const factoryCallee = resolveCalleeIdentifier(context, node);

	if (!factoryCallee) {
		return false;
	}

	return (
		names.createSvNames.has(factoryCallee.name) &&
		identifierResolvesToImport(context, factoryCallee)
	);
};

// The `createSV(defaults)` call itself: its sole argument is unambiguously the
// shared config. Unlike `sv()`, whose last arg might be a cn-style class list,
// any object argument here is the config — so a spread or computed key is
// reported as dynamic rather than gating the whole object out.
const matchFactoryCall = (
	node: CallExpression,
	sourceCode: SourceCode
): CallMatch => {
	const [defaults] = node.arguments;

	if (!defaults) {
		return { config: null, args: [], isFactoryConfig: true };
	}

	const resolved = resolveStaticValue(defaults, sourceCode);

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
	context: Rule.RuleContext,
	node: CallExpression,
	names: TrackedNames
): CallMatch | null => {
	const namespaceExport = resolveNamespaceExportName(
		context,
		node,
		names.namespaceNames
	);

	if (namespaceExport !== null) {
		return matchNamespaceCall(node, namespaceExport, context.sourceCode);
	}

	if (node.callee.type !== 'Identifier') {
		return null;
	}

	const resolved = resolveStaticValue(node.callee, context.sourceCode);

	// A `const button = createSV(...)(…)` binding behaves like `sv`.
	if (resolved.type === 'CallExpression') {
		if (isCreateSvFactoryCall(context, resolved, names)) {
			return matchSvCall(node, context.sourceCode);
		}

		return null;
	}

	if (resolved.type !== 'Identifier') {
		return null;
	}

	// The `createSV(defaults)` factory call itself — validate its defaults.
	if (names.createSvNames.has(resolved.name)) {
		if (identifierResolvesToImport(context, resolved)) {
			return matchFactoryCall(node, context.sourceCode);
		}

		return null;
	}

	const call = matchSvCnCall(node, resolved.name, names, context.sourceCode);

	if (call && identifierResolvesToImport(context, resolved)) {
		return call;
	}

	return null;
};

export const createTrackedCallListeners = (
	context: Rule.RuleContext,
	onCall: (node: CallExpression, call: CallMatch) => void
) => {
	const { names, importsTracker } = createImportsTracker();

	return {
		ImportDeclaration(node: ImportDeclaration) {
			importsTracker(node);
		},
		CallExpression(node: CallExpression) {
			if (
				names.svNames.size === 0 &&
				names.cnNames.size === 0 &&
				names.createSvNames.size === 0 &&
				names.namespaceNames.size === 0
			) {
				return;
			}

			const call = matchTrackedCall(context, node, names);

			if (call) {
				onCall(node, call);
			}
		}
	};
};