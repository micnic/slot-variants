import type { Rule } from 'eslint';
import type {
	ArrayExpression,
	Expression,
	Node,
	ObjectExpression,
	Property,
	SpreadElement
} from 'estree';
import { getKeyName } from './config-keys.ts';
import { resolveStaticValue } from './const-bindings.ts';
import {
	collectSlotKeyedProperties,
	getConfigSlotNames,
	getProperties
} from './properties.ts';
import {
	isStaticStringNode,
	isStaticTernaryTemplate,
	isUndefinedIdentifier
} from './static-predicates.ts';

const reportDynamic = (context: Rule.RuleContext, node: Node) => {
	context.report({ node, messageId: 'dynamic' });
};

type StaticClassValueOptions = {
	allowNestedArrays?: boolean;
	allowUndefined?: boolean;
	allowLogicalString?: boolean;
	allowConditionalString?: boolean;
	allowClassRecord?: boolean;
};

// The cn-style affordances that propagate into nested positions. `allowNestedArrays`
// and `allowUndefined` are top-level-only concerns and deliberately dropped.
const branchOptions = (
	options: StaticClassValueOptions
): StaticClassValueOptions => ({
	allowLogicalString: options.allowLogicalString === true,
	allowConditionalString: options.allowConditionalString === true,
	allowClassRecord: options.allowClassRecord === true
});

// Like forEachStaticItem, but spreads are reported as dynamic rather than skipped.
const forEachItemReportingSpread = (
	context: Rule.RuleContext,
	items: ReadonlyArray<Expression | SpreadElement | null>,
	visit: (item: Expression) => void
) => {
	for (const item of items) {
		if (!item) {
			continue;
		}

		if (item.type === 'SpreadElement') {
			reportDynamic(context, item);
			continue;
		}

		visit(item);
	}
};

// The conditional forms of the cn() calling convention, each validated with the
// same affordances as the position they sit in. True when the node was one of
// the forms this position allows, so it needs no further checking.
const checkConditionalClassValue = (
	context: Rule.RuleContext,
	node: Node,
	options: StaticClassValueOptions
): boolean => {
	// Only the `&&` right operand is a class contribution.
	if (
		options.allowLogicalString &&
		node.type === 'LogicalExpression' &&
		node.operator === '&&'
	) {
		checkClassValueIsStatic(context, node.right, branchOptions(options));

		return true;
	}

	if (options.allowConditionalString !== true) {
		return false;
	}

	if (node.type === 'ConditionalExpression') {
		checkClassValueIsStatic(
			context,
			node.consequent,
			branchOptions(options)
		);
		checkClassValueIsStatic(
			context,
			node.alternate,
			branchOptions(options)
		);

		return true;
	}

	return isStaticTernaryTemplate(node);
};

const checkArrayClassValue = (
	context: Rule.RuleContext,
	node: ArrayExpression,
	options: StaticClassValueOptions
) => {
	forEachItemReportingSpread(context, node.elements, (element) => {
		if (
			options.allowNestedArrays === false &&
			element.type === 'ArrayExpression'
		) {
			reportDynamic(context, element);
			return;
		}

		checkClassValueIsStatic(context, element, branchOptions(options));
	});
};

const checkClassValueIsStatic = (
	context: Rule.RuleContext,
	node: Node,
	options: StaticClassValueOptions = {}
) => {
	node = resolveStaticValue(node, context.sourceCode);

	if (options.allowUndefined && isUndefinedIdentifier(node)) {
		return;
	}

	if (isStaticStringNode(node)) {
		return;
	}

	if (checkConditionalClassValue(context, node, options)) {
		return;
	}

	if (node.type === 'ArrayExpression') {
		checkArrayClassValue(context, node, options);
		return;
	}

	if (options.allowClassRecord && node.type === 'ObjectExpression') {
		checkClassRecordKeys(context, node);
		return;
	}

	reportDynamic(context, node);
};

const checkConfigClassValueIsStatic = (
	context: Rule.RuleContext,
	node: Node
) => {
	checkClassValueIsStatic(context, node, {
		allowNestedArrays: false,
		allowUndefined: true
	});
};

const forEachStaticProperty = (
	context: Rule.RuleContext,
	node: ObjectExpression,
	visit: (prop: Property) => void
) => {
	for (const prop of node.properties) {
		if (prop.type === 'SpreadElement') {
			reportDynamic(context, prop);
			continue;
		}

		if (prop.computed) {
			reportDynamic(context, prop.key);
			continue;
		}

		visit(prop);
	}
};

// In cn-style arguments an ObjectExpression is a clsx-style record: keys are
// class names, values are runtime conditions. Only the keys must be statically
// known, so forEachStaticProperty reports dynamic ones; values are left alone.
const checkClassRecordKeys = (
	context: Rule.RuleContext,
	node: ObjectExpression
) => {
	forEachStaticProperty(context, node, () => {});
};

const checkClassValueRecord = (context: Rule.RuleContext, node: Node) => {
	if (node.type !== 'ObjectExpression') {
		reportDynamic(context, node);
		return;
	}

	forEachStaticProperty(context, node, (prop) => {
		checkConfigClassValueIsStatic(context, prop.value);
	});
};

const checkSlotKeyedClassValueRecord = (
	context: Rule.RuleContext,
	node: ObjectExpression
) => {
	for (const value of getProperties(node).values()) {
		checkConfigClassValueIsStatic(context, value);
	}
};

const isSlotKeyedClassValueRecord = (
	node: ObjectExpression,
	slotNames: Set<string>
): boolean => collectSlotKeyedProperties(node, slotNames) !== null;

const checkVariantBranchValue = (
	context: Rule.RuleContext,
	node: Node,
	slotNames: Set<string>
) => {
	if (node.type === 'ObjectExpression') {
		if (isSlotKeyedClassValueRecord(node, slotNames)) {
			checkSlotKeyedClassValueRecord(context, node);
			return;
		}
	}

	checkConfigClassValueIsStatic(context, node);
};

const checkValueKeyedVariant = (
	context: Rule.RuleContext,
	node: ObjectExpression,
	slotNames: Set<string>
) => {
	forEachStaticProperty(context, node, (prop) => {
		checkVariantBranchValue(context, prop.value, slotNames);
	});
};

const checkVariantDefinition = (
	context: Rule.RuleContext,
	node: Node,
	slotNames: Set<string>
) => {
	if (node.type === 'ObjectExpression') {
		if (isSlotKeyedClassValueRecord(node, slotNames)) {
			checkSlotKeyedClassValueRecord(context, node);
			return;
		}

		checkValueKeyedVariant(context, node, slotNames);
		return;
	}

	checkConfigClassValueIsStatic(context, node);
};

const checkVariants = (
	context: Rule.RuleContext,
	node: Node,
	slotNames: Set<string>
) => {
	if (node.type !== 'ObjectExpression') {
		reportDynamic(context, node);
		return;
	}

	forEachStaticProperty(context, node, (prop) => {
		checkVariantDefinition(context, prop.value, slotNames);
	});
};

const checkCompoundSlotsArray = (context: Rule.RuleContext, value: Node) => {
	if (value.type !== 'ArrayExpression') {
		reportDynamic(context, value);
		return;
	}

	forEachItemReportingSpread(context, value.elements, (element) => {
		if (element.type !== 'Literal' || typeof element.value !== 'string') {
			reportDynamic(context, element);
		}
	});
};

// Other keys on compound entries are runtime matchers and are not validated.
const checkCompoundEntries = (
	context: Rule.RuleContext,
	node: Node,
	hasSlotsKey: boolean,
	slotNames: Set<string>
) => {
	if (node.type !== 'ArrayExpression') {
		reportDynamic(context, node);
		return;
	}

	forEachItemReportingSpread(context, node.elements, (element) => {
		if (element.type !== 'ObjectExpression') {
			reportDynamic(context, element);
			return;
		}

		forEachStaticProperty(context, element, (prop) => {
			checkCompoundEntryProperty(context, prop, hasSlotsKey, slotNames);
		});
	});
};

export type SvConfigValueChecker = (
	context: Rule.RuleContext,
	node: Node
) => void;

const getCompoundEntryValueChecker = (
	key: string | null,
	hasSlotsKey: boolean,
	slotNames: Set<string>
): SvConfigValueChecker | null => {
	if (key === 'class' || key === 'className') {
		// A compoundSlots entry already targets specific slots, so its class value
		// is plain; a compoundVariants class follows a variant branch's shape and
		// may be a slot-keyed record.
		if (hasSlotsKey) {
			return checkConfigClassValueIsStatic;
		}

		return (context, node) => {
			checkVariantBranchValue(context, node, slotNames);
		};
	}

	if (key === 'slots') {
		if (hasSlotsKey) {
			return checkCompoundSlotsArray;
		}

		return null;
	}

	return null;
};

const checkCompoundEntryProperty = (
	context: Rule.RuleContext,
	prop: Property,
	hasSlotsKey: boolean,
	slotNames: Set<string>
) => {
	const checker = getCompoundEntryValueChecker(
		getKeyName(prop),
		hasSlotsKey,
		slotNames
	);

	if (checker) {
		checker(context, prop.value);
	}
};

const svConfigValueCheckers: Record<string, SvConfigValueChecker> = {
	base: checkConfigClassValueIsStatic,
	slots: checkClassValueRecord
};

const checkSvConfigProperty = (
	context: Rule.RuleContext,
	prop: Property,
	slotNames: Set<string>
) => {
	const key = getKeyName(prop);

	if (key === 'variants') {
		checkVariants(context, prop.value, slotNames);
		return;
	}

	if (key === 'compoundVariants') {
		checkCompoundEntries(context, prop.value, false, slotNames);
		return;
	}

	if (key === 'compoundSlots') {
		checkCompoundEntries(context, prop.value, true, slotNames);
		return;
	}

	if (key !== null) {
		svConfigValueCheckers[key]?.(context, prop.value);
	}
};

export const checkSvConfig = (
	context: Rule.RuleContext,
	configNode: ObjectExpression
) => {
	const slotNames = getConfigSlotNames(getProperties(configNode));

	forEachStaticProperty(context, configNode, (prop) => {
		checkSvConfigProperty(context, prop, slotNames);
	});
};

export const checkCnArguments = (
	context: Rule.RuleContext,
	args: ReadonlyArray<Expression | SpreadElement>
) => {
	forEachItemReportingSpread(context, args, (arg) => {
		checkClassValueIsStatic(context, arg, {
			allowLogicalString: true,
			allowConditionalString: true,
			allowClassRecord: true
		});
	});
};