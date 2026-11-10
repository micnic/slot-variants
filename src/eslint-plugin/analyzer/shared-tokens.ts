import type { Rule, SourceCode } from 'eslint';
import type { Node, ObjectExpression } from 'estree';
import { resolveContainer, resolveStaticValue } from './const-bindings.ts';
import { type ListItems, makeListFix } from './list-fix.ts';
import {
	canHoistAsLiteral,
	getRawLiteralTokens,
	type LiteralRewrite,
	planLiteralRewrite,
	replaceLiteral
} from './literals.ts';
import {
	collectSlotKeyedProperties,
	getClassValue,
	getConfigSlotNames,
	getProperties,
	getStrictProperties
} from './properties.ts';
import {
	COMPOUND_NON_MATCHER_KEYS,
	extractTokens,
	forEachStaticItem,
	forEachStringLiteralElement,
	getStaticMatcherValue,
	getStaticMatcherValues,
	isBooleanShorthandVariant
} from './token-extraction.ts';
import {
	type Entry,
	type EntryListFixer,
	type EntryRemedy,
	indexEntriesBySlotAndToken,
	reportEntryList,
	type TokenEntriesBySlot,
	variantSource
} from './token-model.ts';

// Slot -> token -> the token's entries in each variant value, in value order:
// the tokens every value shares, with what each value contributes.
type SharedEntries = Map<string, Map<string, Entry[][]>>;

// How a variant is known to apply one of its values. `required` (listed in
// requiredVariants, or `requiredVariants: true`) always does — leaving it
// out or passing `null` throws. `default` (a defaultVariants entry) does
// unless a call passes `null`, which skips the default. Without either, the
// prop can be undefined at runtime, so a shared token isn't guaranteed to
// render.
type VariantCoverage = 'required' | 'default';

/** Where else a call's base classes are, besides its config's `base` field. */
export type SharedTokensCall = {
	// False where a `base` created in the config would replace another one,
	// like a `createSV()`-derived function's own default.
	canCreateBase: boolean;
	// The last leading class argument, when the config is the call's own
	// argument rather than a hoisted one other calls share.
	leadingArg: Node | null;
	// True where a `postProcess` inherited from a `createSV()` factory may
	// merge classes; the config's own one is read here.
	inheritsPostProcess: boolean;
};

const intersectSharedTokensStep = (
	sharedTokens: SharedEntries,
	valueMap: TokenEntriesBySlot
) => {
	for (const [slot, tokens] of sharedTokens) {
		const tokenMap = valueMap.get(slot);

		if (!tokenMap) {
			sharedTokens.delete(slot);
			continue;
		}

		for (const [token, entryLists] of tokens) {
			const entryList = tokenMap.get(token);

			if (entryList) {
				entryLists.push(entryList);
			} else {
				tokens.delete(token);
			}
		}

		if (tokens.size === 0) {
			sharedTokens.delete(slot);
		}
	}
};

const seedSharedTokens = (valueMap: TokenEntriesBySlot): SharedEntries => {
	const sharedTokens: SharedEntries = new Map();

	for (const [slot, tokenMap] of valueMap) {
		const tokens = new Map<string, Entry[][]>();

		for (const [token, entryList] of tokenMap) {
			tokens.set(token, [entryList]);
		}

		sharedTokens.set(slot, tokens);
	}

	return sharedTokens;
};

const intersectSharedTokensBySlot = (
	tokensByValue: TokenEntriesBySlot[]
): SharedEntries => {
	const firstValueMap = tokensByValue[0];

	/* c8 ignore next 3 -- callers ensure tokensByValue has 1+ entries */
	if (!firstValueMap) {
		return new Map();
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

// Appends to a literal whichever of `tokens` it doesn't already contain,
// keeping the literal's own tokens first. Null when the literal isn't static
// or the result can't be re-emitted safely.
const planAppendRewrite = (
	context: Rule.RuleContext,
	node: Node,
	tokens: Iterable<string>
): LiteralRewrite | null => {
	const existingTokens = getRawLiteralTokens(context.sourceCode, node);

	if (existingTokens === null) {
		return null;
	}

	const missingTokens = [...tokens].filter(
		(token) => !existingTokens.includes(token)
	);

	return planLiteralRewrite(context.sourceCode, node, [
		...existingTokens,
		...missingTokens
	]);
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
		/* c8 ignore next -- `slot` is in every value's record; `.get` hits */
		return slotKeyed.get(slot) ?? null;
	}

	if (slot !== 'base') {
		return null;
	}

	return valueNode;
};

// A `base` property to create, as text inserted ahead of the config's first
// property.
type BaseInsertion = { insertBefore: Node; text: string };

// Where a slot's lifted tokens go: the `base`/`slots[slot]` literal it already
// has, or the config object a `base` property has to be created in.
type SharedTokensTarget = { node: Node } | { createBaseIn: ObjectExpression };

// What a single-key compound fix needs from the config's scope.
type CompoundScope = Pick<SharedTokensScope, 'canEdit' | 'suggestOnly'>;

type SharedTokensFixPlan = {
	target: LiteralRewrite | BaseInsertion;
	values: ReadonlyArray<LiteralRewrite>;
};

// Where a variant's shared tokens can be lifted to, and which nodes a fix may
// rewrite at all: only those inside the config object, never a `const`
// container declared beside it that other configs may share.
type SharedTokensScope = {
	getTarget: (slot: string) => SharedTokensTarget | null;
	canEdit: (node: Node) => boolean;
	// A merging `postProcess` keeps the last of two conflicting classes, so
	// moving classes earlier may change which one wins: the fixes that do
	// are then offered as suggestions only.
	suggestOnly: boolean;
};

// The text of a `base` property to create, laid out like the config's existing
// first property so the insertion keeps the surrounding formatting: the
// whitespace leading to that property, after `{` and any comment there, is
// repeated after the comma.
const planBaseCreation = (
	context: Rule.RuleContext,
	config: ObjectExpression,
	sharedTokens: ReadonlySet<string>,
	quote: string
): BaseInsertion | null => {
	const [firstProperty] = config.properties;

	/* c8 ignore next 3 -- a config with no properties has no variants */
	if (!firstProperty) {
		return null;
	}

	const nextText = [...sharedTokens].join(' ');

	/* c8 ignore next 3 -- backslash tokens already bail in the rewrite above */
	if (!canHoistAsLiteral(nextText, quote)) {
		return null;
	}

	const { sourceCode } = context;
	const leadingText = sourceCode
		.getText()
		.slice(
			sourceCode.getRange(config)[0] + 1,
			sourceCode.getRange(firstProperty)[0]
		);
	// Only the whitespace after any comment there, so the comment isn't copied
	const gap = leadingText.slice(leadingText.trimEnd().length);

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

		const slotTokens = getRawLiteralTokens(context.sourceCode, slotNode);

		if (slotTokens === null) {
			return null;
		}

		const remainingTokens = slotTokens.filter(
			(token) => !sharedTokens.has(token)
		);

		// Lifting every token out would leave an empty class string
		// behind, which no-empty-classes then reports — so there's no
		// rewrite here that leaves the config clean. Whether the value
		// should keep an empty string or go away entirely is the author's
		// call, so the finding is reported unfixed.
		if (remainingTokens.length === 0) {
			return null;
		}

		const valuePlan = planLiteralRewrite(
			context.sourceCode,
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

	return planAppendRewrite(context, target.node, sharedTokens);
};

// Plans a fix that lifts every shared token of one (variant, slot) pair out
// of each variant value and into the slot's `base`/`slots[slot]` target in one
// atomic rewrite — or returns null when any piece isn't safely inferrable, in
// which case the finding is still reported, just without a fix. Eligibility
// requires the target and every variant value's contribution to this slot to
// be a plain, directly-authored string or template literal.
const planSharedTokensFix = (
	context: Rule.RuleContext,
	slot: string,
	sharedTokens: ReadonlySet<string>,
	valueEntries: ReadonlyMap<string, Node>,
	slotNames: Set<string>,
	target: SharedTokensTarget
): SharedTokensFixPlan | null => {
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

	/* c8 ignore next 3 -- a shared token always has a value sharing it */
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

const applySharedTokensFixPlan = (
	fixer: Rule.RuleFixer,
	plan: SharedTokensFixPlan
): Rule.Fix[] => {
	const fixes = plan.values.map((part) => replaceLiteral(fixer, part));

	const { target } = plan;

	if ('insertBefore' in target) {
		fixes.push(fixer.insertTextBefore(target.insertBefore, target.text));

		return fixes;
	}

	fixes.push(replaceLiteral(fixer, target));

	return fixes;
};

// A required variant always applies one of its values, so lifting the shared
// tokens leaves every output unchanged and is safe as an autofix. A defaulted
// one doesn't — `null` skips the default, and the lifted tokens would then
// apply where they didn't before — so the lift is only offered as a
// suggestion.
const getSharedTokensRemedy = (
	plan: SharedTokensFixPlan | null,
	coverage: VariantCoverage,
	variantKey: string,
	slot: string,
	suggestOnly: boolean
): EntryRemedy => {
	if (plan === null) {
		return {};
	}

	const fix: EntryListFixer = (fixer) =>
		applySharedTokensFixPlan(fixer, plan);
	const data = { variant: variantKey, slot };

	if (coverage === 'default') {
		return { suggest: [{ messageId: 'liftShared', data, fix }] };
	}

	if (suggestOnly) {
		return { suggest: [{ messageId: 'liftSharedOrder', data, fix }] };
	}

	return { fix };
};

const reportSharedTokenEntries = (
	context: Rule.RuleContext,
	entryLists: ReadonlyArray<ReadonlyArray<Entry>>,
	variantKey: string,
	slot: string,
	token: string,
	remedy: EntryRemedy
) => {
	for (const entryList of entryLists) {
		reportEntryList(
			context,
			entryList,
			'shared',
			{ token, variant: variantKey, slot },
			remedy
		);
	}
};

// Whether every node a lift rewrites may be edited. A created `base` is
// inserted into the config object itself, so only an existing target is
// checked.
const isPlanEditable = (
	plan: SharedTokensFixPlan,
	canEdit: (node: Node) => boolean
): boolean => {
	const { target } = plan;

	if ('node' in target && !canEdit(target.node)) {
		return false;
	}

	return plan.values.every((value) => canEdit(value.node));
};

const reportSharedTokensBySlot = (
	context: Rule.RuleContext,
	sharedTokens: SharedEntries,
	variantKey: string,
	coverage: VariantCoverage,
	valueEntries: ReadonlyMap<string, Node>,
	slotNames: Set<string>,
	scope: SharedTokensScope
) => {
	for (const [slot, tokens] of sharedTokens) {
		const target = scope.getTarget(slot);

		// A slot with no target to lift into is reported without a fix.
		let plan: SharedTokensFixPlan | null = null;

		if (target) {
			plan = planSharedTokensFix(
				context,
				slot,
				new Set(tokens.keys()),
				valueEntries,
				slotNames,
				target
			);
		}

		if (plan !== null && !isPlanEditable(plan, scope.canEdit)) {
			plan = null;
		}

		const remedy = getSharedTokensRemedy(
			plan,
			coverage,
			variantKey,
			slot,
			scope.suggestOnly
		);

		for (const [token, entryLists] of tokens) {
			reportSharedTokenEntries(
				context,
				entryLists,
				variantKey,
				slot,
				token,
				remedy
			);
		}
	}
};

const collectDefaultVariantKeys = (
	defaultVariants: Node | undefined
): Map<string, VariantCoverage> => {
	const coverage = new Map<string, VariantCoverage>();

	for (const [key, value] of getProperties(defaultVariants)) {
		if (getStaticMatcherValue(value) !== null) {
			coverage.set(key, 'default');
		}
	}

	return coverage;
};

const isLiteralTrue = (node: Node): boolean =>
	node.type === 'Literal' && node.value === true;

// How each covered variant is covered. A variant that's both defaulted and
// required counts as required (sv() rejects that config anyway).
const collectVariantCoverage = (
	config: ReadonlyMap<string, Node>,
	variantsMap: ReadonlyMap<string, Node>,
	sourceCode: SourceCode
): Map<string, VariantCoverage> => {
	const coverage = collectDefaultVariantKeys(
		resolveContainer(config.get('defaultVariants'), sourceCode)
	);
	const requiredVariants = resolveContainer(
		config.get('requiredVariants'),
		sourceCode
	);

	if (!requiredVariants) {
		return coverage;
	}

	// `requiredVariants: true` makes every variant required.
	if (isLiteralTrue(requiredVariants)) {
		for (const key of variantsMap.keys()) {
			coverage.set(key, 'required');
		}

		return coverage;
	}

	forEachStringLiteralElement(requiredVariants, sourceCode, (value) => {
		coverage.set(value, 'required');
	});

	return coverage;
};

// A record whose only value is keyed `true` or `false` still accepts the
// other boolean, which applies none of its classes.
const isLoneBooleanValue = (valueEntries: ReadonlyMap<string, Node>) =>
	valueEntries.size === 1 &&
	(valueEntries.has('true') || valueEntries.has('false'));

const collectVariantTokensByValue = (
	variantEntries: ReadonlyMap<string, Node>,
	variantKey: string,
	slotNames: Set<string>,
	sourceCode: SourceCode
): TokenEntriesBySlot[] => {
	const tokensByValue: TokenEntriesBySlot[] = [];

	for (const [valueKey, valueNode] of variantEntries) {
		const entries: Entry[] = [];

		extractTokens(valueNode, {
			slot: 'base',
			source: variantSource(variantKey, valueKey),
			slotNames,
			entries,
			sourceCode
		});

		tokensByValue.push(indexEntriesBySlotAndToken(entries));
	}

	return tokensByValue;
};

const analyzeVariantSharedTokens = (
	context: Rule.RuleContext,
	variantKey: string,
	coverage: VariantCoverage,
	rawValue: Node,
	slotNames: Set<string>,
	scope: SharedTokensScope
) => {
	const variantValue = resolveStaticValue(rawValue, context.sourceCode);

	// Boolean shorthand has a single branch — no cross-value comparison.
	if (isBooleanShorthandVariant(variantValue, slotNames)) {
		return;
	}

	const valueEntries = getStrictProperties(variantValue);

	// A spread or computed key means we can't see every value, so we'd
	// over-flag tokens that may differ in the unseen branches. An empty record
	// has no tokens to compare and is reported by no-empty-classes instead. A
	// single value needs no comparison — the variant is covered, so that one
	// value applies and every token in it is constant — unless it's a lone
	// boolean value, whose counterpart applies nothing.
	if (
		!valueEntries ||
		valueEntries.size === 0 ||
		isLoneBooleanValue(valueEntries)
	) {
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
		variantKey,
		coverage,
		valueEntries,
		slotNames,
		scope
	);
};

type SingleMatcher = { key: string; value: Node; cls: Node };

// The one variant-key matcher on a compound entry, plus the class it applies,
// or null when the entry has no class or doesn't have exactly one matcher: none
// at all, two or more (a `preset` brings its own), or a shape that can't be
// counted reliably (a spread or computed key might hide another matcher, so the
// whole entry is skipped rather than risk under-reporting a hidden key as if it
// weren't there).
const getSingleCompoundMatcher = (
	element: ObjectExpression
): SingleMatcher | null => {
	const properties = getStrictProperties(element);

	// A `preset` matcher adds that preset's variant values as matchers too, so
	// the entry is combining variants through it.
	if (!properties || properties.has('preset')) {
		return null;
	}

	const cls = getClassValue(properties);

	if (!cls) {
		return null;
	}

	let matcher: SingleMatcher | null = null;

	for (const [key, value] of properties) {
		if (COMPOUND_NON_MATCHER_KEYS.has(key)) {
			continue;
		}

		if (matcher) {
			return null;
		}

		matcher = { key, value, cls };
	}

	return matcher;
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
	matcher: SingleMatcher,
	variantValue: Node,
	siblingElements: ListItems,
	canEdit: (node: Node) => boolean
): EntryListFixer | undefined => {
	if (!canEdit(element)) {
		return undefined;
	}

	// Raw tokens, like the other shared-tokens fixers: the rewrite diffs and
	// re-emits source text, never cooked values.
	const clsTokens = getRawLiteralTokens(context.sourceCode, matcher.cls);

	if (clsTokens === null || clsTokens.length === 0) {
		return undefined;
	}

	const matcherValues = getStaticMatcherValues(matcher.value);

	if (!matcherValues) {
		return undefined;
	}

	const valueEntries = getStrictProperties(variantValue);

	if (!valueEntries) {
		return undefined;
	}

	const rewrites: LiteralRewrite[] = [];

	for (const value of matcherValues) {
		const targetNode = valueEntries.get(value);

		if (!targetNode || !canEdit(targetNode)) {
			return undefined;
		}

		// The compound's class tokens merge into each target literal; one that
		// can't be rewritten abandons the whole fix.
		const rewrite = planAppendRewrite(context, targetNode, clsTokens);

		if (!rewrite) {
			return undefined;
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
			...rewrites.map((rewrite) => replaceLiteral(fixer, rewrite))
		];
	};
};

// A single-key compound's class moves into its variant's value, ahead of every
// later variant's classes — so only a suggestion under a merging
// `postProcess`.
const getSingleKeyCompoundRemedy = (
	fix: EntryListFixer | undefined,
	key: string,
	suggestOnly: boolean
): EntryRemedy => {
	if (fix === undefined || !suggestOnly) {
		return { fix };
	}

	return {
		suggest: [{ messageId: 'moveCompoundClass', data: { key }, fix }]
	};
};

const checkCompoundEntryForSingleKey = (
	context: Rule.RuleContext,
	element: ObjectExpression,
	kind: 'compoundVariants' | 'compoundSlots',
	variantsMap: ReadonlyMap<string, Node>,
	slotNames: Set<string>,
	siblingElements: ListItems,
	scope: CompoundScope
) => {
	const matcher = getSingleCompoundMatcher(element);

	if (!matcher) {
		return;
	}

	const variantValue = resolveContainer(
		variantsMap.get(matcher.key),
		context.sourceCode
	);

	if (!variantValue) {
		return;
	}

	// Boolean shorthand (which includes any non-object value) has only one
	// branch — there's no "other" value to hold the class for the matcher's
	// false case, so this isn't the same simplification.
	if (isBooleanShorthandVariant(variantValue, slotNames)) {
		return;
	}

	let fix: EntryListFixer | undefined;

	if (kind === 'compoundVariants') {
		fix = planSingleKeyCompoundFix(
			context,
			element,
			matcher,
			variantValue,
			siblingElements,
			scope.canEdit
		);
	}

	context.report({
		node: element,
		messageId: 'singleKeyCompound',
		data: {
			kind,
			key: matcher.key,
			value: context.sourceCode.getText(matcher.value)
		},
		...getSingleKeyCompoundRemedy(fix, matcher.key, scope.suggestOnly)
	});
};

const checkCompoundsForSingleKey = (
	context: Rule.RuleContext,
	compoundNode: Node | undefined,
	kind: 'compoundVariants' | 'compoundSlots',
	variantsMap: ReadonlyMap<string, Node>,
	slotNames: Set<string>,
	scope: CompoundScope
) => {
	const compounds = resolveContainer(compoundNode, context.sourceCode);

	if (compounds === undefined || compounds.type !== 'ArrayExpression') {
		return;
	}

	forEachStaticItem(compounds.elements, (item) => {
		const element = resolveStaticValue(item, context.sourceCode);

		if (element.type !== 'ObjectExpression') {
			return;
		}

		checkCompoundEntryForSingleKey(
			context,
			element,
			kind,
			variantsMap,
			slotNames,
			compounds.elements,
			scope
		);
	});
};

const analyzeExhaustiveVariants = (
	context: Rule.RuleContext,
	variantsMap: ReadonlyMap<string, Node>,
	coverageByVariant: ReadonlyMap<string, VariantCoverage>,
	slotNames: Set<string>,
	scope: SharedTokensScope
) => {
	for (const [variantKey, variantValue] of variantsMap) {
		const coverage = coverageByVariant.get(variantKey);

		if (coverage === undefined) {
			continue;
		}

		analyzeVariantSharedTokens(
			context,
			variantKey,
			coverage,
			variantValue,
			slotNames,
			scope
		);
	}
};

export const analyzeSharedTokens = (
	context: Rule.RuleContext,
	configNode: ObjectExpression,
	{ canCreateBase, leadingArg, inheritsPostProcess }: SharedTokensCall
) => {
	const { sourceCode } = context;
	const config = getProperties(configNode);
	const slotNames = getConfigSlotNames(config, sourceCode);
	const variantsMap = getProperties(
		resolveContainer(config.get('variants'), sourceCode)
	);
	const [configStart, configEnd] = sourceCode.getRange(configNode);
	// A spread or computed key may override whatever a fix would edit or
	// create, so such a config's findings are reported without a fix.
	const isStrictConfig = getStrictProperties(configNode) !== null;
	const canEdit = (node: Node) => {
		if (!isStrictConfig) {
			return false;
		}

		if (node === leadingArg) {
			return true;
		}

		const [start, end] = sourceCode.getRange(node);

		return start >= configStart && end <= configEnd;
	};

	const suggestOnly = inheritsPostProcess || config.has('postProcess');

	checkCompoundsForSingleKey(
		context,
		config.get('compoundVariants'),
		'compoundVariants',
		variantsMap,
		slotNames,
		{ canEdit, suggestOnly }
	);
	checkCompoundsForSingleKey(
		context,
		config.get('compoundSlots'),
		'compoundSlots',
		variantsMap,
		slotNames,
		{ canEdit, suggestOnly }
	);

	if (variantsMap.size === 0) {
		return;
	}

	const baseNode = config.get('base');
	const slotProperties = getProperties(
		resolveContainer(config.get('slots'), sourceCode)
	);

	// A candidate other than the `base` field is passed over unless the tokens
	// can go into it, leaving the next one, or a created `base`, to take them.
	const canLiftInto = (node: Node) =>
		canEdit(node) && getRawLiteralTokens(sourceCode, node) !== null;

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

		// Without a `base` field, the tokens join base classes written
		// elsewhere, so the call keeps a single style for them
		const slotsBase = slotProperties.get('base');

		if (slotsBase && canLiftInto(slotsBase)) {
			return { node: slotsBase };
		}

		if (leadingArg && canLiftInto(leadingArg)) {
			return { node: leadingArg };
		}

		// Created inside the config, so not checked by `canEdit` later.
		if (!isStrictConfig || !canCreateBase) {
			return null;
		}

		// A config with no `base` yet: the tokens still belong there, so the
		// property is created rather than the finding left unfixed.
		return { createBaseIn: configNode };
	};

	analyzeExhaustiveVariants(
		context,
		variantsMap,
		collectVariantCoverage(config, variantsMap, sourceCode),
		slotNames,
		{ getTarget, canEdit, suggestOnly }
	);
};