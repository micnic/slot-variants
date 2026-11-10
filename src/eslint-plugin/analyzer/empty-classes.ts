import type { Rule } from 'eslint';
import type { ArrayExpression, Node, ObjectExpression } from 'estree';
import { getKeyName } from './config-keys.ts';
import { resolveStaticValue } from './const-bindings.ts';
import { type EmptyFix, makeListFix } from './list-fix.ts';
import { getStaticStringText } from './literals.ts';
import { getProperties } from './properties.ts';
import {
	COMPOUND_NON_MATCHER_KEYS,
	forEachCnBranch,
	forEachCompoundClass,
	forEachStaticItem,
	forEachStringRecordKey
} from './token-extraction.ts';

type EmptyConfigChecker = (
	context: Rule.RuleContext,
	value: Node,
	remove: EmptyFix,
	key: string
) => void;

type ValueVisitor = (value: Node) => void;

const isEmptyStringNode = (node: Node): boolean =>
	getStaticStringText(node) === '';

const resolvesToEmptyString = (context: Rule.RuleContext, node: Node) =>
	isEmptyStringNode(resolveStaticValue(node, context.sourceCode));

// The fix a cn-style branch inherits, which removes the whole enclosing
// argument or element. An `&&` applies classes only through its right
// operand, so it always inherits it; a ternary only when both branches are
// empty — otherwise the removal would drop the other branch's classes.
const getBranchFix = (
	context: Rule.RuleContext,
	node: Node,
	fix: EmptyFix | undefined
): EmptyFix | undefined => {
	if (node.type !== 'ConditionalExpression') {
		return fix;
	}

	if (
		resolvesToEmptyString(context, node.consequent) &&
		resolvesToEmptyString(context, node.alternate)
	) {
		return fix;
	}

	return undefined;
};

const shouldReportEmptyString = (
	node: Node,
	allowEmptyString: boolean
): boolean => !allowEmptyString && isEmptyStringNode(node);

// In cn-style position an ObjectExpression is a clsx-style
// record whose keys are the class strings, so an empty
// string-literal key is an empty class value.
const checkRecordKeysForEmpty = (
	context: Rule.RuleContext,
	node: ObjectExpression
) => {
	forEachStringRecordKey(node, (key, text) => {
		if (text === '') {
			context.report({ node: key, messageId: 'emptyString' });
		}
	});
};

const visitArrayForEmptyClasses = (
	context: Rule.RuleContext,
	node: ArrayExpression,
	site: Node,
	fix: EmptyFix | undefined,
	cnStyle: boolean
) => {
	if (node.elements.length === 0) {
		context.report({ node: site, messageId: 'emptyArray', fix });
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

// `allowEmptyString` is set at the top of a `slots[key]` value, where `''` is
// a meaningful "slot with no default classes" declaration. `cnStyle` marks a
// cn-style position, where an ObjectExpression is a clsx-style record and a
// `&&`/ternary is a runtime branch rather than a class value itself.
export const visitForEmptyClasses = (
	context: Rule.RuleContext,
	node: Node,
	allowEmptyString: boolean,
	fix?: EmptyFix,
	cnStyle = false
) => {
	// An empty value read through a `const` is reported where it's used:
	// that's what the fix removes, and the declaration may serve other uses.
	const site = node;

	node = resolveStaticValue(node, context.sourceCode);

	if (shouldReportEmptyString(node, allowEmptyString)) {
		context.report({ node: site, messageId: 'emptyString', fix });
		return;
	}

	const isBranch =
		cnStyle &&
		forEachCnBranch(node, (branch) => {
			visitForEmptyClasses(
				context,
				branch,
				false,
				getBranchFix(context, node, fix),
				true
			);
		});

	if (isBranch) {
		return;
	}

	if (node.type === 'ArrayExpression') {
		visitArrayForEmptyClasses(context, node, site, fix, cnStyle);
		return;
	}

	if (node.type === 'ObjectExpression') {
		if (node.properties.length === 0) {
			context.report({ node: site, messageId: 'emptyObject', fix });
			return;
		}

		if (cnStyle) {
			checkRecordKeysForEmpty(context, node);
		}
	}
};

// A record is a container: reported when empty, otherwise each of its values
// is visited.
const visitRecordForEmpty = (
	context: Rule.RuleContext,
	node: ObjectExpression,
	remove: EmptyFix | undefined,
	visitValue: ValueVisitor
) => {
	if (node.properties.length === 0) {
		context.report({ node, messageId: 'emptyObject', fix: remove });
		return;
	}

	for (const value of getProperties(node).values()) {
		visitValue(value);
	}
};

// Empty strings are allowed at a direct variant-value position — a plain
// value, a slot-keyed branch, a boolean shorthand — the same way `slots[key]`
// allows them: a variant value that adds no classes is a meaningful
// declaration. The records along the way are containers, so they're still
// reported when empty, and `visitForEmptyClasses` doesn't carry the allowance
// into array elements.
const visitVariantValueForEmpty = (
	context: Rule.RuleContext,
	rawValue: Node
) => {
	const variantValue = resolveStaticValue(rawValue, context.sourceCode);

	if (variantValue.type === 'ObjectExpression') {
		visitRecordForEmpty(context, variantValue, undefined, (value) => {
			visitVariantValueForEmpty(context, value);
		});
		return;
	}

	visitForEmptyClasses(context, variantValue, true);
};

const checkVariantsForEmpty = (
	context: Rule.RuleContext,
	value: Node,
	remove: EmptyFix
) => {
	if (value.type !== 'ObjectExpression') {
		return;
	}

	visitRecordForEmpty(context, value, remove, (variantValue) => {
		visitVariantValueForEmpty(context, variantValue);
	});
};

const isEmptyArrayLiteral = (node: Node): boolean =>
	node.type === 'ArrayExpression' && node.elements.length === 0;

// A compound matcher (any entry key other than `class`/`className`/`slots`)
// whose value is a literal empty array could never match, so `sv()` rejects
// it: the config throws when it's compiled.
const checkCompoundMatchersForEmpty = (
	context: Rule.RuleContext,
	compoundEntries: ArrayExpression
) => {
	forEachStaticItem(compoundEntries.elements, (element) => {
		const entry = resolveStaticValue(element, context.sourceCode);

		for (const [key, raw] of getProperties(entry)) {
			if (COMPOUND_NON_MATCHER_KEYS.has(key)) {
				continue;
			}

			const value = resolveStaticValue(raw, context.sourceCode);

			if (isEmptyArrayLiteral(value)) {
				context.report({
					node: value,
					messageId: 'emptyMatcher',
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

	forEachCompoundClass(value, context.sourceCode, (rawClass) => {
		const cls = resolveStaticValue(rawClass, context.sourceCode);

		if (cls.type === 'ObjectExpression') {
			visitRecordForEmpty(context, cls, undefined, (slotClass) => {
				visitForEmptyClasses(context, slotClass, false);
			});

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

	visitRecordForEmpty(context, value, remove, (slotValue) => {
		visitForEmptyClasses(context, slotValue, true);
	});
};

// `[]` and `{}` are the empty forms of a config container. `requiredVariants`
// and `multiSlots` also accept a boolean, which is never empty.
const isEmptyContainer = (value: Node): boolean => {
	if (value.type === 'ObjectExpression') {
		return value.properties.length === 0;
	}

	return isEmptyArrayLiteral(value);
};

// The config containers that hold no class values of their own — variant
// selections and slot/variant name lists. Empty, each is inert: it reads as
// configuration but changes nothing about the output, so it's reported to be
// removed rather than left to look meaningful.
const checkEmptyConfigContainer: EmptyConfigChecker = (
	context,
	value,
	remove,
	key
) => {
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

// A Map rather than a plain object: a `createSV()` config may hold any key,
// and a key named like an `Object.prototype` member (`toString`,
// `__defineGetter__`) must find no checker.
const svEmptyConfigValueCheckers: ReadonlyMap<string, EmptyConfigChecker> =
	new Map<string, EmptyConfigChecker>([
		[
			'base',
			(context, node, remove) => {
				visitForEmptyClasses(context, node, false, remove);
			}
		],
		['slots', checkSlotsForEmpty],
		['groups', checkEmptyConfigContainer],
		['variants', checkVariantsForEmpty],
		['compoundVariants', checkCompoundsForEmpty],
		['compoundSlots', checkCompoundsForEmpty],
		['defaultVariants', checkEmptyConfigContainer],
		['requiredVariants', checkEmptyConfigContainer],
		['multiSlots', checkEmptyConfigContainer],
		['presets', checkEmptyConfigContainer]
	]);

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

		const checker = svEmptyConfigValueCheckers.get(key);

		if (checker) {
			checker(
				context,
				resolveStaticValue(prop.value, context.sourceCode),
				makeListFix(context, prop, config.properties),
				key
			);
		}
	}
};