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
import { getKeyName } from './config-keys.ts';
import {
	type DestructuredRead,
	findLookupVariable,
	getDestructuredRead,
	resolveContainer,
	resolveStaticValue
} from './const-bindings.ts';
import { getStaticStringText } from './literals.ts';
import {
	isDefinedValue,
	isUndefinedValue,
	type ResolveNode
} from './static-predicates.ts';
import {
	collectSlotKeyedProperties,
	getClassValue,
	getConfigSlotNames,
	getConfigProperties,
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
export type InternalStyles = {
	bySlot: TokenEntriesBySlot;
	slotNames: ReadonlySet<string>;
	defaults: VariantMatchers;
	presets: ReadonlyMap<string, PresetValues>;
	// Whether a parent in `extend` that can't be read may add presets.
	openPresets: boolean;
	// The variants a call leaves unset unless it passes them.
	optional: ReadonlySet<string>;
	// The variants given a default, null when that can't be read in full.
	defaulted: ReadonlySet<string> | null;
	groupSlots: GroupSlots;
	slotGroups: ReadonlyMap<string, ReadonlyArray<string>>;
};

// The parents an `extend` value names that can be read, each once, and
// whether that is all of them.
type ParentStyles = {
	parents: ReadonlyArray<InternalStyles>;
	complete: boolean;
};

/**
 * The classes a config's call applies, with the entries of those it inherits
 * rather than writes: its parents' in `extend`, or its factory's `base`.
 */
export type CallStyles = {
	styles: InternalStyles;
	inherited: ReadonlySet<Entry>;
};

/**
 * The variant values a preset sets that can be read, and whether that is all
 * of them: one with a spread or a value that can't be read may set others.
 */
export type PresetValues = { matchers: VariantMatchers; complete: boolean };

// What a call's props are read against: the presets it may name, and the
// variants it leaves unset unless it passes them.
type CallOptions = Pick<InternalStyles, 'presets' | 'openPresets' | 'optional'>;

/**
 * What a call's props hold besides the values it fixes: the props it passes
 * (`class`/`className` aside), its `preset` when that can't be read, and the
 * objects it spreads into its props, null when a computed key may pass any.
 */
export type CallInputs = {
	passed: ReadonlySet<string>;
	preset: Node | undefined;
	spreads: ReadonlyArray<Node> | null;
};

/**
 * The variant values a call fixes. `matchers` leaves out each variant whose
 * value the call sets but can't be read, as any of its values may apply.
 * `defaultMatchers` holds what the call applies without those props, its
 * unread `preset` and what it spreads — as an element rendering a component
 * that forwards its props to the call does when it passes none of them.
 * `unreadProps` holds the values of those props.
 */
export type CallMatchers = {
	matchers: VariantMatchers;
	defaultMatchers: VariantMatchers;
	unreadProps: ReadonlyMap<string, Node>;
	inputs: CallInputs;
};

// A call's props: the ones that can be read, those of the object literals it
// spreads included, all of them when every one can (null when a spread or
// computed key may pass others), the objects it spreads that can't be read
// (null when a computed key may pass any prop), and the props written ahead
// of one of those, which it may replace.
type CallProps = {
	read: ReadonlyMap<string, Node>;
	known: ReadonlyMap<string, Node> | null;
	spreads: ReadonlyArray<Node> | null;
	overridable: ReadonlySet<string>;
};

// A call's props while its object is walked.
type CollectedProps = {
	read: Map<string, Node>;
	spreads: Node[];
	overridable: Set<string>;
	hasComputedKey: boolean;
};

/**
 * The `class` / `className` a call's props pass: the value written for it,
 * if any, and the objects the call spreads that may pass one instead — those
 * that can't be read, when it writes none or writes it ahead of them.
 */
export type Override = { value: Node | null; spreads: ReadonlyArray<Node> };

/** A class expression produced by slot-variants, and the slot it feeds. */
export type StyledClasses = CallMatchers & {
	styles: InternalStyles;
	slot: string;
};

// A slot read off a variant function's result, with the props the result was
// produced with, which a call of the slot is merged with.
type SlotRead = StyledClasses & { props: CallProps };

/** Everything the resolver needs from the rule that owns it. */
export type StyledContext = {
	sourceCode: SourceCode;
	matchCall: (node: CallExpression) => CallMatch | null;
	variableOf: (node: Identifier) => Scope.Variable | null;
	resolve: ResolveNode;
};

/**
 * A call of a compiled variant function (`button(props)`), or of one of its
 * multi-slot slot functions (`classes.item(props)`).
 */
export type Invocation = CallMatchers & {
	styles: InternalStyles;
	slot: string | null;
	props: CallProps;
};

const EMPTY_MATCHERS: VariantMatchers = new Map();

const EMPTY_PROPS: ReadonlyMap<string, Node> = new Map();

const NO_KEYS: ReadonlySet<string> = new Set();

const NO_SPREADS: ReadonlyArray<Node> = [];

const NO_CALL_PROPS: CallProps = {
	read: EMPTY_PROPS,
	known: EMPTY_PROPS,
	spreads: NO_SPREADS,
	overridable: NO_KEYS
};

const NO_INPUTS: CallInputs = {
	passed: NO_KEYS,
	preset: undefined,
	spreads: NO_SPREADS
};

const NO_MATCHERS: CallMatchers = {
	matchers: EMPTY_MATCHERS,
	defaultMatchers: EMPTY_MATCHERS,
	unreadProps: EMPTY_PROPS,
	inputs: NO_INPUTS
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

// A variant left unset matches the value "undefined", as it does at runtime.
const UNSET_MATCHER: ReadonlySet<string> = new Set(['undefined']);

const stylesCache = new WeakMap<Node, InternalStyles>();

// The classes of a call through a `createSV()` factory whose `base` it takes,
// kept apart from the call's own: other rules read those without it.
const factoryStylesCache = new WeakMap<Node, InternalStyles>();

// The classes of a call extending other components, its parents' included,
// kept apart from the call's own for the same reason.
const extendedStylesCache = new WeakMap<Node, CallStyles>();

const NO_ENTRIES: ReadonlySet<Entry> = new Set();

const NO_ARGS: ReadonlyArray<Expression | SpreadElement> = [];

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

// The variants a config gives a default, one left `undefined` aside. Null
// when its `defaultVariants` can't be read in full.
const readDefaultedVariants = (
	config: ReadonlyMap<string, Node>,
	sourceCode: SourceCode
): ReadonlySet<string> | null => {
	const defaults = getKnownDefaults(
		config.get('defaultVariants'),
		sourceCode
	);

	if (defaults === null) {
		return null;
	}

	const defaulted = new Set<string>();
	const resolve: ResolveNode = (node) => resolveStaticValue(node, sourceCode);

	for (const [key, value] of defaults) {
		if (isDefinedValue(value, resolve)) {
			defaulted.add(key);
		}
	}

	return defaulted;
};

// The variants a config declares with no default of its own, which a call
// leaves unset unless it passes them — a parent in `extend` may still give
// them one. None when the `variants` or `defaultVariants` can't be read in
// full.
const readOptionalVariants = (
	config: ReadonlyMap<string, Node>,
	defaulted: ReadonlySet<string> | null,
	sourceCode: SourceCode
): ReadonlySet<string> => {
	const variants = getStrictProperties(
		resolveContainer(config.get('variants'), sourceCode)
	);

	if (variants === null || defaulted === null) {
		return NO_KEYS;
	}

	const optional = new Set<string>();

	for (const key of variants.keys()) {
		if (!defaulted.has(key)) {
			optional.add(key);
		}
	}

	return optional;
};

// `inheritedSlots` holds the slot and group names of the parents in `extend`,
// which a slot object of the config may name too.
const buildStyles = (
	config: ReadonlyMap<string, Node>,
	args: ReadonlyArray<Expression | SpreadElement>,
	sourceCode: SourceCode,
	inheritedSlots: ReadonlySet<string> = EMPTY_SLOT_NAMES
): InternalStyles => {
	const slotNames = new Set([
		...inheritedSlots,
		...getConfigSlotNames(config, sourceCode)
	]);
	const defaults = resolveContainer(
		config.get('defaultVariants'),
		sourceCode
	);
	const groups = resolveContainer(config.get('groups'), sourceCode);
	const presets = resolveContainer(config.get('presets'), sourceCode);
	const defaulted = readDefaultedVariants(config, sourceCode);

	return {
		bySlot: indexEntriesBySlotAndToken(
			collectConfigEntries(config, slotNames, args, sourceCode)
		),
		slotNames,
		defaults: readMatchers(getProperties(defaults), NO_SKIP, sourceCode),
		presets: readPresets(getProperties(presets), sourceCode),
		openPresets: false,
		optional: readOptionalVariants(config, defaulted, sourceCode),
		defaulted,
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
		buildStyles(getConfigProperties(config, sourceCode), args, sourceCode)
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
// presets throws on any preset name, so it applies none — unless a parent
// that can't be read may give it some.
const readPresetMatchers = (
	props: ReadonlyMap<string, Node>,
	{ presets, openPresets }: CallOptions,
	ctx: StyledContext
): PresetValues => {
	const preset = props.get('preset');

	if (
		preset === undefined ||
		(presets.size === 0 && !openPresets) ||
		isUndefinedValue(ctx.resolve(preset))
	) {
		return NO_PRESET;
	}

	const name = getStaticMatcherValue(preset, ctx.sourceCode);

	if (name === null) {
		return UNKNOWN_PRESET;
	}

	return presets.get(name) ?? UNKNOWN_PRESET;
};

// Marks every prop read so far as one that what follows may replace.
const markOverridable = (props: CollectedProps) => {
	for (const key of props.read.keys()) {
		props.overridable.add(key);
	}
};

// Reads an object's props in source order, a later one winning as at runtime:
// a spread of an object literal, read through `const` bindings, is entered,
// and any other spread or a computed key may replace the props ahead of it.
const collectProps = (
	object: ObjectExpression,
	ctx: StyledContext,
	props: CollectedProps
) => {
	for (const property of object.properties) {
		if (property.type === 'SpreadElement') {
			const spread = ctx.resolve(property.argument);

			if (spread.type === 'ObjectExpression') {
				collectProps(spread, ctx, props);
			} else {
				props.spreads.push(property.argument);
				markOverridable(props);
			}

			continue;
		}

		const key = getKeyName(property);

		if (key === null) {
			props.hasComputedKey = true;
			markOverridable(props);
		} else {
			props.read.set(key, property.value);
			props.overridable.delete(key);
		}
	}
};

// The props of an object literal a call is handed.
const readObjectProps = (
	object: ObjectExpression,
	ctx: StyledContext
): CallProps => {
	const props: CollectedProps = {
		read: new Map(),
		spreads: [],
		overridable: new Set(),
		hasComputedKey: false
	};

	collectProps(object, ctx, props);

	const { read, spreads, overridable } = props;

	if (props.hasComputedKey) {
		return { read, known: null, spreads: null, overridable };
	}

	if (spreads.length > 0) {
		return { read, known: null, spreads, overridable };
	}

	return { read, known: read, spreads, overridable };
};

// A call's props. A call without any passes none; a spread argument or a
// value that is no object literal (`button(props)`) may pass any.
const readCallProps = (
	arg: Expression | SpreadElement | undefined,
	ctx: StyledContext
): CallProps => {
	if (arg === undefined) {
		return NO_CALL_PROPS;
	}

	if (arg.type === 'SpreadElement') {
		return {
			read: EMPTY_PROPS,
			known: null,
			spreads: [arg.argument],
			overridable: NO_KEYS
		};
	}

	const resolved = ctx.resolve(arg);

	if (resolved.type !== 'ObjectExpression') {
		return {
			read: EMPTY_PROPS,
			known: null,
			spreads: [resolved],
			overridable: NO_KEYS
		};
	}

	return readObjectProps(resolved, ctx);
};

// `outer` with each prop of `inner` that the runtime lets replace it: any but
// an `undefined` one or a class, which is merged instead.
const mergeProps = (
	outer: ReadonlyMap<string, Node>,
	inner: ReadonlyMap<string, Node>,
	ctx: StyledContext
): ReadonlyMap<string, Node> => {
	const merged = new Map(outer);

	for (const [key, value] of inner) {
		if (
			key !== 'class' &&
			key !== 'className' &&
			isDefinedValue(value, ctx.resolve)
		) {
			merged.set(key, value);
		}
	}

	return merged;
};

// The props a slot call runs its variant function with: the outer call's,
// with its own merged in. Props of its own that can't all be read may replace
// any of the outer call's, so only its own are read then.
const mergeCallProps = (
	outer: CallProps,
	inner: CallProps,
	ctx: StyledContext
): CallProps => {
	if (inner.known === null) {
		return inner;
	}

	// Props of its own that can all be read spread nothing, so the outer
	// call's spreads are all there is.
	const read = mergeProps(outer.read, inner.read, ctx);
	// A prop of its own replaces the outer call's, whatever that spreads
	const overridable = new Set(outer.overridable);

	for (const [key, value] of inner.read) {
		if (isDefinedValue(value, ctx.resolve)) {
			overridable.delete(key);
		}
	}

	if (outer.known === null) {
		return { read, known: null, spreads: outer.spreads, overridable };
	}

	return {
		read,
		known: mergeProps(outer.known, inner.known, ctx),
		spreads: outer.spreads,
		overridable
	};
};

// The optional variants a call leaves unset: the ones it neither passes nor
// gets from its preset, counting a prop whose value can't be read as not
// passed. None when its props or preset can't be read in full.
const readUnsetMatchers = (
	props: ReadonlyMap<string, Node> | null,
	unread: ReadonlyMap<string, Node>,
	optional: ReadonlySet<string>,
	preset: PresetValues,
	ctx: StyledContext
): VariantMatchers => {
	if (props === null || !preset.complete) {
		return EMPTY_MATCHERS;
	}

	const unset = new Map<string, ReadonlySet<string>>();

	for (const key of optional) {
		if (
			(unread.has(key) || !isDefinedValue(props.get(key), ctx.resolve)) &&
			!preset.matchers.has(key)
		) {
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
	!isUndefinedValue(ctx.resolve(value));

// The variant props a call passes whose values can't be read.
const readUnreadProps = (
	read: ReadonlyMap<string, Node>,
	propMatchers: VariantMatchers,
	ctx: StyledContext
): ReadonlyMap<string, Node> => {
	const unread = new Map<string, Node>();

	for (const [key, value] of read) {
		if (isUnreadProp(key, value, propMatchers, ctx)) {
			unread.set(key, value);
		}
	}

	return unread;
};

/** The call matchers an invocation carries, to pass on to a styled part. */
export const pickCallMatchers = ({
	matchers,
	defaultMatchers,
	unreadProps,
	inputs
}: CallMatchers): CallMatchers => ({
	matchers,
	defaultMatchers,
	unreadProps,
	inputs
});

// The props a call passes whatever it spreads: any but an `undefined` one, a
// class, or one written ahead of a spread that may replace it.
const readPassedKeys = (
	{ read, overridable }: CallProps,
	ctx: StyledContext
): ReadonlySet<string> => {
	const passed = new Set<string>();

	for (const [key, value] of read) {
		if (
			key !== 'class' &&
			key !== 'className' &&
			!overridable.has(key) &&
			isDefinedValue(value, ctx.resolve)
		) {
			passed.add(key);
		}
	}

	return passed;
};

// The matchers a call applies: `base`, refined by the props it passes. Later
// matchers win: a call site's props over its preset's values, and those over
// the config's `defaultVariants` or the `optional` variants it leaves unset. A
// variant prop that can't be read leaves `matchers` open for it.
const buildCallMatchers = (
	props: CallProps,
	base: VariantMatchers,
	options: CallOptions,
	ctx: StyledContext
): CallMatchers => {
	const { read, known, spreads, overridable } = props;
	const { optional } = options;
	const preset = readPresetMatchers(read, options, ctx);
	const propMatchers = readPropMatchers(read, ctx);
	const unreadProps = readUnreadProps(read, propMatchers, ctx);
	const unset = readUnsetMatchers(known, unreadProps, optional, preset, ctx);
	const matchers = new Map([
		...readKeptMatchers(known, base, preset),
		...unset,
		...preset.matchers,
		...propMatchers
	]);

	for (const key of unreadProps.keys()) {
		matchers.delete(key);
	}

	// A prop a spread may replace takes its value or the spread's
	for (const key of overridable) {
		matchers.delete(key);
	}

	// Without the preset it can't read or what it spreads, a call's props
	// are all read.
	let unreadPreset: Node | undefined;
	let readPreset = preset;

	if (preset === UNKNOWN_PRESET) {
		unreadPreset = read.get('preset');
		readPreset = NO_PRESET;
	}

	return {
		matchers,
		// A preset it names that isn't known in full may set any variant.
		defaultMatchers: new Map([
			...readKeptMatchers(read, base, readPreset),
			...readUnsetMatchers(read, unreadProps, optional, readPreset, ctx),
			...readPreset.matchers,
			...propMatchers
		]),
		unreadProps,
		inputs: {
			passed: readPassedKeys(props, ctx),
			preset: unreadPreset,
			spreads
		}
	};
};

/**
 * The variant values a prop value selects: its static value, unset for
 * `null`, or null when it can't be read.
 */
export const readVariantValue = (
	node: Node,
	ctx: StyledContext
): ReadonlySet<string> | null => {
	if (isNullLiteral(ctx.resolve(node))) {
		return UNSET_MATCHER;
	}

	const value = getStaticMatcherValue(node, ctx.sourceCode);

	if (value === null) {
		return null;
	}

	return new Set([value]);
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

/**
 * The keys a `createSV(defaults)` call's defaults set: none when it's called
 * without any, and null when they can't be read in full.
 */
export const getDefaultKeys = (
	factory: CallExpression,
	ctx: StyledContext
): ReadonlySet<string> | null => {
	const [defaults] = factory.arguments;

	if (defaults === undefined) {
		return NO_KEYS;
	}

	const properties = getStrictProperties(ctx.resolve(defaults));

	if (properties === null) {
		return null;
	}

	return new Set(properties.keys());
};

/**
 * Whether a `createSV(defaults)` call's defaults make every variant required:
 * false unless they can be read in full and set `requiredVariants: true`.
 */
export const getDefaultRequiresAll = (
	factory: CallExpression,
	ctx: StyledContext
): boolean => {
	const [defaults] = factory.arguments;

	if (defaults === undefined) {
		return false;
	}

	const properties = getStrictProperties(ctx.resolve(defaults));
	const value = properties?.get('requiredVariants');

	if (value === undefined) {
		return false;
	}

	const resolved = ctx.resolve(value);

	return resolved.type === 'Literal' && resolved.value === true;
};

/**
 * The keys a call inherits from the defaults of the `createSV()` factory its
 * callee came from, in this file or imported: none for `sv()` itself or a
 * factory called without any, and null when they can't be read in full.
 */
export const getFactoryDefaults = (
	node: CallExpression,
	call: CallMatch,
	ctx: StyledContext
): ReadonlySet<string> | null => {
	const factory = resolveCalleeCall(node.callee, ctx);

	if (factory !== null) {
		return getDefaultKeys(factory, ctx);
	}

	if (call.imported === undefined) {
		return NO_KEYS;
	}

	return call.imported.defaultKeys;
};

/**
 * Whether the `createSV()` factory a call's callee came from, in this file or
 * imported, makes every variant required.
 */
export const getFactoryRequiresAll = (
	node: CallExpression,
	call: CallMatch,
	ctx: StyledContext
): boolean => {
	const factory = resolveCalleeCall(node.callee, ctx);

	if (factory !== null) {
		return getDefaultRequiresAll(factory, ctx);
	}

	return call.imported?.requiresAll === true;
};

/**
 * The classes of the `base` a `createSV(defaults)` call's defaults set, null
 * when they set none.
 */
export const getDefaultBaseStyles = (
	factory: CallExpression,
	ctx: StyledContext
): InternalStyles | null => {
	const match = ctx.matchCall(factory);

	if (match === null || match.config === null || !match.isFactoryConfig) {
		return null;
	}

	const base = getProperties(match.config).get('base');

	if (base === undefined) {
		return null;
	}

	return buildStyles(new Map([['base', base]]), NO_ARGS, ctx.sourceCode);
};

// The classes of the `base` a `createSV()` factory, in this file or imported,
// gives a call through it whose config sets none: one with neither `base` nor
// `extend`, whose parents' would take its place. Null for any other call, or
// a config that can't be read in full.
const getFactoryBaseStyles = (
	call: CallExpression,
	config: ObjectExpression,
	ctx: StyledContext
): InternalStyles | null => {
	const properties = getStrictProperties(config);

	if (
		properties === null ||
		properties.has('base') ||
		properties.has('extend')
	) {
		return null;
	}

	const factory = resolveCalleeCall(call.callee, ctx);

	if (factory !== null) {
		return getDefaultBaseStyles(factory, ctx);
	}

	return ctx.matchCall(call)?.imported?.base ?? null;
};

// Joins `items`' lists per key, each value once, in order.
const joinLists = (
	items: ReadonlyArray<ReadonlyMap<string, ReadonlyArray<string>>>
): Map<string, string[]> => {
	const joined = new Map<string, string[]>();

	for (const item of items) {
		for (const [key, values] of item) {
			const list = getOrCreate(joined, key, () => []);

			for (const value of values) {
				if (!list.includes(value)) {
					list.push(value);
				}
			}
		}
	}

	return joined;
};

// The groups naming each slot, read off the slots of each group.
const invertGroups = (groupSlots: GroupSlots): Map<string, string[]> => {
	const slotGroups = new Map<string, string[]>();

	for (const [group, slots] of groupSlots) {
		for (const slot of slots) {
			getOrCreate(slotGroups, slot, () => []).push(group);
		}
	}

	return slotGroups;
};

// The presets of each styles, merged as `extend` merges them: a preset both
// define takes the values of both, the later winning. With a parent that
// can't be read, any preset may set other values too.
const mergePresets = (
	all: ReadonlyArray<InternalStyles>,
	complete: boolean
): Map<string, PresetValues> => {
	const presets = new Map<string, PresetValues>();

	for (const styles of all) {
		for (const [name, preset] of styles.presets) {
			const inherited = presets.get(name) ?? NO_PRESET;

			presets.set(name, {
				matchers: new Map([...inherited.matchers, ...preset.matchers]),
				complete: complete && inherited.complete && preset.complete
			});
		}
	}

	return presets;
};

// The variants any layer gives a default, null when one can't be read or may
// have defaults that can't.
const mergeDefaulted = (
	all: ReadonlyArray<InternalStyles>,
	complete: boolean
): ReadonlySet<string> | null => {
	if (!complete) {
		return null;
	}

	const defaulted = new Set<string>();

	for (const styles of all) {
		if (styles.defaulted === null) {
			return null;
		}

		for (const key of styles.defaulted) {
			defaulted.add(key);
		}
	}

	return defaulted;
};

// The variants a layer declares that no layer gives a default. None when
// that can't be known.
const mergeOptional = (
	all: ReadonlyArray<InternalStyles>,
	defaulted: ReadonlySet<string> | null
): ReadonlySet<string> => {
	if (defaulted === null) {
		return NO_KEYS;
	}

	const optional = new Set<string>();

	for (const styles of all) {
		for (const key of styles.optional) {
			if (!defaulted.has(key)) {
				optional.add(key);
			}
		}
	}

	return optional;
};

/**
 * The classes a config that extends others applies: its parents', then its
 * own. Defaults and presets are merged the way `extend` merges them, the
 * config's own winning, and a parent that can't be read leaves the presets
 * open. A variant stays unset only when no layer gives it a default, and none
 * does when every parent is read in full.
 */
const mergeStyles = (
	{ parents, complete }: ParentStyles,
	own: InternalStyles
): InternalStyles => {
	const all = [...parents, own];
	const bySlot: TokenEntriesBySlot = new Map();

	for (const styles of all) {
		for (const [slot, tokens] of styles.bySlot) {
			const merged = getOrCreate(bySlot, slot, () => new Map());

			for (const [token, entries] of tokens) {
				getOrCreate(merged, token, () => []).push(...entries);
			}
		}
	}

	const groupSlots = joinLists(all.map((styles) => styles.groupSlots));
	const defaulted = mergeDefaulted(all, complete);

	return {
		bySlot,
		slotNames: new Set(all.flatMap((styles) => [...styles.slotNames])),
		defaults: new Map(all.flatMap((styles) => [...styles.defaults])),
		presets: mergePresets(all, complete),
		openPresets: !complete || parents.some((styles) => styles.openPresets),
		optional: mergeOptional(all, defaulted),
		defaulted,
		groupSlots,
		slotGroups: invertGroups(groupSlots)
	};
};

// Every entry of some styles.
const getAllEntries = (styles: InternalStyles): Entry[] =>
	[...styles.bySlot.values()].flatMap((tokens) =>
		[...tokens.values()].flat()
	);

// The classes of `own` with those it inherits from `parents` merged in.
const withInherited = (
	parentStyles: ParentStyles,
	own: InternalStyles
): CallStyles => ({
	styles: mergeStyles(parentStyles, own),
	inherited: new Set(parentStyles.parents.flatMap(getAllEntries))
});

// The classes of a call extending other components, read with the slots its
// parents give it. `visiting` holds the calls on the path to it.
const getExtendedStyles = (
	call: CallExpression,
	properties: ReadonlyMap<string, Node>,
	extend: Node,
	args: ReadonlyArray<Expression | SpreadElement>,
	ctx: StyledContext,
	visiting: Set<Node>
): CallStyles =>
	getOrCreate(extendedStylesCache, call, () => {
		visiting.add(call);

		const parentStyles = resolveParentStyles(extend, ctx, visiting);
		const inheritedSlots = new Set(
			parentStyles.parents.flatMap((styles) => [...styles.slotNames])
		);

		return withInherited(
			parentStyles,
			buildStyles(properties, args, ctx.sourceCode, inheritedSlots)
		);
	});

/**
 * The classes a config's own call applies, its inherited ones included: those
 * of the components it extends, and the `base` of the `createSV()` factory it
 * goes through when it sets none.
 */
export const getCallStyles = (
	call: CallExpression,
	config: ObjectExpression,
	args: ReadonlyArray<Expression | SpreadElement>,
	ctx: StyledContext
): CallStyles => {
	const properties = getConfigProperties(config, ctx.sourceCode);
	const extend = properties.get('extend');

	if (extend !== undefined) {
		return getExtendedStyles(
			call,
			properties,
			extend,
			args,
			ctx,
			new Set()
		);
	}

	const own = getConfigStyles(call, config, args, ctx.sourceCode);
	const factoryBase = getFactoryBaseStyles(call, config, ctx);

	if (factoryBase === null) {
		return { styles: own, inherited: NO_ENTRIES };
	}

	return withInherited({ parents: [factoryBase], complete: true }, own);
};

// The parents an `extend` value names: one, or each of a list. One that isn't
// an `sv()` result read through `const` bindings — an import, a spread — can't
// be read. `visiting` holds the calls on the path, so a cycle reads as none.
const resolveParentStyles = (
	extend: Node,
	ctx: StyledContext,
	visiting: Set<Node>
): ParentStyles => {
	const resolved = ctx.resolve(extend);
	let items: ReadonlyArray<Node | null> = [resolved];

	if (resolved.type === 'ArrayExpression') {
		items = resolved.elements;
	}

	const parents: InternalStyles[] = [];
	let complete = true;

	for (const item of items) {
		let styles: InternalStyles | null = null;

		if (item !== null && item.type !== 'SpreadElement') {
			styles = resolveVariantFnStyles(item, ctx, visiting);
		}

		if (styles === null) {
			complete = false;
		} else if (!parents.includes(styles)) {
			parents.push(styles);
		}
	}

	return { parents, complete };
};

// The `sv(config)` call a compiled variant function came from, reached through
// the `const` binding the call site names, with the parents it extends.
const resolveVariantFnStyles = (
	callee: Node,
	ctx: StyledContext,
	visiting: Set<Node> = new Set()
): InternalStyles | null => {
	const resolved = resolveCalleeCall(callee, ctx);

	if (resolved === null || visiting.has(resolved)) {
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
	const properties = getConfigProperties(config, ctx.sourceCode);
	const extend = properties.get('extend');

	if (extend !== undefined) {
		return getExtendedStyles(
			resolved,
			properties,
			extend,
			args,
			ctx,
			visiting
		).styles;
	}

	const own = getConfigStyles(resolved, config, args, ctx.sourceCode);
	const factoryBase = getFactoryBaseStyles(resolved, config, ctx);

	if (factoryBase === null) {
		return own;
	}

	return getOrCreate(factoryStylesCache, resolved, () =>
		mergeStyles({ parents: [factoryBase], complete: true }, own)
	);
};

// The slot function a callee names, as a slot read off a result, if it is
// one.
const readSlotFn = (
	callee: Node,
	ctx: StyledContext,
	visited: Set<CallExpression>
): SlotRead | null => {
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
		// A slot call runs the variant function again, with the props the
		// result was produced with and its own merged in: a preset it names
		// replaces the outer call's, and sits below the outer call's props.
		const props = mergeCallProps(
			slotFn.props,
			readCallProps(node.arguments[0], ctx),
			ctx
		);

		return {
			styles: slotFn.styles,
			...buildCallMatchers(
				props,
				slotFn.styles.defaults,
				slotFn.styles,
				ctx
			),
			slot: slotFn.slot,
			props
		};
	}

	// A member read that is no slot names no variant function either.
	const styles = resolveVariantFnStyles(callee, ctx);

	if (styles === null) {
		return null;
	}

	const props = readCallProps(node.arguments[0], ctx);

	return {
		styles,
		...buildCallMatchers(props, styles.defaults, styles, ctx),
		slot: null,
		props
	};
};

/**
 * The key a member read names: `classes.header`, or a static key like
 * `classes['header']`. Null for a key that can't be read.
 */
export const getMemberKey = (
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
): SlotRead | null => {
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
		...pickCallMatchers(invocation),
		props: invocation.props
	};
};

// Classes with no config behind them: the literals of a `cn()`-style list.
const buildLiteralStyles = (entries: ReadonlyArray<Entry>): InternalStyles => ({
	bySlot: indexEntriesBySlotAndToken(entries),
	slotNames: EMPTY_SLOT_NAMES,
	defaults: EMPTY_MATCHERS,
	presets: NO_PRESETS,
	openPresets: false,
	optional: NO_KEYS,
	defaulted: NO_KEYS,
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

// Whether a component's result is a per-slot object rather than a string: it
// has a slot besides `base`, or a group, which only a slot of its own reaches.
const hasSlotsBesidesBase = ({ slotNames }: InternalStyles): boolean => {
	for (const name of slotNames) {
		if (name !== 'base') {
			return true;
		}
	}

	return false;
};

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
	if (invocation.slot === null && hasSlotsBesidesBase(invocation.styles)) {
		return null;
	}

	return {
		styles: invocation.styles,
		slot: invocation.slot ?? 'base',
		...pickCallMatchers(invocation)
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
	ctx: StyledContext,
	visit: (slot: string, node: Node) => void
) => {
	if (pinnedSlot !== null) {
		visit(pinnedSlot, value);

		return;
	}

	// Read through `const` bindings and type-only wrappers, as the runtime
	// sees the object itself.
	const slotKeyed = collectSlotKeyedProperties(
		ctx.resolve(value),
		styles.slotNames
	);

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
	return getClassValue(readCallProps(arg, ctx).read) ?? null;
};

/** The `class` / `className` a call site's props pass, spread ones included. */
export const readOverride = (
	arg: Expression | SpreadElement | undefined,
	ctx: StyledContext
): Override => {
	const { read, spreads, overridable } = readCallProps(arg, ctx);
	const value = getClassValue(read) ?? null;

	if (
		spreads === null ||
		(value !== null &&
			!overridable.has('class') &&
			!overridable.has('className'))
	) {
		return { value, spreads: NO_SPREADS };
	}

	return { value, spreads };
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