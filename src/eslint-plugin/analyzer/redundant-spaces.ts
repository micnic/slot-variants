import type { AST, Rule } from 'eslint';
import type { Node, ObjectExpression, TemplateLiteral } from 'estree';
import { resolveStaticValue } from './const-bindings.ts';
import {
	getQuasiInnerRange,
	getQuasiText,
	getStaticStringText,
	planLiteralRewrite,
	replaceLiteral,
	splitClassTokens
} from './literals.ts';
import { getConfigProperties, getProperties } from './properties.ts';
import { isStaticTernaryTemplate } from './static-predicates.ts';
import {
	forEachCnBranch,
	forEachCompoundClass,
	forEachStaticItem,
	forEachStringRecordKey
} from './token-extraction.ts';

type SvConfigValueChecker = (context: Rule.RuleContext, node: Node) => void;

// A quasi's text range inside its delimiters, and the text it should hold.
type QuasiRewrite = { range: AST.Range; text: string };

// Highlights the whole literal: span-level reports would need to chase
// raw-text/escape-sequence mismatches.
const reportRedundantSpaces = (
	context: Rule.RuleContext,
	node: Node,
	value: string
) => {
	const tokens = splitClassTokens(value);

	if (tokens.join(' ') === value) {
		return;
	}

	const rewrite = planLiteralRewrite(context.sourceCode, node, tokens);

	context.report({
		node,
		messageId: 'redundant',
		fix: (fixer) => {
			if (rewrite === null) {
				return null;
			}

			return replaceLiteral(fixer, rewrite);
		}
	});
};

// The text a template's quasi should hold: its classes joined by single
// spaces, with one space on each side a substitution sits.
const getCanonicalQuasi = (
	tokens: ReadonlyArray<string>,
	hasLeft: boolean,
	hasRight: boolean
): string => {
	let text = tokens.join(' ');

	if (hasLeft && (tokens.length > 0 || hasRight)) {
		text = ` ${text}`;
	}

	if (hasRight && tokens.length > 0) {
		text = `${text} `;
	}

	return text;
};

// The quasis of a ternary template whose text isn't canonical, each with the
// text it should hold, or null when one of them holds an escape, which the
// rewrite can't keep.
const planQuasiRewrites = (
	context: Rule.RuleContext,
	node: TemplateLiteral
): QuasiRewrite[] | null => {
	const rewrites: QuasiRewrite[] = [];
	const last = node.quasis.length - 1;

	for (const [index, quasi] of node.quasis.entries()) {
		const { raw } = quasi.value;
		const cooked = getQuasiText(quasi);
		const text = getCanonicalQuasi(
			splitClassTokens(cooked),
			index > 0,
			index < last
		);

		if (cooked === text) {
			continue;
		}

		if (raw !== cooked) {
			return null;
		}

		rewrites.push({
			range: getQuasiInnerRange(context.sourceCode, quasi),
			text
		});
	}

	return rewrites;
};

// A template whose substitutions are whitespace-isolated ternaries of static
// strings: each branch is a class string of its own, and the text around the
// substitutions is canonical with one space on each side of them.
const visitTernaryTemplate = (
	context: Rule.RuleContext,
	node: TemplateLiteral
) => {
	for (const expression of node.expressions) {
		visitForRedundantSpaces(context, expression, true);
	}

	const rewrites = planQuasiRewrites(context, node);

	if (rewrites !== null && rewrites.length === 0) {
		return;
	}

	context.report({
		node,
		messageId: 'redundant',
		fix: (fixer) => {
			if (rewrites === null) {
				return null;
			}

			return rewrites.map(({ range, text }) =>
				fixer.replaceTextRange(range, text)
			);
		}
	});
};

// Visits each value of an object, read through `const` bindings; anything else
// has no values to visit.
const visitObjectForRedundantSpaces = (
	context: Rule.RuleContext,
	node: Node
) => {
	const record = resolveStaticValue(node, context.sourceCode);

	for (const value of getProperties(record).values()) {
		visitForRedundantSpaces(context, value);
	}
};

export const visitForRedundantSpaces = (
	context: Rule.RuleContext,
	node: Node,
	cnStyle = false
) => {
	node = resolveStaticValue(node, context.sourceCode);

	const text = getStaticStringText(node);

	if (text !== null) {
		reportRedundantSpaces(context, node, text);
		return;
	}

	if (isStaticTernaryTemplate(node)) {
		visitTernaryTemplate(context, node);
		return;
	}

	const isBranch =
		cnStyle &&
		forEachCnBranch(node, (branch) => {
			visitForRedundantSpaces(context, branch, true);
		});

	if (isBranch) {
		return;
	}

	if (node.type === 'ArrayExpression') {
		forEachStaticItem(node.elements, (element) => {
			visitForRedundantSpaces(context, element, cnStyle);
		});
		return;
	}

	if (node.type === 'ObjectExpression') {
		if (cnStyle) {
			forEachStringRecordKey(node, (key, text) => {
				reportRedundantSpaces(context, key, text);
			});
			return;
		}

		visitObjectForRedundantSpaces(context, node);
	}
};

const checkCompoundsForRedundantSpaces = (
	context: Rule.RuleContext,
	node: Node
) => {
	forEachCompoundClass(node, context.sourceCode, (cls) => {
		visitForRedundantSpaces(context, cls);
	});
};

// A Map, so a key named like an `Object.prototype` member finds no checker.
const svRedundantSpacesConfigValueCheckers: ReadonlyMap<
	string,
	SvConfigValueChecker
> = new Map([
	['base', visitForRedundantSpaces],
	['slots', visitObjectForRedundantSpaces],
	['variants', visitObjectForRedundantSpaces],
	['compoundVariants', checkCompoundsForRedundantSpaces],
	['compoundSlots', checkCompoundsForRedundantSpaces]
]);

// Reads the config through the objects it spreads, as `sv()` does.
export const checkConfigForRedundantSpaces = (
	context: Rule.RuleContext,
	configNode: ObjectExpression
) => {
	for (const [key, value] of getConfigProperties(
		configNode,
		context.sourceCode
	)) {
		svRedundantSpacesConfigValueCheckers.get(key)?.(context, value);
	}
};