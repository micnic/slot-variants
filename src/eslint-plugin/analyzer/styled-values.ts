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
import {
	type CallMatch,
	type ImportedFactory,
	isClassListMatch
} from './call-matching.ts';
import { getKeyName } from './config-keys.ts';
import { getImportSource } from './components.ts';
import {
	type DestructuredRead,
	findInLookupScope,
	findSingleBinding,
	findVariable,
	getDestructuredRead,
	isInTemplate,
	resolveContainer,
	resolveStaticValue
} from './const-bindings.ts';
import { getStaticStringText } from './literals.ts';
import {
	isDefinedValue,
	isLiteralTrue,
	isNullLiteral,
	isUndefinedValue
} from './static-predicates.ts';
import {
	collectSlotKeyedProperties,
	getClassValue,
	getConfigRecord,
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
	type PresetValues,
	readMatchers,
	readPresetValues
} from './token-extraction.ts';
import {
	EMPTY_MATCHERS,
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
	// Whether its config sets `base`: a field, base args, or its factory's.
	setsBase: boolean;
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
type CallStyles = {
	styles: InternalStyles;
	inherited: ReadonlySet<Entry>;
};

// What a config takes from the parents in `extend`: the slot and group names
// a slot object of it may name, and the slots of each group.
type Inherited = { slots: ReadonlySet<string>; groups: GroupSlots };

// What a call's props are read against: the presets it may name, and the
// variants it leaves unset unless it passes them.
type CallOptions = Pick<
	InternalStyles,
	'defaults' | 'presets' | 'openPresets' | 'optional'
>;

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
type CallMatchers = {
	matchers: VariantMatchers;
	defaultMatchers: VariantMatchers;
	unreadProps: ReadonlyMap<string, Node>;
	inputs: CallInputs;
};

// A call's props: the ones that can be read, those of the object literals it
// spreads included, the objects it spreads that can't be read (null when a
// computed key may pass any prop), and the props written ahead of one of
// those, which it may replace. A slot call naming a preset also keeps the
// outer call's preset beneath its own.
type CallProps = {
	read: ReadonlyMap<string, Node>;
	spreads: ReadonlyArray<Node> | null;
	overridable: ReadonlySet<string>;
	basePreset?: Node | undefined;
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
type Override = { value: Node | null; spreads: ReadonlyArray<Node> };

/** A class expression produced by slot-variants, and the slot it feeds. */
export type StyledClasses = CallMatchers & {
	styles: InternalStyles;
	slot: string;
};

// A slot read off a variant function's result, with the props the result was
// produced with, which a call of the slot is merged with.
type SlotRead = Invocation & { slot: string };

// Reads a node through same-file `const` bindings.
type ResolveNode = (node: Node) => Node;

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

// A framework function, by the module and export name it's imported as.
type FrameworkImport = { specifier: string; exportName: string };

const EMPTY_PROPS: ReadonlyMap<string, Node> = new Map();

const NO_KEYS: ReadonlySet<string> = new Set();

const NO_SPREADS: ReadonlyArray<Node> = [];

// What a call inherits when it goes through no factory: `sv()` itself.
const NO_FACTORY: ImportedFactory = {
	defaultKeys: NO_KEYS,
	requiresAll: false,
	base: null
};

const NO_CALL_PROPS: CallProps = {
	read: EMPTY_PROPS,
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

const NO_INHERITED: Inherited = {
	slots: EMPTY_SLOT_NAMES,
	groups: EMPTY_GROUPS
};

// Vue's `computed()`, a ref its template reads unwrapped and its script
// through `.value`.
const VUE_COMPUTED: FrameworkImport = {
	specifier: 'vue',
	exportName: 'computed'
};

// Solid's `createMemo()`, an accessor read by calling it.
const SOLID_MEMO: FrameworkImport = {
	specifier: 'solid-js',
	exportName: 'createMemo'
};

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

// The classes of a call extending other components or taking the `base` of the
// `createSV()` factory it goes through, its inherited ones included, kept
// apart from the call's own: other rules read those without them.
const callStylesCache = new WeakMap<Node, CallStyles>();

const NO_ENTRIES: ReadonlySet<Entry> = new Set();

const NO_ARGS: ReadonlyArray<Expression | SpreadElement> = [];

// The settings of each `createSV(defaults)` call in this file, read once.
const factoryCache = new WeakMap<CallExpression, ImportedFactory>();

const readGroups = (
	groups: ReadonlyMap<string, Node>,
	sourceCode: SourceCode
): GroupSlots => {
	const groupSlots = new Map<string, string[]>();

	for (const [group, value] of groups) {
		const slots: string[] = [];

		forEachStringLiteralElement(value, sourceCode, (slot) => {
			slots.push(slot);
		});

		groupSlots.set(group, slots);
	}

	return groupSlots;
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

// The variants a config gives a default, one left `undefined` aside. Null
// when its `defaultVariants` can't be read in full.
const readDefaultedVariants = (
	defaultVariants: Node | undefined,
	sourceCode: SourceCode
): ReadonlySet<string> | null => {
	// None set reads as none defaulted.
	let defaults: ReadonlyMap<string, Node> | null = EMPTY_PROPS;

	if (defaultVariants !== undefined) {
		defaults = getStrictProperties(defaultVariants);
	}

	if (defaults === null) {
		return null;
	}

	const defaulted = new Set<string>();

	for (const [key, value] of defaults) {
		if (isDefinedValue(value, sourceCode)) {
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

const buildStyles = (
	config: ReadonlyMap<string, Node>,
	args: ReadonlyArray<Expression | SpreadElement>,
	sourceCode: SourceCode,
	inherited: Inherited = NO_INHERITED
): InternalStyles => {
	const slotNames = new Set([
		...inherited.slots,
		...getConfigSlotNames(config, sourceCode)
	]);
	const defaults = resolveContainer(
		config.get('defaultVariants'),
		sourceCode
	);
	const presets = readPresets(
		getConfigRecord(config, 'presets', sourceCode),
		sourceCode
	);
	const defaulted = readDefaultedVariants(defaults, sourceCode);

	return {
		bySlot: indexEntriesBySlotAndToken(
			collectConfigEntries(
				config,
				slotNames,
				inherited.groups,
				presets,
				args,
				sourceCode
			)
		),
		slotNames,
		defaults: readMatchers(getProperties(defaults), sourceCode),
		presets,
		openPresets: false,
		optional: readOptionalVariants(config, defaulted, sourceCode),
		defaulted,
		groupSlots: joinLists([
			inherited.groups,
			readGroups(
				getConfigRecord(config, 'groups', sourceCode),
				sourceCode
			)
		]),
		// Base args are folded into `base`, so they set it too
		setsBase: config.has('base') || args.length > 0
	};
};

export const createStyledContext = (
	sourceCode: SourceCode,
	matchCall: StyledContext['matchCall']
): StyledContext => ({
	sourceCode,
	matchCall,
	variableOf: (node) => findInLookupScope(node, sourceCode, findVariable),
	resolve: (node) => resolveStaticValue(node, sourceCode)
});

// The variant values a call's props pass, with a `null` one left unset.
const readPropMatchers = (
	props: ReadonlyMap<string, Node>,
	ctx: StyledContext
): Map<string, ReadonlySet<string>> => {
	const matchers = readMatchers(props, ctx.sourceCode, NON_MATCHER_KEYS);

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
	preset: Node | undefined,
	{ presets, openPresets }: CallOptions,
	ctx: StyledContext
): PresetValues => {
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

// Whether every prop a call passes can be read: it spreads nothing that can't.
const readsAll = ({ spreads }: CallProps): boolean =>
	spreads !== null && spreads.length === 0;

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
		return { read, spreads: null, overridable };
	}

	return { read, spreads, overridable };
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

	// Props that aren't an object literal are one object spread into them.
	let spread: Node;

	if (arg.type === 'SpreadElement') {
		spread = arg.argument;
	} else {
		const resolved = ctx.resolve(arg);

		if (resolved.type === 'ObjectExpression') {
			return readObjectProps(resolved, ctx);
		}

		spread = resolved;
	}

	return { read: EMPTY_PROPS, spreads: [spread], overridable: NO_KEYS };
};

// Whether a prop passes a value that sets something: any but an `undefined`
// one or a class.
const isPassedProp = (key: string, value: Node, ctx: StyledContext): boolean =>
	key !== 'class' &&
	key !== 'className' &&
	isDefinedValue(value, ctx.sourceCode);

// The outer call's props a slot call keeps under the preset it names, as
// `sv()` merges them: those for the variants the preset sets give way to it,
// and any of them may when it can't be read in full.
const readOuterProps = (
	outer: CallProps,
	inner: CallProps,
	options: CallOptions,
	ctx: StyledContext
): CallProps => {
	const preset = readPresetMatchers(inner.read.get('preset'), options, ctx);

	if (preset === NO_PRESET) {
		return outer;
	}

	const read = new Map(outer.read);
	const overridable = new Set(outer.overridable);

	for (const key of preset.matchers.keys()) {
		read.delete(key);
	}

	if (!preset.complete) {
		for (const key of read.keys()) {
			overridable.add(key);
		}
	}

	return {
		read,
		spreads: outer.spreads,
		overridable,
		basePreset: outer.read.get('preset')
	};
};

// The props a slot call runs its variant function with: the outer call's,
// with its own merged in. Props of its own that can't all be read may replace
// any of the outer call's, so only its own are read then.
const mergeCallProps = (
	outerProps: CallProps,
	inner: CallProps,
	options: CallOptions,
	ctx: StyledContext
): CallProps => {
	if (!readsAll(inner)) {
		return inner;
	}

	const outer = readOuterProps(outerProps, inner, options, ctx);
	// Props of its own that can all be read spread nothing, so the outer
	// call's spreads are all there is.
	const read = new Map(outer.read);
	const overridable = new Set(outer.overridable);

	// A prop of its own replaces the outer call's, whatever that spreads,
	// unless it's `undefined`; a class is merged instead.
	for (const [key, value] of inner.read) {
		if (!isDefinedValue(value, ctx.sourceCode)) {
			continue;
		}

		overridable.delete(key);

		if (key !== 'class' && key !== 'className') {
			read.set(key, value);
		}
	}

	const { basePreset, spreads } = outer;

	return { read, spreads, overridable, basePreset };
};

// The values a call keeps from its `defaultVariants`, and the optional
// variants it leaves unset: the ones it neither passes nor gets from its
// preset, counting a prop whose value can't be read as not passed. None when
// its props or preset can't be read in full, and so may set any variant.
const readBaseMatchers = (
	props: ReadonlyMap<string, Node> | null,
	unread: ReadonlyMap<string, Node>,
	{ defaults, optional }: CallOptions,
	preset: PresetValues,
	ctx: StyledContext
): VariantMatchers => {
	if (props === null || !preset.complete) {
		return EMPTY_MATCHERS;
	}

	const matchers = new Map(defaults);

	for (const key of optional) {
		if (
			(unread.has(key) ||
				!isDefinedValue(props.get(key), ctx.sourceCode)) &&
			!preset.matchers.has(key)
		) {
			matchers.set(key, UNSET_MATCHER);
		}
	}

	return matchers;
};
// The variant props a call passes whose values can't be read: one passing
// `undefined` leaves the variant to its default, anything else may select any
// of its values.
const readUnreadProps = (
	read: ReadonlyMap<string, Node>,
	propMatchers: VariantMatchers,
	ctx: StyledContext
): ReadonlyMap<string, Node> => {
	const unread = new Map<string, Node>();

	for (const [key, value] of read) {
		if (
			!NON_MATCHER_KEYS.has(key) &&
			!propMatchers.has(key) &&
			!isUndefinedValue(ctx.resolve(value))
		) {
			unread.set(key, value);
		}
	}

	return unread;
};

// The props a call passes whatever it spreads: any but an `undefined` one, a
// class, or one written ahead of a spread that may replace it.
const readPassedKeys = (
	{ read, overridable }: CallProps,
	ctx: StyledContext
): ReadonlySet<string> => {
	const passed = new Set<string>();

	for (const [key, value] of read) {
		if (!overridable.has(key) && isPassedProp(key, value, ctx)) {
			passed.add(key);
		}
	}

	return passed;
};

// The preset values a call applies: those of the preset it names, over a slot
// call's outer one, which it replaces only for the variants it sets. One that
// can't be read in full leaves the pair unread too.
const readCallPreset = (
	{ read, basePreset }: CallProps,
	options: CallOptions,
	ctx: StyledContext
): PresetValues => {
	const preset = readPresetMatchers(read.get('preset'), options, ctx);

	if (basePreset === undefined || preset === UNKNOWN_PRESET) {
		return preset;
	}

	const base = readPresetMatchers(basePreset, options, ctx);

	return {
		matchers: new Map([...base.matchers, ...preset.matchers]),
		complete: base.complete && preset.complete
	};
};

// The matchers a call applies: its defaults, refined by the props it passes.
// Later matchers win: a call site's props over its preset's values, and those
// over the config's `defaultVariants` or the `optional` variants it leaves
// unset. A variant prop that can't be read leaves `matchers` open for it.
const buildCallMatchers = (
	props: CallProps,
	options: CallOptions,
	ctx: StyledContext
): CallMatchers => {
	const { read, spreads, overridable } = props;
	// Its props are all read only when it spreads nothing that can't be.
	let known: ReadonlyMap<string, Node> | null = null;

	if (readsAll(props)) {
		known = read;
	}

	const preset = readCallPreset(props, options, ctx);
	const propMatchers = readPropMatchers(read, ctx);
	const unreadProps = readUnreadProps(read, propMatchers, ctx);
	const matchers = new Map([
		...readBaseMatchers(known, unreadProps, options, preset, ctx),
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
			...readBaseMatchers(read, unreadProps, options, readPreset, ctx),
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
const resolveCalleeCall = (
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
 * The classes of the `base` a `createSV(defaults)` call's defaults set, null
 * when they set none.
 */
const getDefaultBaseStyles = (
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

/**
 * The settings of a `createSV(defaults)` call's defaults, read as an importer
 * of the module holding it does.
 */
export const readFactoryDefaults = (
	factory: CallExpression,
	ctx: StyledContext
): ImportedFactory => {
	const [defaults] = factory.arguments;
	const base = getDefaultBaseStyles(factory, ctx);
	// Called without defaults, it sets none
	let props: ReadonlyMap<string, Node> | null = EMPTY_PROPS;

	if (defaults !== undefined) {
		props = getStrictProperties(ctx.resolve(defaults));
	}

	// Defaults that can't be read in full may set any key, and make every
	// variant required only when they can be read to `requiredVariants: true`
	if (props === null) {
		return { defaultKeys: null, requiresAll: false, base };
	}

	const required = props.get('requiredVariants');

	return {
		defaultKeys: new Set(props.keys()),
		requiresAll:
			required !== undefined && isLiteralTrue(ctx.resolve(required)),
		base
	};
};

/**
 * The settings of the `createSV()` factory a call's callee came from: read
 * from the factory call in this file, or else from the imported one, or what
 * `sv()` itself has.
 */
export const getCallFactory = (
	call: CallExpression,
	ctx: StyledContext
): ImportedFactory => {
	const factory = resolveCalleeCall(call.callee, ctx);

	if (factory === null) {
		return ctx.matchCall(call)?.imported ?? NO_FACTORY;
	}

	return getOrCreate(factoryCache, factory, () =>
		readFactoryDefaults(factory, ctx)
	);
};

/** Whether a call whose factory defaults are `defaults` may inherit `key`. */
export const mayInheritKey = (
	defaults: ReadonlySet<string> | null,
	key: string
): boolean => defaults === null || defaults.has(key);

// The classes of the `base` a `createSV()` factory, in this file or imported,
// gives a call through it whose config sets none. Null for any other call, or
// a config that can't be read in full. A call extending parents takes it only
// where none of them sets a `base`, which its caller checks.
const getFactoryBaseStyles = (
	call: CallExpression,
	config: ObjectExpression,
	ctx: StyledContext
): InternalStyles | null => {
	const properties = getStrictProperties(config);

	if (properties === null || properties.has('base')) {
		return null;
	}

	return getCallFactory(call, ctx).base;
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

	const defaulted = mergeDefaulted(all, complete);

	return {
		bySlot,
		// Own styles already hold every parent's slots and groups, and a
		// factory's `base` has none.
		slotNames: own.slotNames,
		defaults: new Map(all.flatMap((styles) => [...styles.defaults])),
		presets: mergePresets(all, complete),
		openPresets: !complete || parents.some((styles) => styles.openPresets),
		optional: mergeOptional(all, defaulted),
		defaulted,
		groupSlots: own.groupSlots,
		setsBase: all.some((styles) => styles.setsBase)
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

// The parents of a call through a `createSV()` factory, its factory's `base`
// below them when none of them sets one, as in `sv()`. A parent that can't be
// read may set one, so the factory's is then left out.
const withFactoryBase = (
	call: CallExpression,
	config: ObjectExpression,
	parentStyles: ParentStyles,
	ctx: StyledContext
): ParentStyles => {
	const { parents, complete } = parentStyles;

	if (!complete || parents.some((styles) => styles.setsBase)) {
		return parentStyles;
	}

	const factoryBase = getFactoryBaseStyles(call, config, ctx);

	if (factoryBase === null) {
		return parentStyles;
	}

	return { parents: [factoryBase, ...parents], complete };
};

// The classes of a call extending other components, read with the slots its
// parents give it. `visiting` holds the calls on the path to it.
const getExtendedStyles = (
	call: CallExpression,
	config: ObjectExpression,
	extend: Node,
	args: ReadonlyArray<Expression | SpreadElement>,
	ctx: StyledContext,
	visiting: Set<Node>
): CallStyles =>
	getOrCreate(callStylesCache, call, () => {
		visiting.add(call);

		const parentStyles = resolveParentStyles(extend, ctx, visiting);
		const { parents } = parentStyles;
		const inherited: Inherited = {
			slots: new Set(parents.flatMap((styles) => [...styles.slotNames])),
			groups: joinLists(parents.map((styles) => styles.groupSlots))
		};

		return withInherited(
			withFactoryBase(call, config, parentStyles, ctx),
			buildStyles(
				getConfigProperties(config, ctx.sourceCode),
				args,
				ctx.sourceCode,
				inherited
			)
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
	ctx: StyledContext,
	visiting: Set<Node> = new Set()
): CallStyles => {
	const properties = getConfigProperties(config, ctx.sourceCode);
	const extend = properties.get('extend');

	if (extend !== undefined) {
		return getExtendedStyles(call, config, extend, args, ctx, visiting);
	}

	// The call's own classes, memoized on the call node so a config referenced
	// from many call sites, or read by more than one rule, is walked once per
	// lint pass.
	const own = getOrCreate(stylesCache, call, () =>
		buildStyles(properties, args, ctx.sourceCode)
	);
	const factoryBase = getFactoryBaseStyles(call, config, ctx);

	if (factoryBase === null) {
		return { styles: own, inherited: NO_ENTRIES };
	}

	return getOrCreate(callStylesCache, call, () =>
		withInherited({ parents: [factoryBase], complete: true }, own)
	);
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

	return getCallStyles(resolved, match.config, match.args, ctx, visiting)
		.styles;
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
	const slotFn = resolveStyledRead(callee, ctx, visited);
	// A member read that is no slot names no variant function either.
	const styles = slotFn?.styles ?? resolveVariantFnStyles(callee, ctx);

	if (styles === null) {
		return null;
	}

	let props = readCallProps(node.arguments[0], ctx);
	let slot: string | null = null;

	if (slotFn !== null) {
		// A slot call runs the variant function again, with the props the
		// result was produced with and its own merged in: a preset it names
		// replaces the outer call's props and preset for the variants it sets.
		props = mergeCallProps(slotFn.props, props, styles, ctx);
		slot = slotFn.slot;
	}

	return { styles, ...buildCallMatchers(props, styles, ctx), slot, props };
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

// What a reactive wrapper's function computes: an arrow's expression body.
// Null for anything else, as a block body may compute anything.
const getArrowBody = (fn: Node | undefined): Node | null => {
	if (
		fn?.type !== 'ArrowFunctionExpression' ||
		fn.body.type === 'BlockStatement'
	) {
		return null;
	}

	return fn.body;
};

// The value a framework function computes, read through `fn`'s arrow: null
// unless `value` calls the function `source` names, imported under any name.
const readFrameworkCall = (
	value: Node,
	source: FrameworkImport,
	ctx: StyledContext
): Node | null => {
	if (value.type !== 'CallExpression' || value.callee.type !== 'Identifier') {
		return null;
	}

	const binding = findInLookupScope(
		value.callee,
		ctx.sourceCode,
		findSingleBinding
	);

	if (binding?.def.type !== 'ImportBinding') {
		return null;
	}

	const imported = getImportSource(binding.def);

	if (
		imported?.specifier !== source.specifier ||
		imported.exportName !== source.exportName
	) {
		return null;
	}

	return getArrowBody(value.arguments[0]);
};

// The value a Svelte `$derived(x)` or `$derived.by(() => x)` rune holds.
const readDerived = (value: Node, ctx: StyledContext): Node | null => {
	if (value.type !== 'CallExpression') {
		return null;
	}

	const { callee } = value;
	const [argument] = value.arguments;

	if (callee.type === 'Identifier' && callee.name === '$derived') {
		return argument ?? null;
	}

	if (
		callee.type === 'MemberExpression' &&
		callee.object.type === 'Identifier' &&
		callee.object.name === '$derived' &&
		getMemberKey(callee, ctx) === 'by'
	) {
		return getArrowBody(argument);
	}

	return null;
};

/**
 * The expression a reactive wrapper of a value stands for where `node` reads
 * it: a Svelte `$derived`, a Vue `computed` in its template or through
 * `.value`, or a Solid `createMemo` accessor's call. Null for any other read.
 */
const getReactiveSource = (node: Node, ctx: StyledContext): Node | null => {
	if (
		node.type === 'MemberExpression' &&
		getMemberKey(node, ctx) === 'value'
	) {
		return readFrameworkCall(ctx.resolve(node.object), VUE_COMPUTED, ctx);
	}

	if (node.type === 'CallExpression' && node.arguments.length === 0) {
		const memo = readFrameworkCall(
			ctx.resolve(node.callee),
			SOLID_MEMO,
			ctx
		);

		if (memo !== null) {
			return memo;
		}
	}

	const value = ctx.resolve(node);

	if (isInTemplate(node, ctx.sourceCode)) {
		return readFrameworkCall(value, VUE_COMPUTED, ctx);
	}

	return readDerived(value, ctx);
};

/**
 * Resolves `node` like `ctx.resolve`, first reading through the reactive
 * wrappers frameworks hold a result in. One that holds itself ends the walk.
 */
const resolveReactive = (node: Node, ctx: StyledContext): Node => {
	const seen = new Set<Node>();
	let current = node;
	let source = getReactiveSource(current, ctx);

	while (source !== null && !seen.has(source)) {
		seen.add(source);
		current = source;
		source = getReactiveSource(current, ctx);
	}

	return ctx.resolve(current);
};

// The value and key a slot read takes: a member read, or a name destructured
// off the value; none for any other node.
const getSlotRead = (
	node: Node,
	ctx: StyledContext
): DestructuredRead | null => {
	if (node.type === 'Identifier') {
		return getDestructuredRead(node, ctx.sourceCode);
	}

	if (node.type !== 'MemberExpression') {
		return null;
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
	node: Node,
	ctx: StyledContext,
	visited: Set<CallExpression> = new Set()
): SlotRead | null => {
	const read = getSlotRead(node, ctx);

	if (read === null) {
		return null;
	}

	const object = resolveReactive(read.object, ctx);

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

	return { ...invocation, slot };
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
	setsBase: false
});

/**
 * The literal classes a `cn()`-style list applies on its own, as a styled part
 * — what a forwarded `class` prop is merged with when the list holds no
 * slot-variants part beside it.
 */
// Styles read as a plain class list's: their `base`, matched by no variant.
const asBaseStyled = (styles: InternalStyles): StyledClasses => ({
	styles,
	slot: 'base',
	...NO_MATCHERS
});

export const literalStyles = (literals: ReadonlyArray<Entry>): StyledClasses =>
	asBaseStyled(buildLiteralStyles(literals));

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
 * Reads a node, through `const` bindings, as a class-valued slot-variants
 * expression: a `cn()` call, a config-less `sv()` call, a slotless variant
 * function's result, a slot read off a result object, or a multi-slot slot
 * call. Null for anything else, including a variant function itself (which
 * yields no classes until called).
 */
export const resolveStyledClasses = (
	node: Node,
	ctx: StyledContext
): StyledClasses | null => {
	const resolved = resolveReactive(node, ctx);

	if (resolved.type !== 'CallExpression') {
		return resolveStyledRead(resolved, ctx);
	}

	const direct = ctx.matchCall(resolved);

	// A configured `sv()` call falls through: its callee is no variant
	// function, so `resolveInvocation` yields null for it.
	if (direct !== null && isClassListMatch(direct)) {
		return asBaseStyled(
			getOrCreate(stylesCache, resolved, () =>
				buildLiteralStyles(
					collectCnEntries(direct.args, ctx.sourceCode)
				)
			)
		);
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

	return { ...invocation, slot: invocation.slot ?? 'base' };
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
 * The token maps a slot's internal classes can sit in: its own, plus that of
 * each group naming it.
 */
export const getSlotTokenMaps = (
	{ bySlot, groupSlots }: InternalStyles,
	slot: string
): ReadonlyArray<ReadonlyMap<string, Entry[]>> => {
	const buckets = [slot];

	for (const [group, slots] of groupSlots) {
		if (slots.includes(slot)) {
			buckets.push(group);
		}
	}

	const tokenMaps: ReadonlyMap<string, Entry[]>[] = [];

	for (const bucket of buckets) {
		const tokenMap = bySlot.get(bucket);

		if (tokenMap !== undefined) {
			tokenMaps.push(tokenMap);
		}
	}

	return tokenMaps;
};