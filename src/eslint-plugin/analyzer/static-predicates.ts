import type { Node, TemplateElement, TemplateLiteral } from 'estree';
import {
	getStaticStringText,
	LEADING_SEPARATOR,
	TRAILING_SEPARATOR
} from './literals.ts';

// Reads a node through same-file `const` bindings.
export type ResolveNode = (node: Node) => Node;

export const isStaticStringNode = (node: Node): boolean =>
	getStaticStringText(node) !== null;

// `undefined`, or a `void` of a literal (`void 0`), which always evaluates to
// it.
export const isUndefinedValue = (node: Node): boolean => {
	if (node.type === 'UnaryExpression') {
		return node.operator === 'void' && node.argument.type === 'Literal';
	}

	return node.type === 'Identifier' && node.name === 'undefined';
};

// A placeholder `cn()` skips wherever it's written: `undefined`, `null` or a
// boolean, as a condition leaves behind.
export const isSkippedClassValue = (node: Node): boolean => {
	if (node.type === 'Literal') {
		return node.raw === 'null' || typeof node.value === 'boolean';
	}

	return isUndefinedValue(node);
};

// A value present and not `undefined` once read: a property left `undefined`
// is one that isn't set.
export const isDefinedValue = (
	node: Node | undefined,
	resolve: ResolveNode
): boolean => node !== undefined && !isUndefinedValue(resolve(node));

// A ternary whose every (possibly nested) branch is a static string — safe as
// a template-literal substitution, unlike a logical-AND (stringifies to
// "false" when skipped) or an array (comma-join leaks into the text).
const isStaticStringConditional = (node: Node): boolean =>
	isStaticStringNode(node) ||
	(node.type === 'ConditionalExpression' &&
		isStaticStringConditional(node.consequent) &&
		isStaticStringConditional(node.alternate));

// A substitution is only statically tokenizable when whitespace (or a
// template edge) separates it from the surrounding quasi text — otherwise a
// class token would straddle the boundary (e.g. `p-${x ? '2' : '4'}`), which
// we deliberately don't attempt to enumerate. The text is read cooked, as a
// line continuation (`\` before a line break) adds no whitespace.
const quasiIsolatesExpression = (
	quasi: TemplateElement,
	index: number,
	quasis: ReadonlyArray<TemplateElement>
): boolean => {
	/* c8 ignore next -- cooked is always defined on untagged templates */
	const text = quasi.value.cooked ?? quasi.value.raw;
	const hasLeftExpression = index > 0;
	const hasRightExpression = index < quasis.length - 1;

	// An interior empty quasi means two expressions sit adjacent.
	if (text.length === 0) {
		return !hasLeftExpression || !hasRightExpression;
	}

	if (hasLeftExpression && !LEADING_SEPARATOR.test(text)) {
		return false;
	}

	if (hasRightExpression && !TRAILING_SEPARATOR.test(text)) {
		return false;
	}

	return true;
};

// The weaker guard `no-restyle` needs when a substitution isn't a static
// string at all: the quasi text still tokenizes on its own, so the literal
// classes written around the substitution can be read even though the
// substitution's own value can't.
export const hasIsolatedQuasis = (node: TemplateLiteral): boolean =>
	node.quasis.every(quasiIsolatesExpression);

// Every substitution is a whitespace-isolated static-string ternary, so the
// full set of possible outputs is statically known.
export const isStaticTernaryTemplate = (node: Node): node is TemplateLiteral =>
	node.type === 'TemplateLiteral' &&
	node.expressions.every(isStaticStringConditional) &&
	hasIsolatedQuasis(node);