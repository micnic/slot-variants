import type { Rule } from 'eslint';
import type { Node, ObjectExpression } from 'estree';
import { resolveStaticValue } from './const-bindings.ts';
import {
	getStaticStringText,
	planLiteralRewrite,
	replaceLiteral,
	splitClassTokens
} from './literals.ts';
import { getProperties } from './properties.ts';
import {
	forEachCnBranch,
	forEachCompoundClass,
	forEachStaticItem,
	forEachStringRecordKey
} from './token-extraction.ts';

type SvConfigValueChecker = (context: Rule.RuleContext, node: Node) => void;

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

export const checkConfigForRedundantSpaces = (
	context: Rule.RuleContext,
	configNode: ObjectExpression
) => {
	for (const [key, value] of getProperties(configNode)) {
		svRedundantSpacesConfigValueCheckers.get(key)?.(context, value);
	}
};