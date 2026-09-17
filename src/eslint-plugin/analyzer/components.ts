import type { Scope, SourceCode } from 'eslint';
import type {
	ArrowFunctionExpression,
	FunctionDeclaration,
	FunctionExpression,
	Node
} from 'estree';
import { findVariable } from './const-bindings.ts';
import { CLASS_ATTRIBUTES } from './markup.ts';
import { getClassPropBindings, type Invocation } from './styled-values.ts';

export type ComponentFunction =
	FunctionDeclaration | FunctionExpression | ArrowFunctionExpression;

/** What a component forwards its `class` prop into. */
export type ForwardedStyles = {
	// The prop name a call site passes — the key the component destructures,
	// not the key it forwards under.
	prop: string;
	invocation: Invocation;
};

// Takes the structural minimum so framework node unions narrow through it too.
export const isComponentFunction = (node: {
	type: string;
}): node is ComponentFunction =>
	node.type === 'FunctionDeclaration' ||
	node.type === 'FunctionExpression' ||
	node.type === 'ArrowFunctionExpression';

// A parameter of `fn` rather than a same-named binding from an outer scope.
const isParameterOf = (
	name: string,
	fn: ComponentFunction,
	scope: Scope.Scope
): boolean => {
	const variable = findVariable(scope, name);

	/* c8 ignore next 3 -- callers only pass a name the pattern already binds */
	if (!variable) {
		return false;
	}

	return variable.defs.some(
		(def) => def.type === 'Parameter' && def.node === fn
	);
};

// `props.className` — the whole-props-object convention.
const getMemberPropName = (
	node: Node,
	fn: ComponentFunction,
	sourceCode: SourceCode
): string | null => {
	if (node.type !== 'MemberExpression' || node.computed) {
		return null;
	}

	if (
		node.property.type !== 'Identifier' ||
		!CLASS_ATTRIBUTES.has(node.property.name)
	) {
		return null;
	}

	if (node.object.type !== 'Identifier') {
		return null;
	}

	const [param] = fn.params;

	if (
		!param ||
		param.type !== 'Identifier' ||
		param.name !== node.object.name
	) {
		return null;
	}

	if (
		!isParameterOf(node.object.name, fn, sourceCode.getScope(node.object))
	) {
		return null;
	}

	return node.property.name;
};

/**
 * The prop name `value` forwards, when it reads `class`/`className` straight
 * off `fn`'s first parameter — destructured (`{ className }`, `{ class: cls }`)
 * or through the props object (`props.class`). Null when the value is anything
 * else, including a prop of some other function.
 */
export const getForwardedPropName = (
	value: Node,
	fn: ComponentFunction,
	sourceCode: SourceCode
): string | null => {
	if (value.type !== 'Identifier') {
		return getMemberPropName(value, fn, sourceCode);
	}

	const prop = getClassPropBindings(fn.params[0]).get(value.name);

	if (prop === undefined) {
		return null;
	}

	if (!isParameterOf(value.name, fn, sourceCode.getScope(value))) {
		return null;
	}

	return prop;
};

/**
 * The same-file function a component name resolves to — a function
 * declaration, or a `const` bound to a function expression. Null for anything
 * reached through an import, a `let`/`var`, or a redeclared binding.
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

	if (!init || !isComponentFunction(init)) {
		return null;
	}

	return init;
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