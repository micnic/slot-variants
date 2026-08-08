import { cn, type ClassValue } from './cn.ts';

type Prettify<T> = {
	[K in keyof T]: T[K];
} & {};

type PartialNullable<T> = {
	[K in keyof T]?: T[K] | null | undefined;
};

type StringKeyof<T> = Extract<keyof T, string>;
type ConfigClassValue = string | string[] | undefined;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFn = (...args: any[]) => unknown;

type RuntimeVariantValue = string | number | boolean;

type RuntimeVariantState = Record<
	string,
	RuntimeVariantValue | null | undefined
>;

type ResolvedVariantState = Record<string, RuntimeVariantValue | undefined>;

type RuntimeVariantMatcher =
	| RuntimeVariantValue
	| readonly RuntimeVariantValue[];

type EitherClassProp<C, O extends boolean = false> = O extends true
	? { class?: C; className?: never } | { class?: never; className?: C }
	: { class: C; className?: never } | { class?: never; className: C };

type Slots = Record<string, ConfigClassValue>;
type MaybeSlots = Slots | undefined;
type BooleanString<T> = T extends `${boolean}` ? boolean : T;
type SlotKey<S extends MaybeSlots> = 'base' | StringKeyof<S>;

type Groups<S extends MaybeSlots> = Record<string, readonly SlotKey<S>[]>;
type MaybeGroups<S extends MaybeSlots> = Groups<S> | undefined;

/** Every name that stands for one or more slots: a slot key or a group name. */
type SlotTarget<S extends MaybeSlots, G> = SlotKey<S> | StringKeyof<G>;

/** The slot keys a group name expands to, or `never` for a non-group key. */
type GroupSlots<G, K extends string> = K extends keyof G
	? G[K] extends readonly (infer U extends string)[]
		? U
		: never
	: never;

type BooleanShorthandKeys<S extends MaybeSlots, G> =
	| (S extends Slots ? SlotTarget<S, G> : never)
	| 'true'
	| 'false';

type VariantPropType<T, S extends MaybeSlots, G = undefined> =
	T extends Record<string | number, unknown>
		? [Extract<keyof T, number>] extends [never]
			? StringKeyof<T> extends BooleanShorthandKeys<S, G>
				? boolean
				: BooleanString<StringKeyof<T>>
			: BooleanString<StringKeyof<T>> | Extract<keyof T, number>
		: boolean;

type NormalizedVariantValue =
	| ConfigClassValue
	| Record<string, ConfigClassValue>;

type NormalizedVariantValues = Record<string, NormalizedVariantValue>;
type NormalizedVariants = Record<string, NormalizedVariantValues>;
type VariantValueIds = Record<string, number>;

type VariantData = {
	key: string;
	valueIds: VariantValueIds;
	values: NormalizedVariantValues;
};

type RuntimeVariantConfigValue = ConfigClassValue | NormalizedVariantValues;
type CacheValue = string | Record<string, string>;

type CacheEntry = {
	raw: CacheValue;
	processed: CacheValue;
};

type RuntimeDefaultVariant =
	| RuntimeVariantValue
	| ((props: RuntimeVariantState) => RuntimeVariantValue | undefined)
	| undefined;

type SlotClasses = Record<string, ConfigClassValue[]>;

/** The `groups` config with its slot names widened for runtime use. */
type RuntimeGroups = Record<string, readonly string[]>;

/** Each group name mapped to the slot names it stands for. */
type CompiledGroups = ReadonlyMap<string, readonly string[]>;

type CompoundMatcher = {
	key: string;
	expected: RuntimeVariantMatcher;
};

// A compound entry as the compiler reads it: arbitrary matcher keys, with
// `preset` pinned to a string so its name can be looked up without a cast
type CompoundEntry = Record<string, unknown> & {
	preset?: string | undefined;
};

type CompiledCompoundSlot = {
	matchers: readonly CompoundMatcher[];
	classValue: ConfigClassValue;
	slots: readonly string[];
};

type MultiSlots<S extends MaybeSlots, G = undefined> =
	| readonly SlotTarget<S, G>[]
	| boolean;

type MultiSlotKeys<
	S extends MaybeSlots,
	G,
	MS extends MultiSlots<S, G>
> = MS extends true
	? SlotKey<S>
	: MS extends readonly string[]
		? (MS[number] & SlotKey<S>) | GroupSlots<G, MS[number]>
		: never;

type ReturnValue<
	S extends MaybeSlots,
	V extends MaybeVariants<S, G>,
	P extends MaybePresets<S, V, G>,
	MS extends MultiSlots<S, G>,
	G
> = S extends undefined
	? string
	: Prettify<{
			readonly [K in SlotKey<S>]: K extends MultiSlotKeys<S, G, MS>
				? (props?: MultiSlotFnProps<S, V, P, G>) => string
				: string;
		}>;

type SlotValue<S extends MaybeSlots, V, G = undefined> = S extends Slots
	? Partial<Record<SlotTarget<S, G>, V>> | V
	: V;

type ClassProp<S extends MaybeSlots, V, G> = EitherClassProp<
	SlotValue<S, V, G>,
	true
>;

type Variants<S extends MaybeSlots, G = undefined> = Record<
	string,
	| Record<string | number, SlotValue<S, ConfigClassValue, G>>
	| SlotValue<S, ConfigClassValue, G>
>;

type MaybeVariants<S extends MaybeSlots, G = undefined> =
	| Variants<S, G>
	| undefined;

type VariantConditions<
	S extends MaybeSlots,
	V extends MaybeVariants<S, G>,
	G
> = {
	[K in StringKeyof<V>]?:
		| VariantPropType<V[K], S, G>
		| readonly VariantPropType<V[K], S, G>[]
		| undefined;
};

// A compound entry may name a preset instead of restating the variant values
// it stands for. The name is expanded into matchers when the config compiles,
// so it is sugar over those values rather than a match on the `preset` prop.
// With no `presets` config, `keyof P & string` is `never`, which makes the key
// unwritable.
type CompoundConditions<
	S extends MaybeSlots,
	V extends MaybeVariants<S, G>,
	P extends MaybePresets<S, V, G>,
	G
> = VariantConditions<S, V, G> & {
	preset?: (keyof P & string) | undefined;
};

type CompoundVariants<
	S extends MaybeSlots,
	V extends MaybeVariants<S, G>,
	P extends MaybePresets<S, V, G>,
	G
> = readonly (CompoundConditions<S, V, P, G> &
	EitherClassProp<SlotValue<S, ConfigClassValue, G>>)[];

type CompoundSlots<
	S extends MaybeSlots,
	V extends MaybeVariants<S, G>,
	P extends MaybePresets<S, V, G>,
	G
> = readonly ({
	slots: readonly [SlotTarget<S, G>, ...SlotTarget<S, G>[]];
} & CompoundConditions<S, V, P, G> &
	EitherClassProp<ConfigClassValue>)[];

type VariantPropsInternal<
	S extends MaybeSlots,
	V extends MaybeVariants<S, G>,
	G
> = {
	[K in StringKeyof<V>]: VariantPropType<V[K], S, G>;
};

type MultiSlotFnProps<
	S extends MaybeSlots,
	V extends MaybeVariants<S, G>,
	P extends MaybePresets<S, V, G>,
	G
> = Prettify<
	P extends undefined
		? PartialNullable<VariantPropsInternal<S, V, G>>
		: PartialNullable<VariantPropsInternal<S, V, G>> & {
				preset?: StringKeyof<P> | undefined;
			}
> &
	EitherClassProp<ClassValue, true>;

type DefaultVariantValue<
	S extends MaybeSlots,
	V extends MaybeVariants<S, G>,
	K extends StringKeyof<V>,
	G
> =
	| VariantPropType<V[K], S, G>
	| ((props: RuntimeVariantState) => VariantPropType<V[K], S, G> | undefined)
	| undefined;

type RuntimeClassValue = SlotValue<Slots, ClassValue>;

type Presets<
	S extends MaybeSlots,
	V extends MaybeVariants<S, G>,
	G
> = Record<string, Partial<VariantPropsInternal<S, V, G>>>;

type MaybePresets<
	S extends MaybeSlots,
	V extends MaybeVariants<S, G>,
	G
> = Presets<S, V, G> | undefined;

type PresetNameCollision<V extends MaybeVariants<MaybeSlots>, P> = {
	[K in Extract<
		keyof P,
		StringKeyof<V>
	>]: 'Preset name must not match a variant name';
};

type RuntimeProps = RuntimeVariantState & {
	class?: RuntimeClassValue;
	className?: RuntimeClassValue;
	preset?: string;
};

type CompiledCompoundVariant = {
	matchers: readonly CompoundMatcher[];
	classValue: SlotValue<Slots, ConfigClassValue>;
};

type CompiledConfig = {
	slots: Slots;
	slotEntries: readonly [string, ConfigClassValue][];
	slotKeys: ReadonlySet<string>;
	/** Slot keys plus group names, the keys a per-slot object may hold. */
	targetKeys: ReadonlySet<string>;
	originalGroups: RuntimeGroups;
	groups: CompiledGroups;
	originalVariants: Variants<MaybeSlots>;
	normalizedVariants: NormalizedVariants;
	variantData: readonly VariantData[];
	defaultVariants: Record<string, RuntimeDefaultVariant>;
	requiredVariants: readonly string[];
	multiSlots: ReadonlySet<string>;
	presets: Record<string, ResolvedVariantState>;
	compoundVariants: readonly CompiledCompoundVariant[];
	compoundSlots: readonly CompiledCompoundSlot[];
	cache: Map<string, CacheEntry>;
	introspection: boolean;
	cacheReturn: (cacheKey: string, value: CacheEntry) => CacheEntry;
	postProcess: ((className: string) => string) | undefined;
};

type RequiredVariants<V extends MaybeVariants<MaybeSlots>> =
	| readonly StringKeyof<V>[]
	| boolean;

type RequiredVariantKeys<
	V extends MaybeVariants<MaybeSlots>,
	RV extends RequiredVariants<V>
> = RV extends true
	? StringKeyof<V>
	: RV extends readonly string[]
		? RV[number] & StringKeyof<V>
		: never;

type DefaultVariants<
	S extends MaybeSlots,
	V extends MaybeVariants<S, G>,
	RV extends RequiredVariants<V>,
	G
> = {
	[K in Exclude<
		StringKeyof<V>,
		RequiredVariantKeys<V, RV>
	>]?: DefaultVariantValue<S, V, K, G>;
};

type VariantPropsWithRequired<
	S extends MaybeSlots,
	V extends MaybeVariants<S, G>,
	RV extends RequiredVariants<V>,
	G
> = Pick<VariantPropsInternal<S, V, G>, RequiredVariantKeys<V, RV>> &
	Omit<
		PartialNullable<VariantPropsInternal<S, V, G>>,
		RequiredVariantKeys<V, RV>
	>;

type Props<
	S extends MaybeSlots,
	V extends MaybeVariants<S, G>,
	RV extends RequiredVariants<V>,
	P extends MaybePresets<S, V, G>,
	G
> = Prettify<
	P extends undefined
		? VariantPropsWithRequired<S, V, RV, G>
		: PartialNullable<VariantPropsInternal<S, V, G>> & {
				preset?: StringKeyof<P> | undefined;
			}
> &
	ClassProp<S, ClassValue, G>;

type Config<
	S extends MaybeSlots,
	V extends MaybeVariants<S, G>,
	RV extends RequiredVariants<V>,
	P extends MaybePresets<S, V, G>,
	MS extends MultiSlots<S, G>,
	I extends boolean = false,
	G extends MaybeGroups<S> = undefined
> = {
	/** Classes always applied, alongside any matched variant/compound classes. */
	base?: ConfigClassValue;
	/** Named variants, each mapping its possible values to the classes they apply. */
	variants?: V | undefined;
	/** Named slots, each with its own base classes, turning the return value into a per-slot class map. */
	slots?: S | undefined;
	/** Named sets of slots, usable anywhere a slot name is, to target several slots at once. Group names must not match a slot name. */
	groups?: G | undefined;
	/** Extra classes applied only when a specific combination of variant values matches. A `preset` name stands for the variant values it holds. */
	compoundVariants?: CompoundVariants<S, V, P, G> | undefined;
	/** Extra per-slot classes applied only when a specific combination of variant values matches. A `preset` name stands for the variant values it holds. */
	compoundSlots?: CompoundSlots<S, V, P, G> | undefined;
	/** Variant values used when the caller doesn't pass a value for that variant. */
	defaultVariants?: DefaultVariants<S, V, RV, G> | undefined;
	/** Variant keys the caller must always provide, dropping their `?` from the props type. */
	requiredVariants?: RV | undefined;
	/** Slot keys whose class function accepts variant props per call, for slots repeated across multiple elements. */
	multiSlots?: MS | undefined;
	/** Named bundles of variant values selectable by passing a single `preset` prop. Preset names must not match a variant name. */
	presets?: (P & PresetNameCollision<V, P>) | undefined;
	/** Number of distinct prop combinations whose computed classes are cached. Defaults to 256. */
	cacheSize?: number | undefined;
	/** Exposes variant metadata and cache controls as properties on the returned function. */
	introspection?: I | undefined;
	/** Transforms the final class string (or each slot's class string) before it's returned. */
	postProcess?: ((className: string) => string) | undefined;
};

type ConfigKey = keyof Config<undefined, undefined, [], undefined, false>;

type IntrospectionValues<
	S extends MaybeSlots,
	V extends MaybeVariants<S, G>,
	RV extends RequiredVariants<V>,
	P extends MaybePresets<S, V, G>,
	MS extends MultiSlots<S, G>,
	G
> = {
	/** The `variants` config passed in, as-is. */
	variants: V extends undefined ? Record<string, never> : V;
	/** Names of all declared variants. */
	variantKeys: StringKeyof<V>[];
	/** The `slots` config passed in, as-is. */
	slots: S extends undefined ? Record<string, never> : S;
	/** Names of all declared slots (including `'base'`). */
	slotKeys: SlotKey<S>[];
	/** The `groups` config passed in, as-is. */
	groups: G extends undefined ? Record<string, never> : G;
	/** Names of all declared groups. */
	groupKeys: G extends undefined ? [] : StringKeyof<G>[];
	/** The effective default variant values, after `defaultVariants` and `requiredVariants` are merged. */
	defaultVariants: DefaultVariants<S, V, RV, G>;
	/** Names of the variants the caller must always provide. */
	requiredVariants: RV extends true ? StringKeyof<V>[] : RV;
	/** The `multiSlots` config passed in, as-is. */
	multiSlots: MS extends true ? SlotKey<S>[] : MS;
	/** The `presets` config passed in, as-is. */
	presets: P extends undefined ? Record<string, never> : P;
	/** Names of all declared presets. */
	presetKeys: P extends undefined ? [] : StringKeyof<P>[];
	/** Lists every valid value for a given variant. */
	getVariantValues: V extends undefined
		? (key: never) => never[]
		: <K extends StringKeyof<V>>(key: K) => VariantPropType<V[K], S, G>[];
	/** The configured cache size (`cacheSize`, or the default of 256). */
	getMaxEntries: () => number;
	/** Empties the cache of computed class results. */
	clearCache: () => void;
	/** Current number of cached class results. */
	getCacheSize: () => number;
};

type VariantFn<
	S extends MaybeSlots,
	V extends MaybeVariants<S, G>,
	RV extends RequiredVariants<V>,
	P extends MaybePresets<S, V, G>,
	MS extends MultiSlots<S, G>,
	I extends boolean,
	G
> = {
	(
		...args: [RequiredVariantKeys<V, RV>] extends [never]
			? [props?: Prettify<Props<S, V, RV, P, G>> | undefined]
			: [props: Prettify<Props<S, V, RV, P, G>>]
	): ReturnValue<S, V, P, MS, G>;
} & (I extends true
	? Prettify<IntrospectionValues<S, V, RV, P, MS, G>>
	: unknown);

type NonConfigClassArg<T> =
	T extends Record<string, unknown>
		? Exclude<StringKeyof<T>, ConfigKey> extends never
			? never
			: T
		: T;

type MultiSlotResult = Record<
	string,
	string | ((props?: RuntimeProps) => string)
>;

// A config whose generic parameters are widened to their constraints. Used as
// the default bag for createSV(), where each call's own config drives the
// precise variant types and these defaults are merged in underneath.
type RawConfig = Config<
	MaybeSlots,
	MaybeVariants<MaybeSlots, MaybeGroups<MaybeSlots>>,
	RequiredVariants<MaybeVariants<MaybeSlots>>,
	MaybePresets<
		MaybeSlots,
		MaybeVariants<MaybeSlots, MaybeGroups<MaybeSlots>>,
		MaybeGroups<MaybeSlots>
	>,
	MultiSlots<MaybeSlots, MaybeGroups<MaybeSlots>>,
	boolean,
	MaybeGroups<MaybeSlots>
>;

/**
 * The shape of an `sv()` function. Mirrors the overloads of the exported `sv`,
 * with the introspection default `DI` baked in by `createSV()` so configs that
 * omit `introspection` inherit the factory default in their return type.
 */
export type SV<DI extends boolean = false> = {
	<
		S extends MaybeSlots = undefined,
		V extends MaybeVariants<S, G> = undefined,
		RV extends RequiredVariants<V> = false,
		P extends MaybePresets<S, V, G> = undefined,
		MS extends MultiSlots<S, G> = false,
		I extends boolean = DI,
		G extends MaybeGroups<S> = undefined
	>(
		config: Config<S, V, RV, P, MS, I, G>
	): VariantFn<S, V, RV, P, MS, I, G>;
	<
		S extends MaybeSlots = undefined,
		V extends MaybeVariants<S, G> = undefined,
		RV extends RequiredVariants<V> = false,
		P extends MaybePresets<S, V, G> = undefined,
		MS extends MultiSlots<S, G> = false,
		I extends boolean = DI,
		G extends MaybeGroups<S> = undefined
	>(
		...args: [...ClassValue[], Config<S, V, RV, P, MS, I, G>]
	): VariantFn<S, V, RV, P, MS, I, G>;
	<const T extends ClassValue[]>(
		...args: T & { [K in keyof T]: NonConfigClassArg<T[K]> }
	): string;
};

/**
 * Extracts the variant props object from an `sv()` return type
 *
 * Omits `class`, `className`, and `preset`. Pass a string literal union as `E`
 * (for Exclude) to additionally exclude specific variant keys, this is useful
 * for hiding component-internal variants from public props.
 *
 * @example
 * ```ts
 * const button = sv('btn', {
 *   variants: {
 *     size: { sm: 'text-sm', lg: 'text-lg' },
 *     intent: { primary: 'bg-blue-500', danger: 'bg-red-500' }
 *   },
 *   requiredVariants: ['intent']
 * });
 *
 * type ButtonProps = VariantProps<typeof button>;
 * // { size?: 'sm' | 'lg' | undefined; intent: 'primary' | 'danger' }
 * ```
 */
export type VariantProps<T extends AnyFn, E extends string = never> = Prettify<
	Omit<
		Exclude<Parameters<T>[0], undefined>,
		'class' | 'className' | 'preset' | E
	>
>;

/**
 * Extracts the value union for a single variant key `K` from an `sv()` return
 * type. Unlike indexing into `VariantProps`, the result never includes
 * `undefined` even when the variant is optional.
 *
 * @example
 * ```ts
 * const button = sv('btn', {
 *   variants: {
 *     size: { sm: 'text-sm', md: 'text-base', lg: 'text-lg' }
 *   }
 * });
 *
 * type Size = VariantValue<typeof button, 'size'>;
 * // 'sm' | 'md' | 'lg'
 * ```
 */
export type VariantValue<
	T extends AnyFn,
	K extends keyof VariantProps<T>
> = NonNullable<VariantProps<T>[K]>;

/**
 * Extracts the per-slot class injection shape from an `sv()` return type.
 * Resolves to `{ base?: ClassValue }` when the definition has no slots, or to
 * a partial record of `base` plus each slot key when slots are defined. Useful
 * for wrapper components that forward class overrides into specific slots.
 *
 * @example
 * ```ts
 * const card = sv('border', {
 *   slots: { header: 'font-bold', body: 'py-4' }
 * });
 *
 * type CardClassProps = SlotClassProps<typeof card>;
 * // { base?: ClassValue; header?: ClassValue; body?: ClassValue }
 *
 * const classNames: CardClassProps = { header: 'text-blue-700' };
 *
 * card({ class: classNames });
 * ```
 */
export type SlotClassProps<T extends AnyFn> =
	ReturnType<T> extends string
		? Partial<Record<'base', ClassValue>>
		: Prettify<
				Partial<
					Record<Extract<keyof ReturnType<T>, string>, ClassValue>
				>
			>;

const { isArray } = Array;
const { assign, entries, hasOwn, keys } = Object;

/**
 * Number of variant results retained by an `sv()` function when `cacheSize` is
 * not set in its config
 */
const defaultCacheSize = 256;

const looseEquals = (
	first: RuntimeVariantValue,
	second: RuntimeVariantValue | null | undefined
): boolean => first === second || `${first}` === `${second}`;

const isVariantMatcherArray = (
	value: RuntimeVariantMatcher
): value is readonly RuntimeVariantValue[] => isArray(value);

const isRuntimeVariantValue = (value: unknown): value is RuntimeVariantValue =>
	typeof value === 'string' ||
	typeof value === 'number' ||
	typeof value === 'boolean';

const createInvalidCompoundMatcherValueError = (
	variant: string,
	value: unknown
): Error =>
	new Error(
		`Compound matcher for variant "${variant}" has invalid value "${value}"`
	);

const noopCacheReturn = (_cacheKey: string, value: CacheEntry): CacheEntry =>
	value;

/** Stands in for a missing group's slots, so lookups don't allocate. */
const noSlots: readonly string[] = [];

const createCache = (
	cacheSize: number
): {
	cache: Map<string, CacheEntry>;
	cacheReturn: (cacheKey: string, value: CacheEntry) => CacheEntry;
} => {

	const cache = new Map<string, CacheEntry>();

	if (cacheSize <= 0) {
		return {
			cache,
			cacheReturn: noopCacheReturn
		};
	}

	return {
		cache,
		cacheReturn: (cacheKey, value) => {
			if (cache.size >= cacheSize) {
				for (const firstKey of cache.keys()) {
					cache.delete(firstKey);
					break;
				}
			}

			cache.set(cacheKey, value);

			return value;
		}
	};
};

const isCompoundMetaKey = (compoundKey: string): boolean =>
	compoundKey === 'class' ||
	compoundKey === 'className' ||
	compoundKey === 'slots' ||
	compoundKey === 'preset';

const resolveCompoundMatcherExpected = (
	variant: string,
	value: unknown,
	variantValues: NormalizedVariantValues
): RuntimeVariantMatcher => {

	if (isRuntimeVariantValue(value)) {
		if (!hasOwn(variantValues, `${value}`)) {
			throw createInvalidCompoundMatcherValueError(variant, value);
		}
		return value;
	}

	if (!isArray(value)) {
		throw createInvalidCompoundMatcherValueError(variant, value);
	}

	for (const item of value) {
		if (!isRuntimeVariantValue(item) || !hasOwn(variantValues, `${item}`)) {
			throw createInvalidCompoundMatcherValueError(variant, item);
		}
	}

	return value;
};

// Seeds the matcher map from a `preset` name, if the entry names one. The
// preset's values were already validated against the variants, so they only
// need to be skipped where the preset leaves a variant undefined.
const seedPresetMatchers = (
	matchers: Map<string, RuntimeVariantMatcher>,
	presets: Record<string, ResolvedVariantState>,
	preset: string | undefined
) => {

	if (preset === undefined) {
		return;
	}

	const presetValues = presets[preset];

	if (presetValues === undefined) {
		throw new Error(
			`Compound matcher references unknown preset "${preset}"`
		);
	}

	for (const [variant, value] of entries(presetValues)) {
		if (value !== undefined) {
			matchers.set(variant, value);
		}
	}
};

const compileCompoundMatchers = (
	compound: CompoundEntry,
	normalizedVariants: NormalizedVariants,
	presets: Record<string, ResolvedVariantState>
): readonly CompoundMatcher[] => {

	// Keyed by variant so a matcher written on the entry replaces the value the
	// preset seeded for that variant, matching the runtime priority of an
	// explicit prop over a preset value
	const matchers = new Map<string, RuntimeVariantMatcher>();

	seedPresetMatchers(matchers, presets, compound.preset);

	for (const [compoundKey, value] of entries(compound)) {

		if (isCompoundMetaKey(compoundKey)) {
			continue;
		}

		const variantValues = getKnownVariantValues(
			normalizedVariants,
			compoundKey,
			`Compound matcher references unknown variant "${compoundKey}"`
		);

		matchers.set(
			compoundKey,
			resolveCompoundMatcherExpected(compoundKey, value, variantValues)
		);
	}

	const result: CompoundMatcher[] = [];

	for (const [key, expected] of matchers) {
		result.push({ key, expected });
	}

	return result;
};

const matchesCompound = (
	props: ResolvedVariantState,
	matchers: readonly CompoundMatcher[]
): boolean => {

	for (const { key, expected } of matchers) {

		const propValue = props[key];

		if (isVariantMatcherArray(expected)) {
			if (!expected.some((value) => looseEquals(value, propValue))) {
				return false;
			}

			continue;
		}

		if (!looseEquals(expected, propValue)) {
			return false;
		}
	}

	return true;
};

const isObjectRecord = (
	value: RuntimeVariantConfigValue
): value is NormalizedVariantValues =>
	value !== null && typeof value === 'object' && !isArray(value);

const isSlotObjectVariantValue = (
	variantValue: NormalizedVariantValues,
	targetKeys: ReadonlySet<string>
): variantValue is Record<string, ConfigClassValue> => {

	if (targetKeys.size <= 1) {
		return false;
	}

	const valueKeys = keys(variantValue);

	return valueKeys.length > 0 && valueKeys.every((key) => targetKeys.has(key));
};

const isBooleanVariantRecord = (
	variantValue: NormalizedVariantValues
): boolean =>
	keys(variantValue).every((key) => key === 'true' || key === 'false');

const normalizeVariantValue = (
	variantValue: RuntimeVariantConfigValue,
	targetKeys: ReadonlySet<string>
): NormalizedVariantValues => {

	if (
		!isObjectRecord(variantValue) ||
		isSlotObjectVariantValue(variantValue, targetKeys)
	) {
		return {
			false: '',
			true: variantValue
		};
	}

	if (isBooleanVariantRecord(variantValue)) {
		return {
			true: '',
			false: '',
			...variantValue
		};
	}

	return variantValue;
};

const coerceVariantKeyValue = (value: string): string | number | boolean => {

	if (value === 'true') {
		return true;
	}

	if (value === 'false') {
		return false;
	}

	if (value === '') {
		return value;
	}

	const numericValue = Number(value);

	if (Number.isNaN(numericValue)) {
		return value;
	}

	return numericValue;
};

const configKeysRecord: Record<ConfigKey, true> = {
	base: true,
	variants: true,
	slots: true,
	groups: true,
	compoundVariants: true,
	compoundSlots: true,
	defaultVariants: true,
	requiredVariants: true,
	multiSlots: true,
	presets: true,
	cacheSize: true,
	postProcess: true,
	introspection: true
};

const configKeys: ReadonlySet<string> = new Set(keys(configKeysRecord));

const isConfig = <
	S extends MaybeSlots,
	V extends MaybeVariants<S, G>,
	RV extends RequiredVariants<V>,
	P extends MaybePresets<S, V, G>,
	MS extends MultiSlots<S, G>,
	I extends boolean,
	G extends MaybeGroups<S>
>(
	value: ClassValue | Config<S, V, RV, P, MS, I, G>
): value is Config<S, V, RV, P, MS, I, G> =>
	value !== null &&
	typeof value === 'object' &&
	!isArray(value) &&
	keys(value).every((key) => configKeys.has(key));

const createNormalizedVariants = <S extends MaybeSlots>(
	variants: Variants<S>,
	targetKeys: ReadonlySet<string>
): NormalizedVariants => {

	const result: NormalizedVariants = {};

	for (const [variantKey, variantValue] of entries(variants)) {
		result[variantKey] = normalizeVariantValue(variantValue, targetKeys);
	}

	return result;
};

const createVariantData = (
	normalizedVariants: NormalizedVariants
): VariantData[] =>
	entries(normalizedVariants).map(([variantKey, variantValues]) => {
		const valueIds: VariantValueIds = {};

		let nextId = 0;

		for (const valueKey of keys(variantValues)) {
			valueIds[valueKey] = nextId;
			nextId++;
		}

		return {
			key: variantKey,
			valueIds,
			values: variantValues
		};
	});

const getKnownVariantValues = (
	normalizedVariants: NormalizedVariants,
	variant: string,
	errorMessage: string
): NormalizedVariantValues => {

	const variantValues = normalizedVariants[variant];

	if (variantValues === undefined) {
		throw new Error(errorMessage);
	}

	return variantValues;
};

const resolveRequiredVariants = (
	requiredVariants: readonly string[] | boolean,
	normalizedVariants: NormalizedVariants
): readonly string[] => {

	if (requiredVariants === true) {
		return keys(normalizedVariants);
	}

	if (requiredVariants === false) {
		return [];
	}

	return requiredVariants;
};

const resolveMultiSlots = (
	multiSlots: readonly string[] | boolean,
	groups: CompiledGroups,
	slotKeys: ReadonlySet<string>
): ReadonlySet<string> => {

	if (multiSlots === true) {
		return slotKeys;
	}

	if (multiSlots === false) {
		return new Set();
	}

	return new Set(
		expandSlotTargets(multiSlots, groups, slotKeys, 'Multi slot')
	);
};

const assertValidRequiredVariantConfig = (
	requiredVariants: readonly string[],
	normalizedVariants: NormalizedVariants,
	defaultVariants: Record<string, RuntimeDefaultVariant>
) => {

	for (const variant of requiredVariants) {
		if (!hasOwn(normalizedVariants, variant)) {
			throw new Error(
				`Required variant "${variant}" is not defined in variants`
			);
		}

		if (hasOwn(defaultVariants, variant)) {
			throw new Error(
				`Required variant "${variant}" cannot have a default value`
			);
		}
	}
};

const assertKnownDefaultVariants = (
	defaultVariants: Record<string, RuntimeDefaultVariant>,
	normalizedVariants: NormalizedVariants
) => {

	for (const [variant, value] of entries(defaultVariants)) {

		const variantValues = getKnownVariantValues(
			normalizedVariants,
			variant,
			`Default variant "${variant}" is not defined in variants`
		);

		if (
			value !== undefined &&
			typeof value !== 'function' &&
			!hasOwn(variantValues, `${value}`)
		) {
			throw new Error(
				`Default variant "${variant}" has invalid value "${value}"`
			);
		}
	}
};

const assertValidPresets = (
	presets: Record<string, ResolvedVariantState>,
	normalizedVariants: NormalizedVariants
) => {

	for (const [presetName, presetValues] of entries(presets)) {

		if (hasOwn(normalizedVariants, presetName)) {
			throw new Error(
				`Preset "${presetName}" cannot have the same name as a variant`
			);
		}

		for (const [variant, value] of entries(presetValues)) {
			const variantValues = getKnownVariantValues(
				normalizedVariants,
				variant,
				`Preset "${presetName}" references unknown variant "${variant}"`
			);

			if (value !== undefined && !hasOwn(variantValues, `${value}`)) {
				throw new Error(
					`Preset "${presetName}" has invalid value "${value}" for variant "${variant}"`
				);
			}
		}
	}
};

const resolveGroups = (
	groups: RuntimeGroups,
	slotKeys: ReadonlySet<string>
): CompiledGroups => {

	const result = new Map<string, readonly string[]>();

	for (const [groupName, groupSlots] of entries(groups)) {

		if (slotKeys.has(groupName)) {
			throw new Error(
				`Group "${groupName}" cannot have the same name as a slot`
			);
		}

		if (groupSlots.length === 0) {
			throw new Error(`Group "${groupName}" must define at least one slot`);
		}

		for (const slot of groupSlots) {
			if (!slotKeys.has(slot)) {
				throw new Error(
					`Group "${groupName}" references unknown slot "${slot}"`
				);
			}
		}

		result.set(groupName, groupSlots);
	}

	return result;
};

// Flattens a list of slot names and group names into the slot names it covers,
// keeping the first occurrence of a slot reached through more than one name
const expandSlotTargets = (
	targets: readonly string[],
	groups: CompiledGroups,
	slotKeys: ReadonlySet<string>,
	label: 'Compound slot' | 'Multi slot'
): readonly string[] => {

	const result = new Set<string>();

	for (const target of targets) {

		const groupSlots = groups.get(target);

		if (groupSlots !== undefined) {
			for (const slot of groupSlots) {
				result.add(slot);
			}
			continue;
		}

		if (!slotKeys.has(target)) {
			throw new Error(`${label} references unknown slot "${target}"`);
		}

		result.add(target);
	}

	return [...result];
};

const assertNonEmptyCompoundSlots = (compoundSlots: readonly string[]) => {
	if (compoundSlots.length === 0) {
		throw new Error('Compound slot must define at least one slot');
	}
};

const requireCompoundClassValue = <T>(
	compound: { class?: T; className?: T },
	label: 'variant' | 'slot'
): T => {

	const classValue = compound.class ?? compound.className;

	if (classValue === undefined) {
		throw new Error(`Compound ${label} must define "class" or "className"`);
	}

	return classValue;
};

const hasOnlySlotKeys = (
	value:
		| Record<string, unknown>
		| Partial<Record<SlotKey<Slots>, ClassValue>>,
	targetKeys: ReadonlySet<string>
): boolean => {

	for (const key of keys(value)) {
		if (!targetKeys.has(key)) {
			return false;
		}
	}

	return true;
};

const isSlotObjectValue = <T>(
	value: SlotValue<Slots, T>,
	targetKeys: ReadonlySet<string>
): value is Partial<Record<string, T>> =>
	value !== null &&
	typeof value === 'object' &&
	!isArray(value) &&
	hasOnlySlotKeys(value, targetKeys);

// Pushes a per-slot object onto its slots. Group entries are applied before
// slot entries, so a class written for a single slot always lands after the
// one its group contributes, no matter the order the keys were written in.
const pushSlotObjectValue = (
	slotClasses: SlotClasses,
	value: Record<string, ConfigClassValue>,
	groups: CompiledGroups
) => {

	if (groups.size > 0) {
		for (const [targetKey, targetValue] of entries(value)) {

			const groupSlots = groups.get(targetKey);

			if (groupSlots !== undefined) {
				for (const slotKey of groupSlots) {
					slotClasses[slotKey]?.push(targetValue);
				}
			}
		}
	}

	for (const [targetKey, targetValue] of entries(value)) {
		if (!groups.has(targetKey)) {
			slotClasses[targetKey]?.push(targetValue);
		}
	}
};

const applyValueToSlotClasses = (
	slotClasses: SlotClasses,
	value: NormalizedVariantValue,
	targetKeys: ReadonlySet<string>,
	groups: CompiledGroups
) => {

	if (isSlotObjectValue(value, targetKeys)) {
		pushSlotObjectValue(slotClasses, value, groups);
		return;
	}

	slotClasses.base?.push(value);
};

const compileConfig = <
	S extends MaybeSlots,
	V extends MaybeVariants<S, G>,
	RV extends RequiredVariants<V>,
	P extends MaybePresets<S, V, G>,
	MS extends MultiSlots<S, G>,
	I extends boolean,
	G extends MaybeGroups<S>
>(
	baseArgs: ClassValue[],
	config: Config<S, V, RV, P, MS, I, G>
): CompiledConfig => {

	const {
		base: configBase,
		variants = {},
		slots = {},
		groups = {},
		compoundVariants = [],
		compoundSlots = [],
		defaultVariants = {},
		requiredVariants = [],
		multiSlots = false,
		presets = {},
		cacheSize = defaultCacheSize,
		postProcess,
		introspection = false
	} = config;

	const { base: baseSlot, ...otherSlots } = slots;

	const normalizedSlots: Slots = {
		base: cn(...baseArgs, configBase, baseSlot),
		...otherSlots
	};

	const { cache, cacheReturn } = createCache(cacheSize);
	const slotEntries = entries(normalizedSlots);
	const slotKeys: ReadonlySet<string> = new Set(keys(normalizedSlots));
	const resolvedGroups = resolveGroups(groups, slotKeys);

	const targetKeys: ReadonlySet<string> = new Set([
		...slotKeys,
		...resolvedGroups.keys()
	]);

	const normalizedVariants = createNormalizedVariants(variants, targetKeys);
	const variantData = createVariantData(normalizedVariants);

	const resolvedMultiSlots = resolveMultiSlots(
		multiSlots,
		resolvedGroups,
		slotKeys
	);

	const resolvedRequiredVariants = resolveRequiredVariants(
		requiredVariants,
		normalizedVariants
	);

	assertValidRequiredVariantConfig(
		resolvedRequiredVariants,
		normalizedVariants,
		defaultVariants
	);

	assertKnownDefaultVariants(defaultVariants, normalizedVariants);
	assertValidPresets(presets, normalizedVariants);

	const compiledCompoundVariants = compoundVariants.map(
		(compound): CompiledCompoundVariant => ({
			classValue: requireCompoundClassValue(compound, 'variant'),
			matchers: compileCompoundMatchers(
				compound,
				normalizedVariants,
				presets
			)
		})
	);

	const compiledCompoundSlots = compoundSlots.map(
		(compound): CompiledCompoundSlot => {
			assertNonEmptyCompoundSlots(compound.slots);
			return {
				classValue: requireCompoundClassValue(compound, 'slot'),
				matchers: compileCompoundMatchers(
					compound,
					normalizedVariants,
					presets
				),
				slots: expandSlotTargets(
					compound.slots,
					resolvedGroups,
					slotKeys,
					'Compound slot'
				)
			};
		}
	);

	return {
		slots,
		slotEntries,
		slotKeys,
		targetKeys,
		originalGroups: groups,
		groups: resolvedGroups,
		originalVariants: variants,
		normalizedVariants,
		variantData,
		defaultVariants,
		requiredVariants: resolvedRequiredVariants,
		multiSlots: resolvedMultiSlots,
		presets,
		compoundVariants: compiledCompoundVariants,
		compoundSlots: compiledCompoundSlots,
		cache,
		introspection,
		cacheReturn,
		postProcess
	};
};

const resolvePresetValues = (
	presets: Record<string, ResolvedVariantState>,
	presetName: string | undefined
): ResolvedVariantState | undefined => {

	if (presetName === undefined) {
		return undefined;
	}

	if (!hasOwn(presets, presetName)) {
		throw new Error(`Invalid preset "${presetName}"`);
	}

	return presets[presetName];
};

const resolveVariantValue = (
	defaultVariants: Record<string, RuntimeDefaultVariant>,
	variantKey: string,
	props: RuntimeVariantState,
	presetValues: ResolvedVariantState | undefined
): RuntimeVariantValue | undefined => {

	const propValue = props[variantKey];

	// `null` explicitly opts out of this variant, skipping preset/default
	if (propValue === null) {
		return undefined;
	}

	// `undefined` means the variant was not specified
	if (propValue !== undefined) {
		return propValue;
	}

	const presetValue = presetValues?.[variantKey];

	// Check if preset value is defined, it takes precedence over default value.
	if (presetValue !== undefined) {
		return presetValue;
	}

	const defaultValue = defaultVariants[variantKey];

	// Check for function default value, to evaluate it with the current props.
	if (typeof defaultValue === 'function') {
		return defaultValue(props);
	}

	return defaultValue;
};

const buildCacheKey = (
	variantData: readonly VariantData[],
	defaultVariants: Record<string, RuntimeDefaultVariant>,
	props: RuntimeProps,
	presetValues: ResolvedVariantState | undefined
): string => {

	let cacheKey = '';

	for (const { key, valueIds } of variantData) {

		const value = resolveVariantValue(
			defaultVariants,
			key,
			props,
			presetValues
		);

		if (value === undefined) {
			cacheKey += '.';
			continue;
		}

		const id = valueIds[`${value}`];

		if (id === undefined) {
			cacheKey += `.?${value}`;
		} else {
			cacheKey += `.${id}`;
		}
	}

	return cacheKey;
};

const resolveVariantState = (
	variantData: readonly VariantData[],
	defaultVariants: Record<string, RuntimeDefaultVariant>,
	props: RuntimeProps,
	presetValues: ResolvedVariantState | undefined
): ResolvedVariantState => {

	const resolvedProps: ResolvedVariantState = {};

	for (const { key } of variantData) {

		const value = resolveVariantValue(
			defaultVariants,
			key,
			props,
			presetValues
		);

		if (value !== undefined) {
			resolvedProps[key] = value;
		}
	}

	return resolvedProps;
};

const assertRequiredVariants = (
	requiredVariants: readonly string[],
	resolvedProps: ResolvedVariantState
) => {

	for (const variant of requiredVariants) {
		if (resolvedProps[variant] === undefined) {
			throw new Error(`Missing required variant: "${variant}"`);
		}
	}
};

const getVariantClasses = (
	variantKey: string,
	variantProp: RuntimeVariantValue,
	variantValues: NormalizedVariantValues
): NormalizedVariantValue => {

	const variantClasses = variantValues[`${variantProp}`];

	if (variantClasses === undefined) {
		throw new Error(
			`Invalid value "${variantProp}" for variant "${variantKey}"`
		);
	}

	return variantClasses;
};

const applyResolvedVariantClasses = (
	variantData: readonly VariantData[],
	targetKeys: ReadonlySet<string>,
	groups: CompiledGroups,
	slotClasses: SlotClasses,
	resolvedProps: ResolvedVariantState
) => {

	for (const { key, values } of variantData) {

		const variantProp = resolvedProps[key];

		if (variantProp === undefined) {
			continue;
		}

		const variantClasses = getVariantClasses(key, variantProp, values);

		if (variantClasses !== '') {
			applyValueToSlotClasses(
				slotClasses,
				variantClasses,
				targetKeys,
				groups
			);
		}
	}
};

const applyCompoundClasses = (
	compoundVariants: readonly CompiledCompoundVariant[],
	compoundSlots: readonly CompiledCompoundSlot[],
	targetKeys: ReadonlySet<string>,
	groups: CompiledGroups,
	slotClasses: SlotClasses,
	resolvedProps: ResolvedVariantState
) => {

	for (const compound of compoundVariants) {
		if (matchesCompound(resolvedProps, compound.matchers)) {
			applyValueToSlotClasses(
				slotClasses,
				compound.classValue,
				targetKeys,
				groups
			);
		}
	}

	for (const compound of compoundSlots) {
		if (matchesCompound(resolvedProps, compound.matchers)) {
			for (const slotName of compound.slots) {
				slotClasses[slotName]?.push(compound.classValue);
			}
		}
	}
};

const finalizeVariantResult = (
	slotEntries: readonly [string, ConfigClassValue][],
	slotKeys: ReadonlySet<string>,
	slotClasses: SlotClasses
): CacheValue => {

	if (slotKeys.size === 1) {
		return cn(slotClasses.base);
	}

	const result: Record<string, string> = {};

	for (const [slotKey] of slotEntries) {
		result[slotKey] = cn(slotClasses[slotKey]);
	}

	return result;
};

const applyPostProcess = (
	postProcess: ((className: string) => string) | undefined,
	value: CacheValue
): CacheValue => {

	if (postProcess === undefined) {
		return value;
	}

	if (typeof value === 'string') {
		return postProcess(value);
	}

	const result: Record<string, string> = {};

	for (const [slotKey, slotValue] of entries(value)) {
		result[slotKey] = postProcess(slotValue);
	}

	return result;
};

// Collects the values a per-slot object contributes to a single slot: every
// group holding that slot first, then the slot's own entry
const collectSlotValues = (
	value: Partial<Record<string, ClassValue>>,
	slotKey: string,
	groups: CompiledGroups
): ClassValue[] => {

	const result: ClassValue[] = [];

	for (const [targetKey, targetValue] of entries(value)) {
		if (groups.get(targetKey)?.includes(slotKey)) {
			result.push(targetValue);
		}
	}

	result.push(value[slotKey]);

	return result;
};

// Merges a per-slot object into an already computed slot map. Group entries
// are merged before slot entries, so a slot's own class always lands after the
// ones its groups contribute.
const mergeSlotObjectIntoResult = (
	baseResult: Record<string, string>,
	classProp: Partial<Record<string, ClassValue>>,
	groups: CompiledGroups
): Record<string, string> => {

	const result: Record<string, string> = { ...baseResult };

	if (groups.size > 0) {
		for (const [targetKey, targetValue] of entries(classProp)) {
			for (const slotKey of groups.get(targetKey) ?? noSlots) {
				result[slotKey] = cn(result[slotKey], targetValue);
			}
		}
	}

	for (const [targetKey, targetValue] of entries(classProp)) {
		if (!groups.has(targetKey)) {
			result[targetKey] = cn(result[targetKey], targetValue);
		}
	}

	return result;
};

const mergeClassPropIntoResult = (
	targetKeys: ReadonlySet<string>,
	groups: CompiledGroups,
	baseResult: CacheValue,
	classProp: RuntimeClassValue
): CacheValue => {

	const classPropIsSlotObject = isSlotObjectValue(classProp, targetKeys);

	if (typeof baseResult === 'string') {

		if (classPropIsSlotObject) {
			return cn(baseResult, collectSlotValues(classProp, 'base', groups));
		}

		return cn(baseResult, classProp);
	}

	if (!classPropIsSlotObject) {
		return {
			...baseResult,
			base: cn(baseResult.base, classProp)
		};
	}

	return mergeSlotObjectIntoResult(baseResult, classProp, groups);
};

const buildCacheEntry = (
	config: CompiledConfig,
	cacheKey: string,
	resolvedProps: ResolvedVariantState
): CacheEntry => {

	const {
		requiredVariants,
		slotEntries,
		slotKeys,
		targetKeys,
		groups,
		variantData,
		compoundVariants,
		compoundSlots,
		cacheReturn,
		postProcess
	} = config;

	assertRequiredVariants(requiredVariants, resolvedProps);

	const slotClasses: SlotClasses = {};

	for (const [key, value] of slotEntries) {
		slotClasses[key] = [value];
	}

	applyResolvedVariantClasses(
		variantData,
		targetKeys,
		groups,
		slotClasses,
		resolvedProps
	);

	applyCompoundClasses(
		compoundVariants,
		compoundSlots,
		targetKeys,
		groups,
		slotClasses,
		resolvedProps
	);

	const raw = finalizeVariantResult(slotEntries, slotKeys, slotClasses);
	const processed = applyPostProcess(postProcess, raw);

	return cacheReturn(cacheKey, { raw, processed });
};

const runVariant = (
	config: CompiledConfig,
	props: RuntimeProps
): CacheValue => {

	const {
		presets,
		variantData,
		defaultVariants,
		cache,
		postProcess,
		targetKeys,
		groups
	} = config;

	const classProp = props.class ?? props.className;
	const presetValues = resolvePresetValues(presets, props.preset);

	const cacheKey = buildCacheKey(
		variantData,
		defaultVariants,
		props,
		presetValues
	);

	let entry = cache.get(cacheKey);

	if (entry === undefined) {

		const resolvedProps = resolveVariantState(
			variantData,
			defaultVariants,
			props,
			presetValues
		);

		entry = buildCacheEntry(config, cacheKey, resolvedProps);
	}

	if (!classProp) {
		return entry.processed;
	}

	return applyPostProcess(
		postProcess,
		mergeClassPropIntoResult(targetKeys, groups, entry.raw, classProp)
	);
};

const mergeMultiSlotClass = (
	targetKeys: ReadonlySet<string>,
	outerClass: RuntimeClassValue | undefined,
	innerClass: RuntimeClassValue,
	slotKey: string
): RuntimeClassValue => {

	const merged: Record<string, ClassValue> = {};

	if (outerClass !== undefined && isSlotObjectValue(outerClass, targetKeys)) {
		assign(merged, outerClass);
	} else {
		merged.base = outerClass;
	}

	merged[slotKey] = cn(merged[slotKey], innerClass);

	return merged;
};

const buildSlotFn =
	(config: CompiledConfig, outerProps: RuntimeProps, slotKey: string) =>
	(innerProps: RuntimeProps = {}): string => {

		const outerClass = outerProps.class ?? outerProps.className;
		const innerClass = innerProps.class ?? innerProps.className;

		const mergedProps: RuntimeProps = { ...outerProps, ...innerProps };

		// A defined inner class takes precedence over the spread `className`
		if (innerClass !== undefined) {
			mergedProps.class = mergeMultiSlotClass(
				config.targetKeys,
				outerClass,
				innerClass,
				slotKey
			);
		}

		const result = runVariant(config, mergedProps);

		if (typeof result === 'string') {
			return result;
		}

		return cn(result[slotKey]);
	};

const applyMultiSlots = (
	config: CompiledConfig,
	props: RuntimeProps,
	result: CacheValue
): MultiSlotResult => {

	const output: MultiSlotResult = {};

	// A string result means a base-only config; reaching here implies a
	// non-empty `multiSlots`, which can only be the `base` slot.
	if (typeof result === 'string') {
		output.base = buildSlotFn(config, props, 'base');

		return output;
	}

	for (const [slotKey, slotValue] of entries(result)) {
		if (config.multiSlots.has(slotKey)) {
			output[slotKey] = buildSlotFn(config, props, slotKey);
		} else {
			output[slotKey] = slotValue;
		}
	}

	return output;
};

/**
 * Computes the number of distinct variant combinations a config can produce,
 * which is also the largest number of entries its cache can ever hold.
 *
 * Each variant contributes its value count, plus one for the unset state. The
 * unset state is dropped when the variant cannot actually be left unset — it
 * is required, or it has a static default value that always fills it in. A
 * function-based default keeps the `+ 1`, since it may return `undefined`.
 */
const countMaxEntries = (config: CompiledConfig): number => {

	const requiredVariants = new Set(config.requiredVariants);
	const { defaultVariants } = config;

	let count = 1;

	for (const { key, valueIds } of config.variantData) {

		const valueCount = keys(valueIds).length;
		const defaultValue = defaultVariants[key];
		const hasStaticDefault =
			defaultValue !== undefined && typeof defaultValue !== 'function';

		if (requiredVariants.has(key) || hasStaticDefault) {
			count *= valueCount;
		} else {
			count *= valueCount + 1;
		}
	}

	return count;
};

const runVariantResult = (
	config: CompiledConfig,
	props: RuntimeProps
): CacheValue | MultiSlotResult => {

	const result = runVariant(config, props);

	if (config.multiSlots.size === 0) {
		return result;
	}

	return applyMultiSlots(config, props, result);
};

// Wraps a compiled config in its callable form, attaching the introspection
// surface only when the config enables it. Operates on the already-compiled
// (non-generic) config so callers stay free of S/V variance concerns.
const createVariantFn = (config: CompiledConfig) => {

	const variantFn = (props: RuntimeProps = {}) =>
		runVariantResult(config, props);

	// Conditionally add introspection properties if enabled in config
	if (!config.introspection) {
		return variantFn;
	}

	return assign(variantFn, {
		variants: config.originalVariants,
		variantKeys: keys(config.normalizedVariants),
		slots: config.slots,
		slotKeys: [...config.slotKeys],
		groups: config.originalGroups,
		groupKeys: [...config.groups.keys()],
		defaultVariants: config.defaultVariants,
		requiredVariants: config.requiredVariants,
		multiSlots: [...config.multiSlots],
		presets: config.presets,
		presetKeys: keys(config.presets),
		getVariantValues: (key: string) =>
			keys(config.normalizedVariants[key] ?? {}).map(
				coerceVariantKeyValue
			),
		getMaxEntries: () => countMaxEntries(config),
		clearCache: () => config.cache.clear(),
		getCacheSize: () => config.cache.size
	});
};

/**
 * Builds a pre-configured `sv()` function whose `defaults` are applied to every
 * config-based call. The defaults accept any config option and are shallow
 * merged so a per-call value always wins; calls with no config are forwarded
 * to `cn()`-style merging untouched.
 *
 * @example
 * ```ts
 * import { twMerge } from 'tailwind-merge';
 *
 * const customSV = createSV({ postProcess: twMerge, cacheSize: 512 });
 *
 * // twMerge is applied without restating it per component
 * const button = customSV('px-4 py-2', {
 *   variants: { size: { sm: 'px-2', lg: 'px-6' } }
 * });
 * ```
 */
export const createSV = <I extends boolean = false>(
	defaults?: RawConfig & { introspection?: I | undefined }
): SV<I> => {

	const configuredSv = (...args: ClassValue[]) => {

		const last = args.at(-1);

		// Without a trailing config there is nothing to merge defaults into
		if (!isConfig(last)) {
			return cn(...args);
		}

		if (!defaults) {
			return createVariantFn(compileConfig(args.slice(0, -1), last));
		}

		return createVariantFn(
			compileConfig(args.slice(0, -1), { ...defaults, ...last })
		);
	};

	return configuredSv as unknown as SV<I>;
};

/**
 * Builds a class name string or a variant-based class name generator.
 *
 * Called with only `ClassValue` arguments, it merges them like `cn()` and
 * returns a string. Called with a single config object, or with one or more
 * `ClassValue` arguments followed by a trailing config, it returns a variant
 * function driven by that config (with optional slots support).
 *
 * @example
 * ```ts
 * // Class name merging (no config)
 * sv('flex', 'items-center', { gap: true }); // 'flex items-center gap'
 * ```
 *
 * @example
 * ```ts
 * // Config-only call
 * const button = sv({
 *   base: 'btn',
 *   variants: { size: { sm: 'text-sm', lg: 'text-lg' } }
 * });
 *
 * button({ size: 'lg' }); // 'btn text-lg'
 * ```
 *
 * @example
 * ```ts
 * // Base + config call
 * const button = sv('btn font-medium', {
 *   variants: { intent: { primary: 'bg-blue-500', danger: 'bg-red-500' } },
 *   defaultVariants: { intent: 'primary' }
 * });
 *
 * button(); // 'btn font-medium bg-blue-500'
 * ```
 *
 * @example
 * ```ts
 * // With slots
 * const card = sv('border rounded-lg', {
 *   slots: { header: 'font-bold', body: 'py-4' }
 * });
 *
 * const { base, header, body } = card();
 * ```
 */
export const sv: SV = createSV();