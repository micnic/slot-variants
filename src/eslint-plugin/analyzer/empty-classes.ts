import type { Rule } from 'eslint';
import type { ArrayExpression, Node, ObjectExpression } from 'estree';
import { getKeyName } from './config-keys.ts';
import { resolveStaticValue } from './const-bindings.ts';
import { type EmptyFix, makeListFix, removeFromList } from './list-fix.ts';
import { getStaticStringText } from './literals.ts';
import { getProperties } from './properties.ts';
import {
	COMPOUND_NON_MATCHER_KEYS,
	forEachCompoundClass,
	forEachStaticItem
} from './token-extraction.ts';

const isEmptyStringNode = (node: Node): boolean =>
	getStaticStringText(node) === '';

const shouldReportEmptyString = (
	node: Node,
	allowEmptyString: boolean
): boolean => !allowEmptyString && isEmptyStringNode(node);

// In cn-style position an ObjectExpression is a clsx-style record whose keys are
// the class strings, so an empty string-literal key is an empty class value.
const checkRecordKeysForEmpty = (
	context: Rule.RuleContext,
	node: ObjectExpression
) => {
	for (const prop of node.properties) {
		if (prop.type !== 'Property' || prop.computed) {
			continue;
		}

		const { key } = prop;

		if (key.type === 'Literal' && key.value === '') {
			context.report({ node: key, messageId: 'emptyString' });
		}
	}
};

// `allowEmptyString` is set at the top of a `slots[key]` value, where `''` is
// a meaningful "slot with no default classes" declaration. `cnStyle` marks a
// cn-style position, where an ObjectExpression is a clsx-style record and a
// `&&`/ternary is a runtime branch rather than a class value itself.
// The conditional forms of the cn() calling convention: only the branches carry
// classes, and the same `fix` still removes the whole enclosing argument or
// element regardless of which branch reported. True when the node was one of
// them.
const visitBranchesForEmptyClasses = (
	context: Rule.RuleContext,
	node: Node,
	fix?: EmptyFix
): boolean => {
	if (node.type === 'LogicalExpression' && node.operator === '&&') {
		visitForEmptyClasses(context, node.right, false, fix, true);

		return true;
	}

	if (node.type === 'ConditionalExpression') {
		visitForEmptyClasses(context, node.consequent, false, fix, true);
		visitForEmptyClasses(context, node.alternate, false, fix, true);

		return true;
	}

	return false;
};

const visitArrayForEmptyClasses = (
	context: Rule.RuleContext,
	node: ArrayExpression,
	fix: EmptyFix | undefined,
	cnStyle: boolean
) => {
	if (node.elements.length === 0) {
		context.report({ node, messageId: 'emptyArray', fix });
		return;
	}

	forEachStaticItem(node.elements, (element) => {
		visitForEmptyClasses(
			context,
			element,
			false,
			makeListFix(context, element, node.elements),
			cnStyle
		);
	});
};

export const visitForEmptyClasses = (
	context: Rule.RuleContext,
	node: Node,
	allowEmptyString: boolean,
	fix?: EmptyFix,
	cnStyle = false
) => {
	node = resolveStaticValue(node, context.sourceCode);

	if (shouldReportEmptyString(node, allowEmptyString)) {
		context.report({ node, messageId: 'emptyString', fix });
		return;
	}

	if (cnStyle && visitBranchesForEmptyClasses(context, node, fix)) {
		return;
	}

	if (node.type === 'ArrayExpression') {
		visitArrayForEmptyClasses(context, node, fix, cnStyle);
		return;
	}

	if (node.type === 'ObjectExpression') {
		if (node.properties.length === 0) {
			context.report({ node, messageId: 'emptyObject', fix });
			return;
		}

		if (cnStyle) {
			checkRecordKeysForEmpty(context, node);
		}
	}
};

const visitVariantRecordForEmpty = (
	context: Rule.RuleContext,
	node: ObjectExpression,
	remove?: EmptyFix
) => {
	if (node.properties.length === 0) {
		context.report({ node, messageId: 'emptyObject', fix: remove });
		return;
	}

	for (const value of getProperties(node).values()) {
		visitVariantValueForEmpty(context, value);
	}
};

const visitVariantValueForEmpty = (
	context: Rule.RuleContext,
	variantValue: Node
) => {
	if (variantValue.type === 'ObjectExpression') {
		visitVariantRecordForEmpty(context, variantValue);
		return;
	}

	visitForEmptyClasses(context, variantValue, false);
};

const checkVariantsForEmpty = (
	context: Rule.RuleContext,
	value: Node,
	remove: EmptyFix
) => {
	if (value.type !== 'ObjectExpression') {
		return;
	}

	visitVariantRecordForEmpty(context, value, remove);
};

const isEmptyArrayLiteral = (node: Node): boolean =>
	node.type === 'ArrayExpression' && node.elements.length === 0;

// A compound matcher (any entry key other than `class`/`className`/`slots`)
// whose value is a literal empty array can never match: `matchesCompound` in
// sv.ts calls `.some()` over it, which is always false for an empty array —
// so the whole entry is permanently unreachable, regardless of props.
const checkCompoundMatchersForEmpty = (
	context: Rule.RuleContext,
	compoundEntries: ArrayExpression
) => {
	forEachStaticItem(compoundEntries.elements, (element) => {
		if (element.type !== 'ObjectExpression') {
			return;
		}

		for (const prop of element.properties) {
			if (prop.type !== 'Property' || prop.computed) {
				continue;
			}

			const key = getKeyName(prop);

			if (key === null || COMPOUND_NON_MATCHER_KEYS.has(key)) {
				continue;
			}

			const value = resolveStaticValue(prop.value, context.sourceCode);

			if (isEmptyArrayLiteral(value)) {
				context.report({
					node: value,
					messageId: 'unreachableMatcher',
					data: { key }
				});
			}
		}
	});
};

const checkCompoundsForEmpty = (
	context: Rule.RuleContext,
	value: Node,
	remove: EmptyFix
) => {
	if (value.type !== 'ArrayExpression') {
		return;
	}

	if (value.elements.length === 0) {
		context.report({ node: value, messageId: 'emptyArray', fix: remove });
		return;
	}

	checkCompoundMatchersForEmpty(context, value);

	forEachCompoundClass(value, (cls) => {
		// An empty record still falls through to the emptyObject report.
		if (cls.type === 'ObjectExpression' && cls.properties.length > 0) {
			for (const slotClass of getProperties(cls).values()) {
				visitForEmptyClasses(context, slotClass, false);
			}

			return;
		}

		visitForEmptyClasses(context, cls, false);
	});
};

const checkSlotsForEmpty = (
	context: Rule.RuleContext,
	value: Node,
	remove: EmptyFix
) => {
	if (value.type !== 'ObjectExpression') {
		return;
	}

	if (value.properties.length === 0) {
		context.report({ node: value, messageId: 'emptyObject', fix: remove });
		return;
	}

	for (const slotValue of getProperties(value).values()) {
		visitForEmptyClasses(context, slotValue, true);
	}
};

type EmptyConfigChecker = (
	context: Rule.RuleContext,
	value: Node,
	remove: EmptyFix
) => void;

// `[]` and `{}` are the empty forms of a config container. `requiredVariants`
// and `multiSlots` also accept a boolean, which is never empty.
const isEmptyContainer = (value: Node): boolean => {
	if (value.type === 'ObjectExpression') {
		return value.properties.length === 0;
	}

	if (value.type === 'ArrayExpression') {
		return value.elements.length === 0;
	}

	return false;
};

// The config containers that hold no class values of their own — variant
// selections and slot/variant name lists. Empty, each is inert: it reads as
// configuration but changes nothing about the output, so it's reported to be
// removed rather than left to look meaningful.
const checkEmptyConfigContainer =
	(key: string): EmptyConfigChecker =>
	(context, value, remove) => {
		if (!isEmptyContainer(value)) {
			return;
		}

		context.report({
			node: value,
			messageId: 'emptyConfig',
			data: { key },
			fix: remove
		});
	};

const svEmptyConfigValueCheckers: Record<string, EmptyConfigChecker> = {
	base: (context, node, remove) => {
		visitForEmptyClasses(context, node, false, remove);
	},
	slots: checkSlotsForEmpty,
	groups: checkEmptyConfigContainer('groups'),
	variants: checkVariantsForEmpty,
	compoundVariants: checkCompoundsForEmpty,
	compoundSlots: checkCompoundsForEmpty,
	defaultVariants: checkEmptyConfigContainer('defaultVariants'),
	requiredVariants: checkEmptyConfigContainer('requiredVariants'),
	multiSlots: checkEmptyConfigContainer('multiSlots'),
	presets: checkEmptyConfigContainer('presets')
};

// A `createSV()` factory config may carry a spread or computed key (reported
// as dynamic by no-dynamic-classes); those aren't class-bearing, so they're
// skipped here.
export const checkConfigForEmptyClasses = (
	context: Rule.RuleContext,
	config: ObjectExpression
) => {
	for (const prop of config.properties) {
		if (prop.type !== 'Property') {
			continue;
		}

		const key = getKeyName(prop);

		if (key === null) {
			continue;
		}

		const checker = svEmptyConfigValueCheckers[key];

		if (checker) {
			checker(context, prop.value, (fixer) =>
				removeFromList(
					fixer,
					context.sourceCode,
					prop,
					config.properties
				)
			);
		}
	}
};