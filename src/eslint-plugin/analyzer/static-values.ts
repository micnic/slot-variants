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
import { resolveEnteredValue, resolveStaticValue } from './const-bindings.ts';
import {
	collectSlotKeyedProperties,
	getConfigSlotNames,
	getConfigProperties
} from './properties.ts';
import {
	isSkippedClassValue,
	isStaticStringNode,
	isStaticTernaryTemplate,
	isUndefinedValue
} from './static-predicates.ts';
import { forEachCnBranch, type NodeVisitor } from './token-extraction.ts';

type StaticClassValueOptions = {
	cnStyle: boolean;
	allowUndefined?: boolean;
	isStyled?: (node: Node) => boolean;
};

type PropertyVisitor = (prop: Property) => void;

const reportDynamic = (context: Rule.RuleContext, node: Node) => {
	context.report({ node, messageId: 'dynamic' });
};

// The options that propagate into nested positions. `allowUndefined` is a
// top-level-only concern and deliberately dropped.
const branchOptions = (
	options: StaticClassValueOptions
): StaticClassValueOptions => ({ ...options, allowUndefined: false });

// Like forEachStaticItem, but spreads
// are reported as dynamic rather than skipped.
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
	if (!options.cnStyle) {
		return false;
	}

	const nested = branchOptions(options);
	const isBranch = forEachCnBranch(node, (branch) => {
		checkClassValueIsStatic(context, branch, nested);
	});

	if (isBranch) {
		return true;
	}

	return isStaticTernaryTemplate(node);
};

const checkArrayClassValue = (
	context: Rule.RuleContext,
	node: ArrayExpression,
	options: StaticClassValueOptions
) => {
	const nested = branchOptions(options);

	forEachItemReportingSpread(context, node.elements, (element) => {
		// A config class array is flat, read through `const` bindings too.
		const resolved = resolveStaticValue(element, context.sourceCode);

		if (!options.cnStyle && resolved.type === 'ArrayExpression') {
			reportDynamic(context, element);
			return;
		}

		checkClassValueIsStatic(context, element, nested);
	});
};

const checkClassValueIsStatic = (
	context: Rule.RuleContext,
	node: Node,
	options: StaticClassValueOptions
) => {
	node = resolveStaticValue(node, context.sourceCode);

	if (options.allowUndefined && isUndefinedValue(node)) {
		return;
	}

	if (options.cnStyle && isSkippedClassValue(node)) {
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

	if (options.cnStyle && node.type === 'ObjectExpression') {
		checkClassRecordKeys(context, node);
		return;
	}

	if (options.isStyled?.(node) === true) {
		return;
	}

	reportDynamic(context, node);
};

const checkConfigClassValueIsStatic = (
	context: Rule.RuleContext,
	node: Node
) => {
	checkClassValueIsStatic(context, node, {
		cnStyle: false,
		allowUndefined: true
	});
};

const visitStaticProperty = (
	context: Rule.RuleContext,
	prop: Property,
	visit: PropertyVisitor
) => {
	if (prop.computed) {
		reportDynamic(context, prop.key);
		return;
	}

	visit(prop);
};

const forEachStaticProperty = (
	context: Rule.RuleContext,
	node: ObjectExpression,
	visit: PropertyVisitor
) => {
	for (const prop of node.properties) {
		if (prop.type === 'SpreadElement') {
			reportDynamic(context, prop);
			continue;
		}

		visitStaticProperty(context, prop, visit);
	}
};

// Like forEachStaticProperty, but a spread of an object literal is entered, as
// `sv()` reads the config it builds. `seen` stops an object that spreads
// itself (`const a = { ...a }`).
const forEachConfigProperty = (
	context: Rule.RuleContext,
	node: ObjectExpression,
	visit: PropertyVisitor,
	seen: Set<ObjectExpression>
) => {
	seen.add(node);

	for (const prop of node.properties) {
		if (prop.type === 'Property') {
			visitStaticProperty(context, prop, visit);
			continue;
		}

		const spread = resolveEnteredValue(prop.argument, context.sourceCode);

		if (spread.type !== 'ObjectExpression') {
			reportDynamic(context, prop);
			continue;
		}

		if (!seen.has(spread)) {
			forEachConfigProperty(context, spread, visit, seen);
		}
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

// Visits each property of the record `raw` resolves to; anything else is
// reported as dynamic.
const forEachResolvedProperty = (
	context: Rule.RuleContext,
	raw: Node,
	visit: PropertyVisitor
) => {
	const node = resolveStaticValue(raw, context.sourceCode);

	if (node.type !== 'ObjectExpression') {
		reportDynamic(context, node);
		return;
	}

	forEachStaticProperty(context, node, visit);
};

// Visits each element, resolved, of the array `raw` resolves to; anything else
// is reported as dynamic.
const forEachResolvedElement = (
	context: Rule.RuleContext,
	raw: Node,
	visit: NodeVisitor
) => {
	const node = resolveStaticValue(raw, context.sourceCode);

	if (node.type !== 'ArrayExpression') {
		reportDynamic(context, node);
		return;
	}

	forEachItemReportingSpread(context, node.elements, (item) => {
		visit(resolveStaticValue(item, context.sourceCode));
	});
};

// A slot-keyed record holds one class value per slot; anything else is a plain
// class value.
const checkVariantBranchValue = (
	context: Rule.RuleContext,
	raw: Node,
	slotNames: ReadonlySet<string>
) => {
	const node = resolveStaticValue(raw, context.sourceCode);
	const slotKeyed = collectSlotKeyedProperties(node, slotNames);

	if (slotKeyed) {
		for (const value of slotKeyed.values()) {
			checkConfigClassValueIsStatic(context, value);
		}
		return;
	}

	checkConfigClassValueIsStatic(context, node);
};

const checkVariantDefinition = (
	context: Rule.RuleContext,
	raw: Node,
	slotNames: ReadonlySet<string>
) => {
	const node = resolveStaticValue(raw, context.sourceCode);

	// A record is keyed by variant value; anything else is a boolean shorthand.
	if (node.type === 'ObjectExpression') {
		forEachStaticProperty(context, node, (prop) => {
			checkVariantBranchValue(context, prop.value, slotNames);
		});
		return;
	}

	checkConfigClassValueIsStatic(context, node);
};

const checkCompoundSlotsArray = (context: Rule.RuleContext, raw: Node) => {
	forEachResolvedElement(context, raw, (element) => {
		if (!isStaticStringNode(element)) {
			reportDynamic(context, element);
		}
	});
};

// Other keys on compound entries are runtime matchers and are not validated.
const checkCompoundEntryProperty = (
	context: Rule.RuleContext,
	prop: Property,
	hasSlotsKey: boolean,
	slotNames: ReadonlySet<string>
) => {
	const key = getKeyName(prop);

	if (key === 'class' || key === 'className') {
		// A compoundSlots entry already targets specific slots, so its class
		// value is plain; a compoundVariants class follows a variant branch's
		// shape and may be a slot-keyed record.
		if (hasSlotsKey) {
			checkConfigClassValueIsStatic(context, prop.value);
			return;
		}

		checkVariantBranchValue(context, prop.value, slotNames);
		return;
	}

	if (key === 'slots' && hasSlotsKey) {
		checkCompoundSlotsArray(context, prop.value);
	}
};

const checkCompoundEntries = (
	context: Rule.RuleContext,
	raw: Node,
	hasSlotsKey: boolean,
	slotNames: ReadonlySet<string>
) => {
	forEachResolvedElement(context, raw, (element) => {
		forEachResolvedProperty(context, element, (prop) => {
			checkCompoundEntryProperty(context, prop, hasSlotsKey, slotNames);
		});
	});
};

const checkSvConfigProperty = (
	context: Rule.RuleContext,
	prop: Property,
	slotNames: ReadonlySet<string>
) => {
	// A key left `undefined` is one the config doesn't set.
	if (isUndefinedValue(resolveStaticValue(prop.value, context.sourceCode))) {
		return;
	}

	const key = getKeyName(prop);

	if (key === 'base') {
		checkConfigClassValueIsStatic(context, prop.value);
		return;
	}

	if (key === 'slots') {
		forEachResolvedProperty(context, prop.value, (slot) => {
			checkConfigClassValueIsStatic(context, slot.value);
		});
		return;
	}

	if (key === 'variants') {
		forEachResolvedProperty(context, prop.value, (variant) => {
			checkVariantDefinition(context, variant.value, slotNames);
		});
		return;
	}

	if (key === 'compoundVariants') {
		checkCompoundEntries(context, prop.value, false, slotNames);
		return;
	}

	if (key === 'compoundSlots') {
		checkCompoundEntries(context, prop.value, true, slotNames);
	}
};

export const checkSvConfig = (
	context: Rule.RuleContext,
	configNode: ObjectExpression
) => {
	const { sourceCode } = context;
	const properties = getConfigProperties(configNode, sourceCode);
	const effective = new Set(properties.values());
	const slotNames = getConfigSlotNames(properties, sourceCode);
	// A spread object's key that a later one overrides is never read.
	const visit: PropertyVisitor = (prop) => {
		if (effective.has(prop.value)) {
			checkSvConfigProperty(context, prop, slotNames);
		}
	};

	forEachConfigProperty(context, configNode, visit, new Set());
};

export const checkCnArguments = (
	context: Rule.RuleContext,
	args: ReadonlyArray<Expression | SpreadElement>,
	isStyled: (node: Node) => boolean
) => {
	forEachItemReportingSpread(context, args, (arg) => {
		checkClassValueIsStatic(context, arg, { cnStyle: true, isStyled });
	});
};