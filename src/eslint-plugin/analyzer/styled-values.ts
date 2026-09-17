import type { SourceCode } from 'eslint';
import type {
	CallExpression,
	Expression,
	Node,
	ObjectExpression,
	SpreadElement
} from 'estree';
import { getOrCreate } from '../map-utils.ts';
import type { CallMatch } from './call-matching.ts';
import { getKeyName } from './config-keys.ts';
import {
	collectSlotKeyedProperties,
	getConfigSlotNames,
	getProperties
} from './properties.ts';
import {
	collectConfigEntries,
	extractTokens,
	forEachStringLiteralElement,
	getStaticMatcherValues
} from './token-extraction.ts';
import {
	baseSource,
	EMPTY_SLOT_NAMES,
	type Entry,
	indexEntriesBySlotAndToken,
	type TokenEntriesBySlot,
	type VariantMatchers
} from './token-model.ts';

/** The classes one `sv()`/`cn()` call applies internally, indexed per slot. */
export type InternalStyles = {
	bySlot: TokenEntriesBySlot;
	// The declared slot names plus the group names that stand for them, exactly
	// as `collectConfigEntries` bucketed the entries above. Empty for a
	// slotless config and for `cn()`.
	slotNames: Set<string>;
	// `defaultVariants`, as matchers — the variant values that apply when a
	// call site doesn't pass them.
	defaults: VariantMatchers;
	// `groups`, both ways round. Entries bucket under whichever name the config
	// wrote, so a slot's classes are spread across its own bucket and every
	// group bucket naming it.
	groupSlots: ReadonlyMap<string, ReadonlyArray<string>>;
	slotGroups: ReadonlyMap<string, ReadonlyArray<string>>;
};

/** A class-valued expression produced by slot-variants, and the slot it feeds. */
export type StyledClasses = {
	styles: InternalStyles;
	slot: string;
	// The variant values known to hold where the classes were produced, used to
	// drop internal entries that can't render alongside them.
	matchers: VariantMatchers;
};

/**
 * A call of a compiled variant function (`button(props)`), or of one of its
 * multi-slot slot functions (`classes.item(props)`).
 */
export type Invocation = {
	styles: InternalStyles;
	matchers: VariantMatchers;
	// The slot a multi-slot call is pinned to, or null when the call yields the
	// whole result and the target slot follows the `class` value's shape.
	slot: string | null;
};

export const EMPTY_MATCHERS: VariantMatchers = new Map();

const EMPTY_GROUPS: ReadonlyMap<string, ReadonlyArray<string>> = new Map();

// Call-site keys that name something other than a variant. `preset` selects
// variant values indirectly; expanding it would need the `presets` config in
// hand, so it's left out — an unknown matcher only ever widens what's reported.
const NON_VARIANT_PROPS = new Set(['class', 'className', 'preset']);

const readMatchers = (
	properties: ReadonlyMap<string, Node>,
	skip: ReadonlySet<string>
): Map<string, ReadonlySet<string>> => {
	const matchers = new Map<string, ReadonlySet<string>>();

	for (const [key, value] of properties) {
		if (skip.has(key)) {
			continue;
		}

		const values = getStaticMatcherValues(value);

		if (values !== null) {
			matchers.set(key, values);
		}
	}

	return matchers;
};

const NO_SKIP: ReadonlySet<string> = new Set();

const readGroups = (
	groups: ReadonlyMap<string, Node>
): Pick<InternalStyles, 'groupSlots' | 'slotGroups'> => {
	const groupSlots = new Map<string, string[]>();
	const slotGroups = new Map<string, string[]>();

	for (const [group, value] of groups) {
		const slots: string[] = [];

		forEachStringLiteralElement(value, (slot) => {
			slots.push(slot);
			getOrCreate(slotGroups, slot, () => []).push(group);
		});

		groupSlots.set(group, slots);
	}

	return { groupSlots, slotGroups };
};

const buildStyles = (
	configNode: ObjectExpression,
	args: ReadonlyArray<Expression | SpreadElement>,
	sourceCode: SourceCode
): InternalStyles => {
	const config = getProperties(configNode);
	const slotNames = getConfigSlotNames(config);

	return {
		bySlot: indexEntriesBySlotAndToken(
			collectConfigEntries(config, slotNames, args, sourceCode)
		),
		slotNames,
		defaults: readMatchers(
			getProperties(config.get('defaultVariants')),
			NO_SKIP
		),
		...readGroups(getProperties(config.get('groups')))
	};
};

const stylesCache = new WeakMap<Node, InternalStyles>();

// Memoized on the call node so a config referenced from many call sites is
// walked once per lint pass.
const getStyles = (
	node: CallExpression,
	configNode: ObjectExpression,
	args: ReadonlyArray<Expression | SpreadElement>,
	sourceCode: SourceCode
): InternalStyles => {
	const cached = stylesCache.get(node);

	if (cached) {
		return cached;
	}

	const styles = buildStyles(configNode, args, sourceCode);

	stylesCache.set(node, styles);

	return styles;
};

/** Everything the resolver needs from the rule that owns it. */
export type StyledContext = {
	sourceCode: SourceCode;
	matchCall: (node: CallExpression) => CallMatch | null;
	// How an expression is read through `const` bindings. Plain JS resolves
	// from the node's own scope; a Vue template resolves from the script's.
	resolve: (node: Node) => Node;
};

// `defaultVariants` values a call site doesn't override, merged under the
// values it passes.
const withDefaults = (
	props: Map<string, ReadonlySet<string>>,
	defaults: VariantMatchers
): VariantMatchers => {
	for (const [key, values] of defaults) {
		if (!props.has(key)) {
			props.set(key, values);
		}
	}

	return props;
};

const buildCallMatchers = (
	arg: Expression | SpreadElement | undefined,
	styles: InternalStyles,
	ctx: StyledContext
): VariantMatchers => {
	if (!arg || arg.type === 'SpreadElement') {
		return withDefaults(new Map(), styles.defaults);
	}

	return withDefaults(
		readMatchers(getProperties(ctx.resolve(arg)), NON_VARIANT_PROPS),
		styles.defaults
	);
};

// The `sv(config)` call a compiled variant function came from, reached through
// the `const` binding the call site names.
const resolveVariantFnStyles = (
	callee: Node,
	ctx: StyledContext
): InternalStyles | null => {
	if (callee.type !== 'Identifier') {
		return null;
	}

	const resolved = ctx.resolve(callee);

	if (resolved.type !== 'CallExpression') {
		return null;
	}

	const match = ctx.matchCall(resolved);

	// A config-less `sv()`/`cn()` call returns a class string, not a function,
	// and a `createSV(defaults)` call returns a factory rather than a compiled
	// variant function — neither is callable as one.
	if (!match || match.isFactoryConfig === true || match.config === null) {
		return null;
	}

	return getStyles(resolved, match.config, match.args, ctx.sourceCode);
};

/**
 * Classifies `node` as a call of a compiled variant function, directly
 * (`button(props)`) or through a multi-slot slot function
 * (`classes.item(props)`).
 */
export const resolveInvocation = (
	node: CallExpression,
	ctx: StyledContext
): Invocation | null => {
	const { callee } = node;

	if (callee.type === 'MemberExpression') {
		const slotFn = resolveStyledMember(callee, ctx);

		if (slotFn === null) {
			return null;
		}

		return {
			styles: slotFn.styles,
			matchers: mergeMatchers(
				slotFn.matchers,
				buildCallMatchers(node.arguments[0], slotFn.styles, ctx)
			),
			slot: slotFn.slot
		};
	}

	const styles = resolveVariantFnStyles(callee, ctx);

	if (styles === null) {
		return null;
	}

	return {
		styles,
		matchers: buildCallMatchers(node.arguments[0], styles, ctx),
		slot: null
	};
};

// Later matchers win, mirroring how a slot call's own props refine the ones
// already fixed when the result was produced.
const mergeMatchers = (
	outer: VariantMatchers,
	inner: VariantMatchers
): VariantMatchers => {
	const merged = new Map(outer);

	for (const [key, values] of inner) {
		merged.set(key, values);
	}

	return merged;
};

// `classes.header` — a slot read off a variant function's result.
const resolveStyledMember = (
	node: Node,
	ctx: StyledContext
): StyledClasses | null => {
	if (node.type !== 'MemberExpression' || node.computed) {
		return null;
	}

	if (node.property.type !== 'Identifier') {
		return null;
	}

	const object = ctx.resolve(node.object);

	if (object.type !== 'CallExpression') {
		return null;
	}

	const invocation = resolveInvocation(object, ctx);

	if (invocation === null || invocation.slot !== null) {
		return null;
	}

	const slot = node.property.name;

	if (slot !== 'base' && !invocation.styles.slotNames.has(slot)) {
		return null;
	}

	return { styles: invocation.styles, slot, matchers: invocation.matchers };
};

const cnStyles = (
	call: CallMatch,
	sourceCode: SourceCode,
	node: CallExpression
): InternalStyles => {
	const cached = stylesCache.get(node);

	if (cached) {
		return cached;
	}

	const entries: Entry[] = [];

	for (const arg of call.args) {
		extractTokens(
			arg,
			'base',
			baseSource,
			EMPTY_SLOT_NAMES,
			entries,
			sourceCode,
			true
		);
	}

	const styles: InternalStyles = {
		bySlot: indexEntriesBySlotAndToken(entries),
		slotNames: EMPTY_SLOT_NAMES,
		defaults: EMPTY_MATCHERS,
		groupSlots: EMPTY_GROUPS,
		slotGroups: EMPTY_GROUPS
	};

	stylesCache.set(node, styles);

	return styles;
};

/**
 * Reads `node` as a class-valued slot-variants expression: a `cn()` call, a
 * config-less `sv()` call, a slotless variant function's result, a slot read
 * off a result object, or a multi-slot slot call. Null for anything else,
 * including a variant function itself (which yields no classes until called).
 */
export const resolveStyledClasses = (
	node: Node,
	ctx: StyledContext
): StyledClasses | null => {
	const resolved = ctx.resolve(node);

	if (resolved.type === 'MemberExpression') {
		return resolveStyledMember(resolved, ctx);
	}

	if (resolved.type !== 'CallExpression') {
		return null;
	}

	const direct = ctx.matchCall(resolved);

	if (direct && direct.isFactoryConfig !== true) {
		if (direct.config !== null) {
			return null;
		}

		return {
			styles: cnStyles(direct, ctx.sourceCode, resolved),
			slot: 'base',
			matchers: EMPTY_MATCHERS
		};
	}

	const invocation = resolveInvocation(resolved, ctx);

	if (invocation === null) {
		return null;
	}

	if (invocation.slot !== null) {
		return {
			styles: invocation.styles,
			slot: invocation.slot,
			matchers: invocation.matchers
		};
	}

	// A slotted variant function returns a per-slot object, which carries no
	// classes of its own until a slot is read off it.
	if (invocation.styles.slotNames.size > 0) {
		return null;
	}

	return {
		styles: invocation.styles,
		slot: 'base',
		matchers: invocation.matchers
	};
};

/**
 * The `class` / `className` value a call site passes, split per targeted slot.
 * A slot-keyed object targets the named slots (or groups); anything else uses
 * the `cn()` convention and targets `base`.
 */
export const forEachOverrideTarget = (
	value: Node,
	styles: InternalStyles,
	pinnedSlot: string | null,
	visit: (slot: string, node: Node) => void
) => {
	if (pinnedSlot !== null) {
		visit(pinnedSlot, value);

		return;
	}

	const slotKeyed = collectSlotKeyedProperties(value, styles.slotNames);

	if (slotKeyed === null) {
		visit('base', value);

		return;
	}

	for (const [slot, node] of slotKeyed) {
		visit(slot, node);
	}
};

/** The runtime `class` / `className` property of a call site's props object. */
export const getOverrideValue = (
	arg: Expression | SpreadElement | undefined,
	ctx: StyledContext
): Node | null => {
	if (!arg || arg.type === 'SpreadElement') {
		return null;
	}

	const properties = getProperties(ctx.resolve(arg));

	// `class` wins over `className` when both are passed, exactly as `sv()`
	// resolves them at runtime.
	return properties.get('class') ?? properties.get('className') ?? null;
};

/**
 * The local binding names a component function's first parameter destructures
 * `class` / `className` into, mapped to the prop name a call site would pass.
 */
export const getClassPropBindings = (
	param: Node | undefined
): Map<string, string> => {
	const bindings = new Map<string, string>();

	if (!param || param.type !== 'ObjectPattern') {
		return bindings;
	}

	for (const property of param.properties) {
		if (property.type !== 'Property' || property.computed) {
			continue;
		}

		const key = getKeyName(property);

		if (key !== 'class' && key !== 'className') {
			continue;
		}

		if (property.value.type === 'Identifier') {
			bindings.set(property.value.name, key);
		}
	}

	return bindings;
};

/**
 * The real slots an override key names: a group expands to its member slots,
 * any other key stands for itself.
 */
export const resolveTargetSlots = (
	styles: InternalStyles,
	slot: string
): ReadonlyArray<string> => styles.groupSlots.get(slot) ?? [slot];

/**
 * Every bucket a slot's internal classes can sit in: its own, plus each group
 * that names it.
 */
export const getSlotBuckets = (
	styles: InternalStyles,
	slot: string
): ReadonlyArray<string> => {
	const groups = styles.slotGroups.get(slot);

	if (groups === undefined) {
		return [slot];
	}

	return [slot, ...groups];
};