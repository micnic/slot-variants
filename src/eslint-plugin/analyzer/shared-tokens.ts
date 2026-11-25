import type { Rule, SourceCode } from 'eslint';
import type { ArrayExpression, Node, ObjectExpression, Property } from 'estree';
import {
	isWithinNode,
	resolveArray,
	resolveContainer,
	resolveStaticValue
} from './const-bindings.ts';
import { countListItems, type EmptyFix, makeListFix } from './list-fix.ts';
import {
	getRawLiteralTokens,
	type LiteralRewrite,
	planLiteralRewrite,
	replaceLiteral
} from './literals.ts';
import {
	collectSlotKeyedProperties,
	getClassValue,
	getConfigRecord,
	getConfigSlotNames,
	getConfigProperties,
	getStrictProperties
} from './properties.ts';
import { isLiteralTrue, isUndefinedValue } from './static-predicates.ts';
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
	EMPTY_MATCHERS,
	type Entry,
	type EntryRemedy,
	indexEntriesBySlotAndToken,
	reportEntryList,
	type TokenEntriesBySlot
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

// How a compound entry would be removed, worked out only once a fix needs it.
type GetEntryRemoval = () => EmptyFix | undefined;

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
	// True where the `createSV()` factory makes every variant required, unless
	// the config sets its own `requiredVariants`.
	inheritsRequiresAll: boolean;
};

// A `base` property to create, as text inserted ahead of the config's first
// property.
type BaseInsertion = { insertBefore: Node; text: string };

// Where a slot's lifted tokens go: the `base`/`slots[slot]` literal it already
// has, or the config object a `base` property has to be created in.
type SharedTokensTarget = { node: Node } | { createBaseIn: ObjectExpression };

// Where a variant's shared tokens can be lifted to, and which nodes a fix may
// rewrite at all: only those inside the config object, never a `const`
// container declared beside it that other configs may share.
type SharedTokensScope = {
	slotNames: ReadonlySet<string>;
	getTarget: (slot: string) => SharedTokensTarget | null;
	canEdit: (node: Node) => boolean;
	// A merging `postProcess` keeps the last of two conflicting classes, so
	// moving classes earlier may change which one wins: the fixes that do
	// are then offered as suggestions only.
	suggestOnly: boolean;
	// True where a parent in `extend` may add values to a variant, which a
	// lift would then also reach.
	inherits: boolean;
};

// What a single-key compound fix needs from the config's scope.
type CompoundScope = Pick<SharedTokensScope, 'canEdit' | 'suggestOnly'>;

type SharedTokensFixPlan = {
	target: LiteralRewrite | BaseInsertion;
	values: ReadonlyArray<LiteralRewrite>;
};

type SingleMatcher = { key: string; value: Node; cls: Node };

type CompoundKind = 'compoundVariants' | 'compoundSlots';

const COMPOUND_KINDS: readonly CompoundKind[] = [
	'compoundVariants',
	'compoundSlots'
];

// Each value's entries of `token` in `slot`, null when some value has none.
const getEntryListsOfAll = (
	tokensByValue: ReadonlyArray<TokenEntriesBySlot>,
	slot: string,
	token: string
): Entry[][] | null => {
	const entryLists: Entry[][] = [];

	for (const valueMap of tokensByValue) {
		const entryList = valueMap.get(slot)?.get(token);

		if (!entryList) {
			return null;
		}

		entryLists.push(entryList);
	}

	return entryLists;
};

// The tokens every value puts in a slot, with each value's entries of them.
const intersectSharedTokensBySlot = (
	tokensByValue: TokenEntriesBySlot[]
): SharedEntries => {
	const sharedTokens: SharedEntries = new Map();
	const [firstValueMap] = tokensByValue;

	/* c8 ignore next 3 -- callers ensure tokensByValue has 1+ entries */
	if (!firstValueMap) {
		return sharedTokens;
	}

	for (const [slot, tokenMap] of firstValueMap) {
		const tokens = new Map<string, Entry[][]>();

		for (const token of tokenMap.keys()) {
			const entryLists = getEntryListsOfAll(tokensByValue, slot, token);

			if (entryLists !== null) {
				tokens.set(token, entryLists);
			}
		}

		if (tokens.size > 0) {
			sharedTokens.set(slot, tokens);
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
	slotNames: ReadonlySet<string>
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

	// Every shared token is written unescaped in the value that lends `quote`,
	// or that value's rewrite has already bailed, so the text needs no escape.
	const nextText = [...sharedTokens].join(' ');

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
	slotNames: ReadonlySet<string>
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
// suggestion. So is a lift in a config extending others, whose values of the
// variant it can't see.
const getSharedTokensRemedy = (
	plan: SharedTokensFixPlan | null,
	coverage: VariantCoverage,
	variantKey: string,
	slot: string,
	{ suggestOnly, inherits }: SharedTokensScope
): EntryRemedy => {
	if (plan === null) {
		return {};
	}

	const fix: Rule.ReportFixer = (fixer) =>
		applySharedTokensFixPlan(fixer, plan);
	const data = { variant: variantKey, slot };

	if (coverage === 'default') {
		return { suggest: [{ messageId: 'liftShared', data, fix }] };
	}

	if (inherits) {
		return { suggest: [{ messageId: 'liftSharedInherited', data, fix }] };
	}

	if (suggestOnly) {
		return { suggest: [{ messageId: 'liftSharedOrder', data, fix }] };
	}

	return { fix };
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

// Plans a fix that lifts every shared token of one (variant, slot) pair out
// of each variant value and into the slot's `base`/`slots[slot]` target in one
// atomic rewrite — or returns null when the slot has no target to lift into,
// or any piece isn't safely inferrable or editable, in which case the finding
// is still reported, just without a fix. Eligibility requires the target and
// every variant value's contribution to this slot to be a plain,
// directly-authored string or template literal.
const planSlotFix = (
	context: Rule.RuleContext,
	slot: string,
	sharedTokens: ReadonlySet<string>,
	valueEntries: ReadonlyMap<string, Node>,
	scope: SharedTokensScope
): SharedTokensFixPlan | null => {
	const target = scope.getTarget(slot);

	if (target === null) {
		return null;
	}

	const values = planValueRewrites(
		context,
		slot,
		sharedTokens,
		valueEntries,
		scope.slotNames
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

	const plan = { target: targetPlan, values };

	if (!isPlanEditable(plan, scope.canEdit)) {
		return null;
	}

	return plan;
};

// How each covered variant is covered. A variant that's both defaulted and
// required counts as required (sv() rejects that config anyway).
const collectVariantCoverage = (
	config: ReadonlyMap<string, Node>,
	variantsMap: ReadonlyMap<string, Node>,
	sourceCode: SourceCode,
	inheritsRequiresAll: boolean
): Map<string, VariantCoverage> => {
	const coverage = new Map<string, VariantCoverage>();
	const defaults = getConfigRecord(config, 'defaultVariants', sourceCode);

	for (const [key, value] of defaults) {
		if (getStaticMatcherValue(value, sourceCode) !== null) {
			coverage.set(key, 'default');
		}
	}

	const requiredVariants = resolveContainer(
		config.get('requiredVariants'),
		sourceCode
	);

	// Without one of its own, the config takes the factory's.
	let requiresAll = inheritsRequiresAll;

	if (requiredVariants) {
		requiresAll = isLiteralTrue(requiredVariants);
	}

	// `requiredVariants: true` makes every variant required.
	if (requiresAll) {
		for (const key of variantsMap.keys()) {
			coverage.set(key, 'required');
		}
	}

	forEachStringLiteralElement(requiredVariants, sourceCode, (value) => {
		coverage.set(value, 'required');
	});

	return coverage;
};

// A record naming one of `true` and `false` but not the other still accepts
// the other boolean, which applies none of its classes.
const hasUnwrittenBoolean = (valueEntries: ReadonlyMap<string, Node>) =>
	valueEntries.has('true') !== valueEntries.has('false');

const collectVariantTokensByValue = (
	variantEntries: ReadonlyMap<string, Node>,
	slotNames: ReadonlySet<string>,
	sourceCode: SourceCode
): TokenEntriesBySlot[] => {
	const tokensByValue: TokenEntriesBySlot[] = [];

	for (const valueNode of variantEntries.values()) {
		const entries: Entry[] = [];

		// Each value's tokens are compared as a whole, so their source is
		// never read.
		extractTokens(valueNode, {
			slot: 'base',
			source: EMPTY_MATCHERS,
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
	scope: SharedTokensScope
) => {
	const valueEntries = getStrictProperties(
		resolveStaticValue(rawValue, context.sourceCode)
	);

	// Boolean shorthand has a single branch — no cross-value comparison. A
	// spread or computed key means we can't see every value, so we'd
	// over-flag tokens that may differ in the unseen branches. An empty record
	// has no tokens to compare and is reported by no-empty-classes instead. A
	// single value needs no comparison — the variant is covered, so that one
	// value applies and every token in it is constant. A record naming only
	// one boolean also takes the other, which applies nothing, so none of its
	// tokens is constant.
	if (
		!valueEntries ||
		valueEntries.size === 0 ||
		hasUnwrittenBoolean(valueEntries)
	) {
		return;
	}

	const sharedTokens = intersectSharedTokensBySlot(
		collectVariantTokensByValue(
			valueEntries,
			scope.slotNames,
			context.sourceCode
		)
	);

	for (const [slot, tokens] of sharedTokens) {
		const plan = planSlotFix(
			context,
			slot,
			new Set(tokens.keys()),
			valueEntries,
			scope
		);
		const remedy = getSharedTokensRemedy(
			plan,
			coverage,
			variantKey,
			slot,
			scope
		);

		for (const [token, entryLists] of tokens) {
			for (const entryList of entryLists) {
				reportEntryList(
					context,
					entryList,
					'shared',
					{ token, variant: variantKey, slot },
					remedy
				);
			}
		}
	}
};

// The one variant-key matcher on a compound entry, plus the class it applies,
// or null when the entry has no class or doesn't have exactly one matcher: none
// at all, two or more (a `preset` brings its own), or a shape that can't be
// counted reliably (a spread or computed key might hide another matcher, so the
// whole entry is skipped rather than risk under-reporting a hidden key as if it
// weren't there). A key left `undefined` is omitted, as `sv()` reads it.
const getSingleCompoundMatcher = (
	element: ObjectExpression,
	sourceCode: SourceCode
): SingleMatcher | null => {
	const properties = getStrictProperties(element);

	if (!properties) {
		return null;
	}

	const cls = getClassValue(properties);

	if (!cls) {
		return null;
	}

	let matcher: SingleMatcher | null = null;

	for (const [key, value] of properties) {
		if (isUndefinedValue(resolveStaticValue(value, sourceCode))) {
			continue;
		}

		// A `preset` matcher adds that preset's variant values as matchers
		// too, so the entry is combining variants through it.
		if (key === 'preset') {
			return null;
		}

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
// itself (`getRemoval`). Only attempted for `compoundVariants` —
// `compoundSlots`' class belongs on a specific slot rather than the whole
// variant value, which is enough extra shape to leave unfixed for now. Any of:
// a dynamic class, an unreadable matcher value, a missing or non-literal target
// value, aborts the whole plan, leaving the finding reported without a fix.
const planSingleKeyCompoundFix = (
	context: Rule.RuleContext,
	element: ObjectExpression,
	matcher: SingleMatcher,
	variantValue: Node,
	getRemoval: GetEntryRemoval,
	canEdit: (node: Node) => boolean
): Rule.ReportFixer | undefined => {
	if (!canEdit(element)) {
		return undefined;
	}

	const removeEntry = getRemoval();

	if (removeEntry === undefined) {
		return undefined;
	}

	// Raw tokens, like the other shared-tokens fixers: the rewrite diffs and
	// re-emits source text, never cooked values.
	const clsTokens = getRawLiteralTokens(context.sourceCode, matcher.cls);

	if (clsTokens === null || clsTokens.length === 0) {
		return undefined;
	}

	const matcherValues = getStaticMatcherValues(
		matcher.value,
		context.sourceCode
	);

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
	fix: Rule.ReportFixer | undefined,
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
	kind: CompoundKind,
	variantsMap: ReadonlyMap<string, Node>,
	getRemoval: GetEntryRemoval,
	scope: CompoundScope
) => {
	const matcher = getSingleCompoundMatcher(element, context.sourceCode);

	if (!matcher) {
		return;
	}

	const variantValue = resolveContainer(
		variantsMap.get(matcher.key),
		context.sourceCode
	);

	// Boolean shorthand (which includes any non-object value) has only one
	// branch — there's no "other" value to hold the class for the matcher's
	// false case, so this isn't the same simplification.
	if (!variantValue || isBooleanShorthandVariant(variantValue)) {
		return;
	}

	let fix: Rule.ReportFixer | undefined;

	if (kind === 'compoundVariants') {
		fix = planSingleKeyCompoundFix(
			context,
			element,
			matcher,
			variantValue,
			getRemoval,
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

// How a compound entry is removed once its class has moved: the entry alone
// while others remain, else the whole config property, since the empty list
// left behind would only be reported by no-empty-classes. Undefined when the
// list isn't written in the config itself, so there's no property to remove.
const getEntryRemoval = (
	context: Rule.RuleContext,
	configNode: ObjectExpression,
	compounds: ArrayExpression,
	element: Node
): EmptyFix | undefined => {
	if (countListItems(compounds.elements) > 1) {
		return makeListFix(context, element, compounds.elements);
	}

	const property = configNode.properties.find(
		(prop): prop is Property =>
			prop.type === 'Property' && prop.value === compounds
	);

	if (property === undefined) {
		return undefined;
	}

	return makeListFix(context, property, configNode.properties);
};

const checkCompoundsForSingleKey = (
	context: Rule.RuleContext,
	configNode: ObjectExpression,
	config: ReadonlyMap<string, Node>,
	kind: CompoundKind,
	variantsMap: ReadonlyMap<string, Node>,
	scope: CompoundScope
) => {
	const compounds = resolveArray(config.get(kind), context.sourceCode);

	if (compounds === null) {
		return;
	}

	forEachStaticItem(compounds.elements, (item) => {
		const element = resolveStaticValue(item, context.sourceCode);

		if (element.type !== 'ObjectExpression') {
			return;
		}

		// The entry is removed as written in the list, with any `as`/
		// `satisfies` wrapper, while its resolved object is what's analyzed.
		checkCompoundEntryForSingleKey(
			context,
			element,
			kind,
			variantsMap,
			() => getEntryRemoval(context, configNode, compounds, item),
			scope
		);
	});
};

export const analyzeSharedTokens = (
	context: Rule.RuleContext,
	configNode: ObjectExpression,
	{
		canCreateBase,
		leadingArg,
		inheritsPostProcess,
		inheritsRequiresAll
	}: SharedTokensCall
) => {
	const { sourceCode } = context;
	const config = getConfigProperties(configNode, sourceCode);
	const slotNames = getConfigSlotNames(config, sourceCode);
	const variantsMap = getConfigRecord(config, 'variants', sourceCode);
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

		return isWithinNode(sourceCode, node, configNode);
	};

	// A parent in `extend` may pass on a merging `postProcess` too.
	const inherits = config.has('extend');
	const suggestOnly =
		inheritsPostProcess || inherits || config.has('postProcess');

	for (const kind of COMPOUND_KINDS) {
		checkCompoundsForSingleKey(
			context,
			configNode,
			config,
			kind,
			variantsMap,
			{
				canEdit,
				suggestOnly
			}
		);
	}

	if (variantsMap.size === 0) {
		return;
	}

	const baseNode = config.get('base');
	const slotProperties = getConfigRecord(config, 'slots', sourceCode);

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

	const coverageByVariant = collectVariantCoverage(
		config,
		variantsMap,
		sourceCode,
		inheritsRequiresAll
	);
	const scope = { slotNames, getTarget, canEdit, suggestOnly, inherits };

	for (const [variantKey, variantValue] of variantsMap) {
		const coverage = coverageByVariant.get(variantKey);

		if (coverage !== undefined) {
			analyzeVariantSharedTokens(
				context,
				variantKey,
				coverage,
				variantValue,
				scope
			);
		}
	}
};