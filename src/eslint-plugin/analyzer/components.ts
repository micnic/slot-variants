import type { Scope } from 'eslint';
import type {
	ArrowFunctionExpression,
	FunctionDeclaration,
	FunctionExpression,
	Node,
	Program
} from 'estree';
import { findVariable } from './const-bindings.ts';

export type ComponentFunction =
	FunctionDeclaration | FunctionExpression | ArrowFunctionExpression;

/**
 * Something a `class` prop is passed to: a component function, or a whole
 * single-file component module (Svelte, Vue), whose props are declared at the
 * top level of its script.
 */
export type Component = ComponentFunction | Program;

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
	const variable = findVariable(scope, name);

	if (!variable || variable.defs.length !== 1) {
		return null;
	}

	const [def] = variable.defs;

	/* c8 ignore next 3 -- a length-1 defs array always has a first element */
	if (!def) {
		return null;
	}

	if (def.type === 'FunctionName') {
		return def.node;
	}

	if (def.type !== 'Variable' || def.parent.kind !== 'const') {
		return null;
	}

	const { init } = def.node;

	/* c8 ignore next 3 -- a const declarator always has an initializer */
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
): { specifier: string; exportName: string } | null => {
	const variable = findVariable(scope, name);

	if (!variable || variable.defs.length !== 1) {
		return null;
	}

	const [def] = variable.defs;

	/* c8 ignore next 3 -- a length-1 defs array always has a first element */
	if (!def) {
		return null;
	}

	if (def.type !== 'ImportBinding') {
		return null;
	}

	const { value } = def.parent.source;

	/* c8 ignore next 3 -- a module source is always a string literal */
	if (typeof value !== 'string') {
		return null;
	}

	// `DEFAULT_EXPORT` lives in module-exports, which reads this file for its
	// own function check — the literal is repeated here to keep that one-way.
	if (def.node.type === 'ImportDefaultSpecifier') {
		return { specifier: value, exportName: 'default' };
	}

	if (def.node.type !== 'ImportSpecifier') {
		return null;
	}

	const { imported } = def.node;

	if (imported.type === 'Identifier') {
		return { specifier: value, exportName: imported.name };
	}

	return { specifier: value, exportName: String(imported.value) };
};