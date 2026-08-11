import type { Rule, SourceCode } from 'eslint';
import type { Node, ObjectExpression } from 'estree';
import { getKeyName } from './config-keys.ts';
import { type ListItems, makeListFix } from './list-fix.ts';
import {
	canHoistAsLiteral,
	getInnerText,
	getQuoteChar,
	getStaticStringText
} from './literals.ts';
import {
	collectSlotKeyedProperties,
	EMPTY_PROPERTIES,
	getConfigSlotNames,
	getProperties,
	getStrictProperties
} from './properties.ts';
import { isUndefinedIdentifier } from './static-predicates.ts';
import {
	COMPOUND_NON_MATCHER_KEYS,
	extractTokens,
	forEachStaticItem,
	forEachStringLiteralElement,
	getStaticMatcherValues,
	isBooleanShorthandVariant
} from './token-extraction.ts';
import {
	type Entry,
	indexEntriesBySlotAndToken,
	reportEntryList,
	type TokenEntriesBySlot,
	variantSource
} from './token-model.ts';

// A variant is "exhaustive" when it has a defaultVariants entry, is listed in
// requiredVariants, or every variant is required (`requiredVariants: true`).
// Without coverage the prop can be undefined at runtime, so a shared token
// isn't guaranteed to render.
const intersectSharedTokensStep = (
	sharedTokens: Map<string, Set<string>>,
	valueMap: TokenEntriesBySlot
) => {
	for (const [slot, tokens] of sharedTokens) {
		const tokenMap = valueMap.get(slot);

		if (!tokenMap) {
			sharedTokens.delete(slot);
			continue;
		}

		for (const token of tokens) {
			if (!tokenMap.has(token)) {
				tokens.delete(token);
			}
		}

		if (tokens.size === 0) {
			sharedTokens.delete(slot);
		}
	}
};

const seedSharedTokens = (
	valueMap: TokenEntriesBySlot
): Map<string, Set<string>> => {
	const sharedTokens = new Map<string, Set<string>>();

	for (const [slot, tokenMap] of valueMap) {
		sharedTokens.set(slot, new Set(tokenMap.keys()));
	}

	return sharedTokens;
};

const intersectSharedTokensBySlot = (
	tokensByValue: TokenEntriesBySlot[]
): Map<string, Set<string>> => {
	const firstValueMap = tokensByValue[0];

	/* c8 ignore next 3 -- callers guarantee tokensByValue has at least two entries */
	if (!firstValueMap) {
		return new Map<string, Set<string>>();
	}

	const sharedTokens = seedSharedTokens(firstValueMap);

	for (const valueMap of tokensByValue.slice(1)) {
		intersectSharedTokensStep(sharedTokens, valueMap);

		if (sharedTokens.size === 0) {
			break;
		}
	}

	return sharedTokens;
};

// The tokens of a static class string, in source order — the shared inputs
// to both a fix plan's target rewrite (append) and value rewrites (remove).
const splitStaticTokens = (text: string): string[] =>
	text.trim().split(/\s+/).filter(Boolean);

// Token identity throughout this file is always the raw source substring (see
// `pushStringLiteralTokens`), so a fix's token math must match on that same raw
// text; diffing against the cooked value would silently miscompare whenever a
// token contains an escape sequence. Callers must have already confirmed
// `node` is a plain string/template literal.
const getRawInnerText = (context: Rule.RuleContext, node: Node): string =>
	getInnerText(context.sourceCode, node);

// Recomputes a literal node's text from a new token list, reusing
// no-redundant-spaces' quote-preserving rewrite (`canHoistAsLiteral`). Returns
// null when the new content can't be safely re-emitted at the node's own
// delimiter — in which case the whole fix is abandoned (see
// `planSharedTokensFix`), never partially applied. Callers are expected to
// have already confirmed `node` is a plain, directly-authored string/template
// literal (via `getStaticStringText`) before calling this.
const planLiteralRewrite = (
	context: Rule.RuleContext,
	node: Node,
	nextTokens: readonly string[]
): { node: Node; nextText: string; quote: string } | null => {
	const quote = getQuoteChar(context.sourceCode, node);
	const nextText = nextTokens.join(' ');

	if (!canHoistAsLiteral(nextText, quote)) {
		return null;
	}

	return { node, nextText, quote };
};

// The node holding `slot`'s contribution to a single variant value. Works from
// the raw (un-resolved) node so a hoisted `const` value isn't silently
// rewritten at its own declaration site.
const getRawSlotValueNode = (
	valueNode: Node,
	slot: string,
	slotNames: Set<string>
): Node | null => {
	const slotKeyed = collectSlotKeyedProperties(valueNode, slotNames);

	if (slotKeyed) {
		/* c8 ignore next -- `slot` only ever reaches here as a key `intersectSharedTokensBySlot` found present in every value's slot-keyed record, so `.get` always hits */
		return slotKeyed.get(slot) ?? null;
	}

	if (slot !== 'base') {
		return null;
	}

	return valueNode;
};

type LiteralRewrite = { node: Node; nextText: string; quote: string };

// Where a slot's lifted tokens go: the `base`/`slots[slot]` literal it already
// has, or the config object a `base` property has to be created in.
type SharedTokensTarget = { node: Node } | { createBaseIn: ObjectExpression };

type SharedTokensFixPlan = {
	target: LiteralRewrite | { insertBefore: Node; text: string };
	values: ReadonlyArray<LiteralRewrite>;
};

// Plans a fix that lifts every shared token of one (variant, slot) pair out
// of each variant value and into the slot's `base`/`slots[slot]` target in one
// atomic rewrite — or returns null when any piece isn't safely inferrable, in
// which case the finding is still reported, just without a fix. Eligibility
// requires the target and every variant value's contribution to this slot to
// be a plain, directly-authored string or template literal.
// The text of a `base` property to create, laid out like the config's existing
// first property so the insertion keeps the surrounding formatting: the same
// whitespace that separates `{` from that property is repeated after the comma.
const planBaseCreation = (
	context: Rule.RuleContext,
	config: ObjectExpression,
	sharedTokens: ReadonlySet<string>,
	quote: string
): { insertBefore: Node; text: string } | null => {
	const [firstProperty] = config.properties;

	/* c8 ignore next 3 -- a config with no properties has no variants to analyze */
	if (!firstProperty) {
		return null;
	}

	const nextText = [...sharedTokens].join(' ');

	/* c8 ignore next 3 -- same reason canHoistAsLiteral itself is ignored: a token that fails it carries a backslash, which makes the value rewrite above bail first */
	if (!canHoistAsLiteral(nextText, quote)) {
		return null;
	}

	const { sourceCode } = context;
	const gap = sourceCode
		.getText()
		.slice(
			sourceCode.getRange(config)[0] + 1,
			sourceCode.getRange(firstProperty)[0]
		);

	return {
		insertBefore: firstProperty,
		text: `base: ${quote}${nextText}${quote},${gap}`
	};
};

// Each variant value's contribution to `slot`, rewritten without the shared
// tokens. Null when any one of them can't be rewritten safely, so the fix is
// abandoned whole rather than applied to some values and not others.
const planValueRewrites = (
	context: Rule.RuleContext,
	slot: string,
	sharedTokens: ReadonlySet<string>,
	valueEntries: ReadonlyMap<string, Node>,
	slotNames: Set<string>
): LiteralRewrite[] | null => {
	const values: LiteralRewrite[] = [];

	for (const valueNode of valueEntries.values()) {
		const slotNode = getRawSlotValueNode(valueNode, slot, slotNames);

		if (!slotNode) {
			return null;
		}

		if (getStaticStringText(slotNode) === null) {
			return null;
		}

		const remainingTokens = splitStaticTokens(
			getRawInnerText(context, slotNode)
		).filter((token) => !sharedTokens.has(token));

		// Lifting every token out would leave an empty class string behind, which
		// no-empty-classes then reports — so there's no rewrite here that leaves
		// the config clean. Whether the value should keep an empty string or go
		// away entirely is the author's call, so the finding is reported unfixed.
		if (remainingTokens.length === 0) {
			return null;
		}

		const valuePlan = planLiteralRewrite(
			context,
			slotNode,
			remainingTokens
		);

		if (!valuePlan) {
			return null;
		}

		values.push(valuePlan);
	}

	return values;
};

// The shared tokens appended to the slot's existing target literal, or the
// `base` property to create when it has none. `quote` is the delimiter the
// variant values use, which a created property borrows for want of one of its
// own.
const planTargetRewrite = (
	context: Rule.RuleContext,
	target: SharedTokensTarget,
	sharedTokens: ReadonlySet<string>,
	quote: string
): SharedTokensFixPlan['target'] | null => {
	if ('createBaseIn' in target) {
		return planBaseCreation(
			context,
			target.createBaseIn,
			sharedTokens,
			quote
		);
	}

	if (getStaticStringText(target.node) === null) {
		return null;
	}

	const targetTokens = splitStaticTokens(
		getRawInnerText(context, target.node)
	);
	const missingShared = [...sharedTokens].filter(
		(token) => !targetTokens.includes(token)
	);

	return planLiteralRewrite(context, target.node, [
		...targetTokens,
		...missingShared
	]);
};

const planSharedTokensFix = (
	context: Rule.RuleContext,
	slot: string,
	sharedTokens: ReadonlySet<string>,
	valueEntries: ReadonlyMap<string, Node>,
	slotNames: Set<string>,
	target: SharedTokensTarget | null
): SharedTokensFixPlan | null => {
	/* c8 ignore next 3 -- null only for the impossible missing-slot case above */
	if (!target) {
		return null;
	}

	const values = planValueRewrites(
		context,
		slot,
		sharedTokens,
		valueEntries,
		slotNames
	);

	if (values === null) {
		return null;
	}

	const [firstValue] = values;

	/* c8 ignore next 3 -- a shared token needs at least one value to be shared by */
	if (!firstValue) {
		return null;
	}

	const targetPlan = planTargetRewrite(
		context,
		target,
		sharedTokens,
		firstValue.quote
	);

	if (!targetPlan) {
		return null;
	}

	return { target: targetPlan, values };
};

const literalReplacement = (part: {
	node: Node;
	nextText: string;
	quote: string;
}): { node: Node; text: string } => ({
	node: part.node,
	text: `${part.quote}${part.nextText}${part.quote}`
});

const applySharedTokensFixPlan = (
	fixer: Rule.RuleFixer,
	plan: SharedTokensFixPlan
): Rule.Fix[] => {
	const fixes = plan.values.map((part) => {
		const { node, text } = literalReplacement(part);

		return fixer.replaceText(node, text);
	});

	const { target } = plan;

	if ('insertBefore' in target) {
		fixes.push(fixer.insertTextBefore(target.insertBefore, target.text));

		return fixes;
	}

	const { node, text } = literalReplacement(target);

	fixes.push(fixer.replaceText(node, text));

	return fixes;
};

const reportSharedTokenEntries = (
	context: Rule.RuleContext,
	tokensByValue: TokenEntriesBySlot[],
	variantKey: string,
	slot: string,
	token: string,
	plan: SharedTokensFixPlan | null
) => {
	const fix = plan
		? (fixer: Rule.RuleFixer) => applySharedTokensFixPlan(fixer, plan)
		: undefined;

	for (const valueMap of tokensByValue) {
		const entryList = valueMap.get(slot)?.get(token);

		/* c8 ignore next 3 -- `sharedTokens` only retains tokens present in every value map */
		if (!entryList) {
			continue;
		}

		reportEntryList(
			context,
			entryList,
			'shared',
			{ token, variant: variantKey, slot },
			fix
		);
	}
};

const reportSharedTokensBySlot = (
	context: Rule.RuleContext,
	sharedTokens: Map<string, Set<string>>,
	tokensByValue: TokenEntriesBySlot[],
	variantKey: string,
	valueEntries: ReadonlyMap<string, Node>,
	slotNames: Set<string>,
	getTarget: (slot: string) => SharedTokensTarget | null
) => {
	for (const [slot, tokens] of sharedTokens) {
		const plan = planSharedTokensFix(
			context,
			slot,
			tokens,
			valueEntries,
			slotNames,
			getTarget(slot)
		);

		for (const token of tokens) {
			reportSharedTokenEntries(
				context,
				tokensByValue,
				variantKey,
				slot,
				token,
				plan
			);
		}
	}
};

const isStaticDefinedDefaultVariantValue = (node: Node): boolean => {
	if (isUndefinedIdentifier(node)) {
		return false;
	}

	if (getStaticStringText(node) !== null) {
		return true;
	}

	return (
		node.type === 'Literal' &&
		(typeof node.value === 'boolean' || typeof node.value === 'number')
	);
};

const collectDefaultVariantKeys = (
	defaultVariants: Node | undefined
): Set<string> => {
	const keys = new Set<string>();

	for (const [key, value] of getProperties(defaultVariants)) {
		if (isStaticDefinedDefaultVariantValue(value)) {
			keys.add(key);
		}
	}

	return keys;
};

const isLiteralTrue = (node: Node): boolean =>
	node.type === 'Literal' && node.value === true;

const collectExhaustiveVariantKeys = (
	config: ReadonlyMap<string, Node>
): Set<string> => {
	const exhaustive = collectDefaultVariantKeys(config.get('defaultVariants'));
	const requiredVariants = config.get('requiredVariants');

	if (!requiredVariants) {
		return exhaustive;
	}

	// `requiredVariants: true` makes every variant required — hence exhaustive.
	if (isLiteralTrue(requiredVariants)) {
		for (const key of getProperties(config.get('variants')).keys()) {
			exhaustive.add(key);
		}

		return exhaustive;
	}

	forEachStringLiteralElement(requiredVariants, (value) => {
		exhaustive.add(value);
	});

	return exhaustive;
};

const collectVariantTokensByValue = (
	variantEntries: ReadonlyMap<string, Node>,
	variantKey: string,
	slotNames: Set<string>,
	sourceCode: SourceCode
): TokenEntriesBySlot[] => {
	const tokensByValue: TokenEntriesBySlot[] = [];

	for (const [valueKey, valueNode] of variantEntries) {
		const entries: Entry[] = [];

		extractTokens(
			valueNode,
			'base',
			variantSource(variantKey, valueKey),
			slotNames,
			entries,
			sourceCode
		);

		tokensByValue.push(indexEntriesBySlotAndToken(entries));
	}

	return tokensByValue;
};

const analyzeVariantSharedTokens = (
	context: Rule.RuleContext,
	variantKey: string,
	variantValue: Node,
	slotNames: Set<string>,
	getTarget: (slot: string) => SharedTokensTarget | null
) => {
	// Boolean shorthand has a single branch — no cross-value comparison.
	if (isBooleanShorthandVariant(variantValue, slotNames)) {
		return;
	}

	const valueEntries = getStrictProperties(variantValue);

	// A spread or computed key means we can't see every value, so we'd
	// over-flag tokens that may differ in the unseen branches. An empty record
	// has no tokens to compare and is reported by no-empty-classes instead. A
	// single value needs no comparison — the variant is exhaustive, so that one
	// value always applies and every token in it is constant.
	if (!valueEntries || valueEntries.size === 0) {
		return;
	}

	const { sourceCode } = context;
	const tokensByValue = collectVariantTokensByValue(
		valueEntries,
		variantKey,
		slotNames,
		sourceCode
	);

	const sharedTokens = intersectSharedTokensBySlot(tokensByValue);

	reportSharedTokensBySlot(
		context,
		sharedTokens,
		tokensByValue,
		variantKey,
		valueEntries,
		slotNames,
		getTarget
	);
};

type SingleMatcher = { key: string; value: Node };

// The one variant-key matcher on a compound entry, or null when the entry
// doesn't have exactly one: no matcher at all, two or more, or a shape that
// can't be counted reliably (a spread or computed key might hide another
// matcher, so the whole entry is skipped rather than risk under-reporting a
// hidden key as if it weren't there).
const getSingleCompoundMatcher = (
	element: ObjectExpression
): SingleMatcher | null => {
	const matchers: SingleMatcher[] = [];
	let hasClass = false;

	for (const prop of element.properties) {
		if (prop.type !== 'Property' || prop.computed) {
			return null;
		}

		const key = getKeyName(prop);

		/* c8 ignore next 3 -- getKeyName only returns null for a computed key, already excluded above */
		if (key === null) {
			return null;
		}

		if (COMPOUND_NON_MATCHER_KEYS.has(key)) {
			if (key === 'class' || key === 'className') {
				hasClass = true;
			}

			continue;
		}

		matchers.push({ key, value: prop.value });
	}

	const [matcher] = matchers;

	if (!hasClass || !matcher || matchers.length > 1) {
		return null;
	}

	return matcher;
};

// Merges the compound's class tokens into one target variant-value literal,
// keeping the literal's own tokens first and skipping any the class already
// contains. Returns null the moment any piece isn't safely rewritable, same
// as `no-shared-tokens`' own fix planning — the whole fix is abandoned rather
// than partially applied.
const planSingleKeyTargetRewrite = (
	context: Rule.RuleContext,
	targetNode: Node,
	clsTokens: readonly string[]
): LiteralRewrite | null => {
	if (getStaticStringText(targetNode) === null) {
		return null;
	}

	const targetTokens = splitStaticTokens(
		getRawInnerText(context, targetNode)
	);
	const missing = clsTokens.filter((token) => !targetTokens.includes(token));

	return planLiteralRewrite(context, targetNode, [
		...targetTokens,
		...missing
	]);
};

// Plans merging a single-key `compoundVariants` entry's class into every
// variant value its matcher statically resolves to, plus removing the entry
// itself. Only attempted for `compoundVariants` — `compoundSlots`' class
// belongs on a specific slot rather than the whole variant value, which is
// enough extra shape to leave unfixed for now. Any of: a dynamic class, an
// unreadable matcher value, a missing or non-literal target value, aborts the
// whole plan, leaving the finding reported without a fix.
const planSingleKeyCompoundFix = (
	context: Rule.RuleContext,
	element: ObjectExpression,
	clsNode: Node,
	matcher: SingleMatcher,
	variantValue: ObjectExpression,
	siblingElements: ListItems
): ((fixer: Rule.RuleFixer) => Rule.Fix[] | null) | null => {
	const clsText = getStaticStringText(clsNode);

	if (clsText === null) {
		return null;
	}

	const clsTokens = splitStaticTokens(clsText);

	if (clsTokens.length === 0) {
		return null;
	}

	const matcherValues = getStaticMatcherValues(matcher.value);

	if (!matcherValues) {
		return null;
	}

	const valueEntries = getStrictProperties(variantValue);

	if (!valueEntries) {
		return null;
	}

	const rewrites: LiteralRewrite[] = [];

	for (const value of matcherValues) {
		const targetNode = valueEntries.get(value);

		if (!targetNode) {
			return null;
		}

		const rewrite = planSingleKeyTargetRewrite(
			context,
			targetNode,
			clsTokens
		);

		if (!rewrite) {
			return null;
		}

		rewrites.push(rewrite);
	}

	const removeEntry = makeListFix(context, element, siblingElements);

	return (fixer) => {
		const removal = removeEntry(fixer);

		if (!removal) {
			return null;
		}

		return [
			removal,
			...rewrites.map((rewrite) => {
				const { node, text } = literalReplacement(rewrite);

				return fixer.replaceText(node, text);
			})
		];
	};
};

const checkCompoundEntryForSingleKey = (
	context: Rule.RuleContext,
	element: ObjectExpression,
	kind: 'compoundVariants' | 'compoundSlots',
	variantsMap: ReadonlyMap<string, Node>,
	slotNames: Set<string>,
	siblingElements: ListItems
) => {
	const matcher = getSingleCompoundMatcher(element);

	if (!matcher) {
		return;
	}

	const variantValue = variantsMap.get(matcher.key);

	if (!variantValue || variantValue.type !== 'ObjectExpression') {
		return;
	}

	// Boolean shorthand has only one branch — there's no "other" value to hold
	// the class for the matcher's false case, so this isn't the same
	// simplification.
	if (isBooleanShorthandVariant(variantValue, slotNames)) {
		return;
	}

	const properties = getProperties(element);
	const clsNode = properties.get('class') ?? properties.get('className');

	/* c8 ignore next 3 -- getSingleCompoundMatcher already confirmed a class/className property exists */
	if (!clsNode) {
		return;
	}

	const fix =
		kind === 'compoundVariants'
			? planSingleKeyCompoundFix(
					context,
					element,
					clsNode,
					matcher,
					variantValue,
					siblingElements
				)
			: null;

	context.report({
		node: element,
		messageId: 'singleKeyCompound',
		data: {
			kind,
			key: matcher.key,
			value: context.sourceCode.getText(matcher.value)
		},
		fix: fix ?? undefined
	});
};

const checkCompoundsForSingleKey = (
	context: Rule.RuleContext,
	compoundNode: Node | undefined,
	kind: 'compoundVariants' | 'compoundSlots',
	variantsMap: ReadonlyMap<string, Node>,
	slotNames: Set<string>
) => {
	if (!compoundNode || compoundNode.type !== 'ArrayExpression') {
		return;
	}

	forEachStaticItem(compoundNode.elements, (element) => {
		if (element.type !== 'ObjectExpression') {
			return;
		}

		checkCompoundEntryForSingleKey(
			context,
			element,
			kind,
			variantsMap,
			slotNames,
			compoundNode.elements
		);
	});
};

const analyzeExhaustiveVariants = (
	context: Rule.RuleContext,
	variants: ObjectExpression,
	exhaustive: Set<string>,
	slotNames: Set<string>,
	getTarget: (slot: string) => SharedTokensTarget | null
) => {
	for (const [variantKey, variantValue] of getProperties(variants)) {
		if (!exhaustive.has(variantKey)) {
			continue;
		}

		analyzeVariantSharedTokens(
			context,
			variantKey,
			variantValue,
			slotNames,
			getTarget
		);
	}
};

export const analyzeSharedTokens = (
	context: Rule.RuleContext,
	configNode: ObjectExpression
) => {
	const config = getProperties(configNode);
	const variants = config.get('variants');
	const slotNames = getConfigSlotNames(config);
	const variantsMap =
		variants && variants.type === 'ObjectExpression'
			? getProperties(variants)
			: EMPTY_PROPERTIES;

	checkCompoundsForSingleKey(
		context,
		config.get('compoundVariants'),
		'compoundVariants',
		variantsMap,
		slotNames
	);
	checkCompoundsForSingleKey(
		context,
		config.get('compoundSlots'),
		'compoundSlots',
		variantsMap,
		slotNames
	);

	if (!variants || variants.type !== 'ObjectExpression') {
		return;
	}

	const baseNode = config.get('base');
	const slotProperties = getProperties(config.get('slots'));

	const getTarget = (slot: string): SharedTokensTarget | null => {
		if (slot !== 'base') {
			const slotNode = slotProperties.get(slot);

			// A group name has no `slots` entry of its own to lift the token
			// into, so the finding is reported without a fix
			if (!slotNode) {
				return null;
			}

			return { node: slotNode };
		}

		if (baseNode) {
			return { node: baseNode };
		}

		// A config with no `base` yet: the tokens still belong there, so the
		// property is created rather than the finding left unfixed.
		return { createBaseIn: configNode };
	};

	analyzeExhaustiveVariants(
		context,
		variants,
		collectExhaustiveVariantKeys(config),
		slotNames,
		getTarget
	);
};