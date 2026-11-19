import type { Scope, SourceCode } from 'eslint';
import type {
	CallExpression,
	Expression,
	Identifier,
	MemberExpression,
	Node,
	ObjectExpression,
	SpreadElement
} from 'estree';
import { getOrCreate } from '../map-utils.ts';
import { type CallMatch, isClassListMatch } from './call-matching.ts';
import {
	type DestructuredRead,
	findLookupVariable,
	getDestructuredRead,
	resolveContainer,
	resolveStaticValue
} from './const-bindings.ts';
import { getStaticStringText } from './literals.ts';
import { isUndefinedIdentifier } from './static-predicates.ts';
import {
	collectSlotKeyedProperties,
	getClassValue,
	getConfigSlotNames,
	getProperties,
	getStrictProperties,
	type GroupSlots
} from './properties.ts';
import {
	collectCnEntries,
	collectConfigEntries,
	forEachStringLiteralElement,
	getStaticMatcherValue,
	NON_MATCHER_KEYS,
	readMatchers
} from './token-extraction.ts';
import {
	EMPTY_SLOT_NAMES,
	type Entry,
	indexEntriesBySlotAndToken,
	type TokenEntriesBySlot,
	type VariantMatchers
} from './token-model.ts';

/** The classes one `sv()`/`cn()` call applies internally, indexed per slot. */
type InternalStyles = {
	bySlot: TokenEntriesBySlot;
	slotNames: ReadonlySet<string>;
	defaults: VariantMatchers;
	presets: ReadonlyMap<string, PresetValues>;
	// The variants a call leaves unset unless it passes them.
	optional: ReadonlySet<string>;
	groupSlots: GroupSlots;
	slotGroups: ReadonlyMap<string, ReadonlyArray<string>>;
};

// The variant values a preset sets that can be read, and whether that is all
// of them: one with a spread or a value that can't be read may set others.
type PresetValues = { matchers: VariantMatchers; complete: boolean };

// What a call's props are read against: the presets it may name, and the
// variants it leaves unset unless it passes them.
type CallOptions = Pick<InternalStyles, 'presets' | 'optional'>;

/**
 * The variant values a call fixes. `matchers` leaves out each variant whose
 * value the call sets but can't be read, as any of its values may apply;
 * `defaultMatchers` leaves those to what the call would apply without them,
 * as an element rendering a component that forwards its props to the call
 * does when it doesn't pass them.
 */
export type CallMatchers = {
	matchers: VariantMatchers;
	defaultMatchers: VariantMatchers;
};

/** A class expression produced by slot-variants, and the slot it feeds. */
export type StyledClasses = CallMatchers & {
	styles: InternalStyles;
	slot: string;
};

/** Everything the resolver needs from the rule that owns it. */
export type StyledContext = {
	sourceCode: SourceCode;
	matchCall: (node: CallExpression) => CallMatch | null;
	variableOf: (node: Identifier) => Scope.Variable | null;
	resolve: (node: Node) => Node;
};

/**
 * A call of a compiled variant function (`button(props)`), or of one of its
 * multi-slot slot functions (`classes.item(props)`).
 */
export type Invocation = CallMatchers & {
	styles: InternalStyles;
	slot: string | null;
};

const EMPTY_MATCHERS: VariantMatchers = new Map();

const NO_MATCHERS: CallMatchers = {
	matchers: EMPTY_MATCHERS,
	defaultMatchers: EMPTY_MATCHERS
};

const EMPTY_GROUPS: GroupSlots = new Map();

const NO_SKIP: ReadonlySet<string> = new Set();

const NO_PRESETS: ReadonlyMap<string, PresetValues> = new Map();

// What a call without a preset gets from one: nothing, known in full.
const NO_PRESET: PresetValues = { matchers: EMPTY_MATCHERS, complete: true };

// What an unknown preset sets: nothing that can be read, maybe anything.
const UNKNOWN_PRESET: PresetValues = {
	matchers: EMPTY_MATCHERS,
	complete: false
};

const NO_KEYS: ReadonlySet<string> = new Set();

// A slot call's result already fixed every variant value but the ones its own
// props pass, so it names no preset and leaves nothing unset.
const SLOT_CALL_OPTIONS: CallOptions = {
	presets: NO_PRESETS,
	optional: NO_KEYS
};

// A variant left unset matches the value "undefined", as it does at runtime.
const UNSET_MATCHER: ReadonlySet<string> = new Set(['undefined']);

const stylesCache = new WeakMap<Node, InternalStyles>();

// The classes of a call through a `createSV()` factory whose `base` it takes,
// kept apart from the call's own: other rules read those without it.
const factoryStylesCache = new WeakMap<Node, InternalStyles>();

const readGroups = (
	groups: ReadonlyMap<string, Node>,
	sourceCode: SourceCode
): Pick<InternalStyles, 'groupSlots' | 'slotGroups'> => {
	const groupSlots = new Map<string, string[]>();
	const slotGroups = new Map<string, string[]>();

	for (const [group, value] of groups) {
		const slots: string[] = [];

		forEachStringLiteralElement(value, sourceCode, (slot) => {
			slots.push(slot);
			getOrCreate(slotGroups, slot, () => []).push(group);
		});

		groupSlots.set(group, slots);
	}

	return { groupSlots, slotGroups };
};

// One preset's variant values, and whether every one of them was read.
const readPresetValues = (
	value: Node,
	sourceCode: SourceCode
): PresetValues => {
	const container = resolveContainer(value, sourceCode);
	const values = getStrictProperties(container);
	const matchers = readMatchers(
		getProperties(container),
		NO_SKIP,
		sourceCode
	);

	return {
		matchers,
		complete: values !== null && matchers.size === values.size
	};
};

// Each preset's variant values, by preset name.
const readPresets = (
	presets: ReadonlyMap<string, Node>,
	sourceCode: SourceCode
): Map<string, PresetValues> => {
	const result = new Map<string, PresetValues>();

	for (const [name, value] of presets) {
		result.set(name, readPresetValues(value, sourceCode));
	}

	return result;
};

// A config's `defaultVariants`, or null when they can't be read in full.
const getKnownDefaults = (
	node: Node | undefined,
	sourceCode: SourceCode
): ReadonlyMap<string, Node> | null => {
	const defaults = resolveContainer(node, sourceCode);

	if (defaults === undefined) {
		return getProperties(undefined);
	}

	return getStrictProperties(defaults);
};

// The variants with no default, which a call leaves unset unless it passes
// them. None when a parent in `extend` may give them a default, or when the
// `variants` or `defaultVariants` can't be read in full.
const readOptionalVariants = (
	config: ReadonlyMap<string, Node>,
	sourceCode: SourceCode
): ReadonlySet<string> => {
	if (config.has('extend')) {
		return NO_KEYS;
	}

	const variants = getStrictProperties(
		resolveContainer(config.get('variants'), sourceCode)
	);
	const defaults = getKnownDefaults(
		config.get('defaultVariants'),
		sourceCode
	);

	if (variants === null || defaults === null) {
		return NO_KEYS;
	}

	const optional = new Set<string>();

	for (const key of variants.keys()) {
		const value = defaults.get(key);

		if (
			value === undefined ||
			isUndefinedIdentifier(resolveStaticValue(value, sourceCode))
		) {
			optional.add(key);
		}
	}

	return optional;
};

const buildStyles = (
	config: ReadonlyMap<string, Node>,
	args: ReadonlyArray<Expression | SpreadElement>,
	sourceCode: SourceCode
): InternalStyles => {
	const slotNames = getConfigSlotNames(config, sourceCode);
	const defaults = resolveContainer(
		config.get('defaultVariants'),
		sourceCode
	);
	const groups = resolveContainer(config.get('groups'), sourceCode);
	const presets = resolveContainer(config.get('presets'), sourceCode);

	return {
		bySlot: indexEntriesBySlotAndToken(
			collectConfigEntries(config, slotNames, args, sourceCode)
		),
		slotNames,
		defaults: readMatchers(getProperties(defaults), NO_SKIP, sourceCode),
		presets: readPresets(getProperties(presets), sourceCode),
		optional: readOptionalVariants(config, sourceCode),
		...readGroups(getProperties(groups), sourceCode)
	};
};

/**
 * The classes an `sv(config)` call compiles to, memoized on the call node so a
 * config referenced from many call sites, or read by more than one rule, is
 * walked once per lint pass.
 */
export const getConfigStyles = (
	node: CallExpression,
	config: ObjectExpression,
	args: ReadonlyArray<Expression | SpreadElement>,
	sourceCode: SourceCode
): InternalStyles =>
	getOrCreate(stylesCache, node, () =>
		buildStyles(getProperties(config), args, sourceCode)
	);

export const createStyledContext = (
	sourceCode: SourceCode,
	matchCall: StyledContext['matchCall']
): StyledContext => ({
	sourceCode,
	matchCall,
	variableOf: (node) => findLookupVariable(node, sourceCode),
	resolve: (node) => resolveStaticValue(node, sourceCode)
});

// The props object a call site passes, read through `const` bindings. Empty for
// a missing or spread argument, whose props can't be read statically.
const getCallProps = (
	arg: Expression | SpreadElement | undefined,
	ctx: StyledContext
): ReadonlyMap<string, Node> => {
	if (!arg || arg.type === 'SpreadElement') {
		return getProperties(undefined);
	}

	return getProperties(ctx.resolve(arg));
};

const isNullLiteral = (node: Node): boolean =>
	node.type === 'Literal' && node.value === null;

// The variant values a call's props pass, with a `null` one left unset.
const readPropMatchers = (
	props: ReadonlyMap<string, Node>,
	ctx: StyledContext
): Map<string, ReadonlySet<string>> => {
	const matchers = readMatchers(props, NON_MATCHER_KEYS, ctx.sourceCode);

	for (const [key, value] of props) {
		if (!NON_MATCHER_KEYS.has(key) && isNullLiteral(ctx.resolve(value))) {
			matchers.set(key, UNSET_MATCHER);
		}
	}

	return matchers;
};

// The variant values of the preset a call's props name. A config without
// presets throws on any preset name, and a slot call's preset is read with no
// presets in hand: neither applies one.
const readPresetMatchers = (
	props: ReadonlyMap<string, Node>,
	presets: ReadonlyMap<string, PresetValues>,
	ctx: StyledContext
): PresetValues => {
	const preset = props.get('preset');

	if (
		preset === undefined ||
		presets.size === 0 ||
		isUndefinedIdentifier(ctx.resolve(preset))
	) {
		return NO_PRESET;
	}

	const name = getStaticMatcherValue(preset, ctx.sourceCode);

	if (name === null) {
		return UNKNOWN_PRESET;
	}

	return presets.get(name) ?? UNKNOWN_PRESET;
};

// A call's props, when every one of them can be read: none for a call
// without any, null for a spread or an object with a spread or computed key.
const getKnownCallProps = (
	arg: Expression | SpreadElement | undefined,
	ctx: StyledContext
): ReadonlyMap<string, Node> | null => {
	if (arg === undefined) {
		return getProperties(undefined);
	}

	if (arg.type === 'SpreadElement') {
		return null;
	}

	return getStrictProperties(ctx.resolve(arg));
};

// The optional variants a call leaves unset: the ones it neither passes nor
// gets from its preset. None when its props or preset can't be read in full.
const readUnsetMatchers = (
	props: ReadonlyMap<string, Node> | null,
	optional: ReadonlySet<string>,
	preset: PresetValues,
	ctx: StyledContext
): VariantMatchers => {
	if (props === null || !preset.complete) {
		return EMPTY_MATCHERS;
	}

	const unset = new Map<string, ReadonlySet<string>>();

	for (const key of optional) {
		const value = props.get(key);
		const isPassed =
			value !== undefined && !isUndefinedIdentifier(ctx.resolve(value));

		if (!isPassed && !preset.matchers.has(key)) {
			unset.set(key, UNSET_MATCHER);
		}
	}

	return unset;
};

// The values a call keeps from `base`: all of them, unless its props or
// preset can't be read in full and so may set any variant.
const readKeptMatchers = (
	props: ReadonlyMap<string, Node> | null,
	base: VariantMatchers,
	preset: PresetValues
): VariantMatchers => {
	if (props === null || !preset.complete) {
		return EMPTY_MATCHERS;
	}

	return base;
};

// A variant prop whose value can't be read: `undefined` leaves the variant to
// its default, anything else may select any of its values.
const isUnreadProp = (
	key: string,
	value: Node,
	read: VariantMatchers,
	ctx: StyledContext
): boolean =>
	!NON_MATCHER_KEYS.has(key) &&
	!read.has(key) &&
	!isUndefinedIdentifier(ctx.resolve(value));

// The matchers a call applies: `base`, refined by the props it passes. Later
// matchers win: a call site's props over its preset's values, those over the
// config's `defaultVariants` or the `optional` variants it leaves unset, and
// a slot call's own props over the ones already fixed when the result was
// produced. A variant prop that can't be read leaves `matchers` open for it.
const buildCallMatchers = (
	arg: Expression | SpreadElement | undefined,
	base: CallMatchers,
	{ presets, optional }: CallOptions,
	ctx: StyledContext
): CallMatchers => {
	const props = getCallProps(arg, ctx);
	const knownProps = getKnownCallProps(arg, ctx);
	const preset = readPresetMatchers(props, presets, ctx);
	const propMatchers = readPropMatchers(props, ctx);
	const unset = readUnsetMatchers(knownProps, optional, preset, ctx);
	const matchers = new Map([
		...readKeptMatchers(knownProps, base.matchers, preset),
		...unset,
		...preset.matchers,
		...propMatchers
	]);

	for (const [key, value] of props) {
		if (isUnreadProp(key, value, propMatchers, ctx)) {
			matchers.delete(key);
		}
	}

	return {
		matchers,
		defaultMatchers: new Map([
			...base.defaultMatchers,
			...unset,
			...preset.matchers,
			...propMatchers
		])
	};
};

/**
 * The call a callee names, itself or through its `const` binding and any
 * type-only wrapper — the `sv(config)` a variant function came from, or the
 * `createSV(...)` an `sv` alias did. Null for a callee that resolves to
 * anything but a call.
 */
export const resolveCalleeCall = (
	callee: Node,
	ctx: StyledContext
): CallExpression | null => {
	const resolved = ctx.resolve(callee);

	if (resolved.type !== 'CallExpression') {
		return null;
	}

	return resolved;
};

// The `base` a `createSV()` factory gives a call through it whose config sets
// none: one with neither `base` nor `extend`, whose parents' would take its
// place. Null for any other call, or a config that can't be read in full.
const getFactoryBase = (
	call: CallExpression,
	config: ObjectExpression,
	ctx: StyledContext
): Node | null => {
	const properties = getStrictProperties(config);

	if (
		properties === null ||
		properties.has('base') ||
		properties.has('extend')
	) {
		return null;
	}

	const factory = resolveCalleeCall(call.callee, ctx);

	if (factory === null) {
		return null;
	}

	const match = ctx.matchCall(factory);

	if (match === null || match.config === null || !match.isFactoryConfig) {
		return null;
	}

	return getProperties(match.config).get('base') ?? null;
};

// The `sv(config)` call a compiled variant function came from, reached through
// the `const` binding the call site names.
const resolveVariantFnStyles = (
	callee: Node,
	ctx: StyledContext
): InternalStyles | null => {
	const resolved = resolveCalleeCall(callee, ctx);

	if (resolved === null) {
		return null;
	}

	const match = ctx.matchCall(resolved);

	// A config-less `sv()`/`cn()` call returns a class string, not a function,
	// and a `createSV(defaults)` call returns a factory rather than a compiled
	// variant function — neither is callable as one.
	if (!match || match.isFactoryConfig || match.config === null) {
		return null;
	}

	const { config, args } = match;
	const factoryBase = getFactoryBase(resolved, config, ctx);

	if (factoryBase === null) {
		return getConfigStyles(resolved, config, args, ctx.sourceCode);
	}

	return getOrCreate(factoryStylesCache, resolved, () =>
		buildStyles(
			new Map([...getProperties(config), ['base', factoryBase]]),
			args,
			ctx.sourceCode
		)
	);
};

// The slot function a callee names, as a slot read off a result, if it is
// one.
const readSlotFn = (
	callee: Node,
	ctx: StyledContext,
	visited: Set<CallExpression>
): StyledClasses | null => {
	if (callee.type === 'MemberExpression' || callee.type === 'Identifier') {
		return resolveStyledRead(callee, ctx, visited);
	}

	return null;
};

/**
 * Classifies `node` as a call of a compiled variant function, directly
 * (`button(props)`) or through a multi-slot slot function
 * (`classes.item(props)`). `visited` holds the calls already on the path, so a
 * slot read off its own call (`const x = x.item()`) yields null instead of
 * recursing forever.
 */
export const resolveInvocation = (
	node: CallExpression,
	ctx: StyledContext,
	visited: Set<CallExpression> = new Set()
): Invocation | null => {
	if (visited.has(node)) {
		return null;
	}

	visited.add(node);

	// Read through `const` bindings and type-only wrappers (`b!`, `b as F`)
	const callee = ctx.resolve(node.callee);
	const slotFn = readSlotFn(callee, ctx, visited);

	if (slotFn !== null) {
		// The result's matchers already carry `defaultVariants`, so only the
		// props this slot call passes refine them — applying the defaults again
		// would override the values the result was produced with.
		return {
			styles: slotFn.styles,
			...buildCallMatchers(
				node.arguments[0],
				slotFn,
				SLOT_CALL_OPTIONS,
				ctx
			),
			slot: slotFn.slot
		};
	}

	// A member read that is no slot names no variant function either.
	const styles = resolveVariantFnStyles(callee, ctx);

	if (styles === null) {
		return null;
	}

	const defaults = {
		matchers: styles.defaults,
		defaultMatchers: styles.defaults
	};

	return {
		styles,
		...buildCallMatchers(node.arguments[0], defaults, styles, ctx),
		slot: null
	};
};

// The slot key a member read names: `classes.header`, or a static key like
// `classes['header']`.
const getMemberKey = (
	node: MemberExpression,
	ctx: StyledContext
): string | null => {
	if (node.computed) {
		return getStaticStringText(ctx.resolve(node.property));
	}

	if (node.property.type !== 'Identifier') {
		return null;
	}

	return node.property.name;
};

// The value and key a slot read takes: a member read, or a name destructured
// off the value.
const getSlotRead = (
	node: MemberExpression | Identifier,
	ctx: StyledContext
): DestructuredRead | null => {
	if (node.type === 'Identifier') {
		return getDestructuredRead(node, ctx.sourceCode);
	}

	const key = getMemberKey(node, ctx);

	if (key === null) {
		return null;
	}

	return { object: node.object, key };
};

// `classes.header`, `classes['header']`, or a `header` destructured off
// `classes` — a slot read off a variant function's result.
const resolveStyledRead = (
	node: MemberExpression | Identifier,
	ctx: StyledContext,
	visited: Set<CallExpression> = new Set()
): StyledClasses | null => {
	const read = getSlotRead(node, ctx);

	if (read === null) {
		return null;
	}

	const object = ctx.resolve(read.object);

	if (object.type !== 'CallExpression') {
		return null;
	}

	const invocation = resolveInvocation(object, ctx, visited);

	if (invocation === null || invocation.slot !== null) {
		return null;
	}

	const slot = read.key;

	if (slot !== 'base' && !invocation.styles.slotNames.has(slot)) {
		return null;
	}

	return {
		styles: invocation.styles,
		slot,
		matchers: invocation.matchers,
		defaultMatchers: invocation.defaultMatchers
	};
};

// Classes with no config behind them: the literals of a `cn()`-style list.
const buildLiteralStyles = (entries: ReadonlyArray<Entry>): InternalStyles => ({
	bySlot: indexEntriesBySlotAndToken(entries),
	slotNames: EMPTY_SLOT_NAMES,
	defaults: EMPTY_MATCHERS,
	presets: NO_PRESETS,
	optional: NO_KEYS,
	groupSlots: EMPTY_GROUPS,
	slotGroups: EMPTY_GROUPS
});

/**
 * The literal classes a `cn()`-style list applies on its own, as a styled part
 * — what a forwarded `class` prop is merged with when the list holds no
 * slot-variants part beside it.
 */
export const literalStyles = (
	literals: ReadonlyArray<Entry>
): StyledClasses => ({
	styles: buildLiteralStyles(literals),
	slot: 'base',
	...NO_MATCHERS
});

/**
 * Reads an already resolved node as a class-valued slot-variants expression: a
 * `cn()` call, a config-less `sv()` call, a slotless variant function's result,
 * a slot read off a result object, or a multi-slot slot call. Null for anything
 * else, including a variant function itself (which yields no classes until
 * called).
 */
export const readStyledClasses = (
	resolved: Node,
	ctx: StyledContext
): StyledClasses | null => {
	if (
		resolved.type === 'MemberExpression' ||
		resolved.type === 'Identifier'
	) {
		return resolveStyledRead(resolved, ctx);
	}

	if (resolved.type !== 'CallExpression') {
		return null;
	}

	const direct = ctx.matchCall(resolved);

	// A configured `sv()` call falls through: its callee is no variant
	// function, so `resolveInvocation` yields null for it.
	if (direct !== null && isClassListMatch(direct)) {
		return {
			styles: getOrCreate(stylesCache, resolved, () =>
				buildLiteralStyles(
					collectCnEntries(direct.args, ctx.sourceCode)
				)
			),
			slot: 'base',
			...NO_MATCHERS
		};
	}

	const invocation = resolveInvocation(resolved, ctx);

	if (invocation === null) {
		return null;
	}

	// Called without a slot, a slotted variant function returns a per-slot
	// object, which carries no classes of its own until a slot is read off it.
	if (invocation.slot === null && invocation.styles.slotNames.size > 0) {
		return null;
	}

	return {
		styles: invocation.styles,
		slot: invocation.slot ?? 'base',
		matchers: invocation.matchers,
		defaultMatchers: invocation.defaultMatchers
	};
};

/** `readStyledClasses` for a node read through `const` bindings first. */
export const resolveStyledClasses = (
	node: Node,
	ctx: StyledContext
): StyledClasses | null => readStyledClasses(ctx.resolve(node), ctx);

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
	const properties = getCallProps(arg, ctx);

	return getClassValue(properties) ?? null;
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