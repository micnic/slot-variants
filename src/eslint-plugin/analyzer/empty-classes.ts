import type { Rule } from 'eslint';
import type { ArrayExpression, Node, ObjectExpression } from 'estree';
import { type ConfigMarkers, getConfigMarkers } from './call-matching.ts';
import { getKeyName } from './config-keys.ts';
import { resolveArray, resolveStaticValue } from './const-bindings.ts';
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

	if (!allowEmptyString && isEmptyStringNode(node)) {
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

// A record is a container: reported where it's used when empty, otherwise
// each of its values is visited. False when `rawValue` isn't a record.
const visitRecordForEmpty = (
	context: Rule.RuleContext,
	rawValue: Node,
	remove: EmptyFix | undefined,
	visitValue: ValueVisitor
): boolean => {
	const node = resolveStaticValue(rawValue, context.sourceCode);

	if (node.type !== 'ObjectExpression') {
		return false;
	}

	if (node.properties.length === 0) {
		context.report({
			node: rawValue,
			messageId: 'emptyObject',
			fix: remove
		});
		return true;
	}

	for (const value of getProperties(node).values()) {
		visitValue(value);
	}

	return true;
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
	const isRecord = visitRecordForEmpty(
		context,
		rawValue,
		undefined,
		(value) => {
			visitVariantValueForEmpty(context, value);
		}
	);

	if (!isRecord) {
		visitForEmptyClasses(context, rawValue, true);
	}
};

const checkVariantsForEmpty = (
	context: Rule.RuleContext,
	rawValue: Node,
	remove: EmptyFix
) => {
	visitRecordForEmpty(context, rawValue, remove, (variantValue) => {
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
					node: raw,
					messageId: 'emptyMatcher',
					data: { key }
				});
			}
		}
	});
};

const checkCompoundsForEmpty = (
	context: Rule.RuleContext,
	rawValue: Node,
	remove: EmptyFix
) => {
	const value = resolveArray(rawValue, context.sourceCode);

	if (value === null) {
		return;
	}

	if (value.elements.length === 0) {
		context.report({
			node: rawValue,
			messageId: 'emptyArray',
			fix: remove
		});
		return;
	}

	checkCompoundMatchersForEmpty(context, value);

	forEachCompoundClass(value, context.sourceCode, (rawClass) => {
		const isRecord = visitRecordForEmpty(
			context,
			rawClass,
			undefined,
			(slotClass) => {
				visitForEmptyClasses(context, slotClass, false);
			}
		);

		if (!isRecord) {
			visitForEmptyClasses(context, rawClass, false);
		}
	});
};

const checkSlotsForEmpty = (
	context: Rule.RuleContext,
	rawValue: Node,
	remove: EmptyFix
) => {
	visitRecordForEmpty(context, rawValue, remove, (slotValue) => {
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
	rawValue,
	remove,
	key
) => {
	if (!isEmptyContainer(resolveStaticValue(rawValue, context.sourceCode))) {
		return;
	}

	context.report({
		node: rawValue,
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

// An empty `slots` or `variants` is what makes the object a config while it's
// the only one of the two the config defines, so it isn't reported then. When
// both are defined and `slots` is empty, `variants` is the one to keep:
// removing every marker would turn the config into a class record.
const getMarkerToKeep = (
	{ slots, variants }: ConfigMarkers,
	isEmpty: (key: string) => boolean
): string | null => {
	if (!variants) {
		return 'slots';
	}

	if (!slots || isEmpty('slots')) {
		return 'variants';
	}

	return null;
};

// The empty marker left unreported, if any. Only the config's own properties
// are reported, so a marker a spread object holds is never removed.
const getKeptMarker = (
	context: Rule.RuleContext,
	config: ObjectExpression
): string | null => {
	const resolve = (node: Node) =>
		resolveStaticValue(node, context.sourceCode);
	const own = getProperties(config);
	const isEmpty = (key: string) => {
		const value = own.get(key);

		return value !== undefined && isEmptyContainer(resolve(value));
	};
	const marker = getMarkerToKeep(
		getConfigMarkers(config, context.sourceCode),
		isEmpty
	);

	if (marker !== null && isEmpty(marker)) {
		return marker;
	}

	return null;
};

// A `createSV()` factory config may carry a spread or computed key (reported
// as dynamic by no-dynamic-classes); those aren't class-bearing, so they're
// skipped here. Each checker gets the value as written and resolves it, so an
// empty value read through a `const` is reported in this config.
export const checkConfigForEmptyClasses = (
	context: Rule.RuleContext,
	config: ObjectExpression
) => {
	const keptMarker = getKeptMarker(context, config);

	for (const prop of config.properties) {
		if (prop.type !== 'Property') {
			continue;
		}

		const key = getKeyName(prop);

		if (key === null) {
			continue;
		}

		const checker = svEmptyConfigValueCheckers.get(key);

		if (checker && key !== keptMarker) {
			checker(
				context,
				prop.value,
				makeListFix(context, prop, config.properties),
				key
			);
		}
	}
};