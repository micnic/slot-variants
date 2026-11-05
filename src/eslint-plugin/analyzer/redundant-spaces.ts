import type { Rule } from 'eslint';
import type { Node, ObjectExpression } from 'estree';
import { resolveStaticValue } from './const-bindings.ts';
import {
	canHoistAsLiteral,
	getQuoteChar,
	getStaticStringText,
	splitClassTokens
} from './literals.ts';
import { getProperties } from './properties.ts';
import type { SvConfigValueChecker } from './static-values.ts';
import {
	forEachCnBranch,
	forEachCompoundClass,
	forEachStaticItem,
	forEachStringRecordKey
} from './token-extraction.ts';

// Highlights the whole literal: span-level reports would need to chase
// raw-text/escape-sequence mismatches.
const reportRedundantSpaces = (
	context: Rule.RuleContext,
	node: Node,
	value: string
) => {
	const canonical = splitClassTokens(value).join(' ');

	if (canonical === value) {
		return;
	}

	const quote = getQuoteChar(context.sourceCode, node);

	context.report({
		node,
		messageId: 'redundant',
		fix: (fixer) => {
			/* c8 ignore next 3 -- canHoistAsLiteral is itself ignored above */
			if (!canHoistAsLiteral(canonical, quote)) {
				return null;
			}

			return fixer.replaceText(node, `${quote}${canonical}${quote}`);
		}
	});
};

// Visits each value of an object; anything else has no values to visit.
const visitObjectForRedundantSpaces = (
	context: Rule.RuleContext,
	node: Node
) => {
	for (const value of getProperties(node).values()) {
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
	forEachCompoundClass(node, (cls) => {
		visitForRedundantSpaces(context, cls);
	});
};

const svRedundantSpacesConfigValueCheckers: Record<
	string,
	SvConfigValueChecker
> = {
	base: visitForRedundantSpaces,
	slots: visitObjectForRedundantSpaces,
	variants: visitObjectForRedundantSpaces,
	compoundVariants: checkCompoundsForRedundantSpaces,
	compoundSlots: checkCompoundsForRedundantSpaces
};

export const checkConfigForRedundantSpaces = (
	context: Rule.RuleContext,
	configNode: ObjectExpression
) => {
	for (const [key, value] of getProperties(configNode)) {
		svRedundantSpacesConfigValueCheckers[key]?.(context, value);
	}
};