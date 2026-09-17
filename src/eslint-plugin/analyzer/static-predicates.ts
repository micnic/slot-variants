import type { Node, TemplateElement, TemplateLiteral } from 'estree';
import { getStaticStringText } from './literals.ts';

export const isStaticStringNode = (node: Node): boolean =>
	getStaticStringText(node) !== null;

export const isUndefinedIdentifier = (node: Node): boolean =>
	node.type === 'Identifier' && node.name === 'undefined';

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
// we deliberately don't attempt to enumerate.
const quasiIsolatesExpression = (
	quasi: TemplateElement,
	index: number,
	quasis: ReadonlyArray<TemplateElement>
): boolean => {
	const raw = quasi.value.raw;
	const hasLeftExpression = index > 0;
	const hasRightExpression = index < quasis.length - 1;

	// An interior empty quasi means two expressions sit adjacent.
	if (raw.length === 0) {
		return !hasLeftExpression || !hasRightExpression;
	}

	if (hasLeftExpression && !/^\s/.test(raw)) {
		return false;
	}

	if (hasRightExpression && !/\s$/.test(raw)) {
		return false;
	}

	return true;
};

// Every substitution is a whitespace-isolated static-string ternary, so the
// full set of possible outputs is statically known.
export const isStaticTernaryTemplate = (node: Node): node is TemplateLiteral =>
	node.type === 'TemplateLiteral' &&
	node.expressions.every(isStaticStringConditional) &&
	node.quasis.every(quasiIsolatesExpression);

// The weaker guard `no-restyle` needs when a substitution isn't a static
// string at all: the quasi text still tokenizes on its own, so the literal
// classes written around the substitution can be read even though the
// substitution's own value can't.
export const hasIsolatedQuasis = (node: TemplateLiteral): boolean =>
	node.quasis.every(quasiIsolatesExpression);