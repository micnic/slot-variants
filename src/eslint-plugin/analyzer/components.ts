import type { Scope } from 'eslint';
import type {
	ArrowFunctionExpression,
	FunctionDeclaration,
	FunctionExpression,
	Node,
	Program
} from 'estree';
import { getExportName } from './config-keys.ts';
import { findSingleDef, getConstDefInit } from './const-bindings.ts';

export type ComponentFunction =
	| FunctionDeclaration
	| FunctionExpression
	| ArrowFunctionExpression;

/**
 * Something a `class` prop is passed to: a component function, or a whole
 * single-file component module (Svelte, Vue), whose props are declared at the
 * top level of its script.
 */
export type Component = ComponentFunction | Program;

/** The module a component identifier is imported from, and under which name. */
type ImportSource = { specifier: string; exportName: string };

type ImportDefinition = Extract<Scope.Definition, { type: 'ImportBinding' }>;

/** What a component name is bound to: a same-file function, or an import. */
type ComponentBinding =
	| { kind: 'local'; fn: ComponentFunction }
	| { kind: 'import'; source: ImportSource }
	| null;

export const DEFAULT_EXPORT = 'default';

// Takes the structural minimum so framework node unions narrow through it too.
export const isComponentFunction = (node: {
	type: string;
}): node is ComponentFunction =>
	node.type === 'FunctionDeclaration' ||
	node.type === 'FunctionExpression' ||
	node.type === 'ArrowFunctionExpression';

/**
 * The component function `node` is, or wraps: `forwardRef(fn)`, `memo(fn)` and
 * any other call handed the function as an argument, however deeply nested
 * (`memo(forwardRef(fn))`). Null when no function is reachable that way.
 */
export const unwrapComponentFunction = (
	node: Node
): ComponentFunction | null => {
	if (isComponentFunction(node)) {
		return node;
	}

	if (node.type !== 'CallExpression') {
		return null;
	}

	for (const arg of node.arguments) {
		if (arg.type === 'SpreadElement') {
			continue;
		}

		const fn = unwrapComponentFunction(arg);

		if (fn !== null) {
			return fn;
		}
	}

	return null;
};

// The function a same-file declaration or `const` binding holds, possibly
// through a wrapper call.
const getDefComponentFunction = (
	def: Scope.Definition
): ComponentFunction | null => {
	if (def.type === 'FunctionName') {
		return def.node;
	}

	const init = getConstDefInit(def);

	if (!init) {
		return null;
	}

	return unwrapComponentFunction(init);
};

// The module and export name an import binding reads, or null for a namespace
// import, whose members are read through a dotted JSX name that is skipped.
const getImportSource = (def: ImportDefinition): ImportSource | null => {
	// A module source is always a string literal; ESTree only types it as a
	// general `Literal`.
	const value = String(def.parent.source.value);

	if (def.node.type === 'ImportDefaultSpecifier') {
		return { specifier: value, exportName: DEFAULT_EXPORT };
	}

	if (def.node.type !== 'ImportSpecifier') {
		return null;
	}

	return { specifier: value, exportName: getExportName(def.node.imported) };
};

/**
 * The same-file function a component name resolves to — a function
 * declaration, or a `const` bound to a function expression, possibly through a
 * wrapper call. Null for anything reached through an import, a `let`/`var`, or
 * a redeclared binding.
 */
export const resolveComponentFunction = (
	name: string,
	scope: Scope.Scope
): ComponentFunction | null => {
	const def = findSingleDef(scope, name);

	if (!def) {
		return null;
	}

	return getDefComponentFunction(def);
};

/**
 * What a component name is bound to: a same-file function (as
 * `resolveComponentFunction` finds it) or the module and export name it is
 * imported from. Null for anything else.
 */
export const resolveComponentBinding = (
	name: string,
	scope: Scope.Scope
): ComponentBinding => {
	const def = findSingleDef(scope, name);

	if (!def) {
		return null;
	}

	if (def.type === 'ImportBinding') {
		const source = getImportSource(def);

		if (source === null) {
			return null;
		}

		return { kind: 'import', source };
	}

	const fn = getDefComponentFunction(def);

	if (fn === null) {
		return null;
	}

	return { kind: 'local', fn };
};