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

	if (def.type === 'FunctionName') {
		return def.node;
	}

	const init = getConstDefInit(def);

	if (!init) {
		return null;
	}

	return unwrapComponentFunction(init);
};

/**
 * The module and export name a component identifier is imported from, or null
 * when it isn't an import (or is a namespace import, whose members are read
 * through a dotted JSX name this rule already skips).
 */
export const resolveImportSource = (
	name: string,
	scope: Scope.Scope
): ImportSource | null => {
	const def = findSingleDef(scope, name);

	if (!def || def.type !== 'ImportBinding') {
		return null;
	}

	const { value } = def.parent.source;

	/* c8 ignore next 3 -- a module source is always a string literal */
	if (typeof value !== 'string') {
		return null;
	}

	if (def.node.type === 'ImportDefaultSpecifier') {
		return { specifier: value, exportName: DEFAULT_EXPORT };
	}

	if (def.node.type !== 'ImportSpecifier') {
		return null;
	}

	return { specifier: value, exportName: getExportName(def.node.imported) };
};