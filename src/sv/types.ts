import { type ClassValue } from '../cn.ts';

type Prettify<T> = {
	[K in keyof T]: T[K];
} & {};

type PartialNullable<T> = {
	[K in keyof T]?: T[K] | null | undefined;
};

type StringKeyof<T> = Extract<keyof T, string>;

export type ConfigClassValue = string | string[] | undefined;

// oxlint-disable-next-line typescript/no-explicit-any
export type AnyFn = (...args: any[]) => unknown;

export type RuntimeVariantValue = string | number | boolean;

export type RuntimeVariantState = Record<
	string,
	RuntimeVariantValue | null | undefined
>;

export type ResolvedVariantState = Record<
	string,
	RuntimeVariantValue | undefined
>;

/** The stringified variant values a compound matcher accepts. */
export type CompoundMatcher = ReadonlySet<string>;

type EitherClassProp<C, O extends boolean = false> = O extends true
	? { class?: C; className?: never } | { class?: never; className?: C }
	: { class: C; className?: never } | { class?: never; className: C };

export type Slots = Record<string, ConfigClassValue>;

export type MaybeSlots = Slots | undefined;

// The prop value a variant's value key stands for: a `true`/`false` key is
// matched by that boolean, any other key by itself.
type KeyValue<K> = K extends 'true' ? true : K extends 'false' ? false : K;

type SlotKey<S extends MaybeSlots> = 'base' | StringKeyof<S>;

type Groups<S extends MaybeSlots> = Record<string, readonly SlotKey<S>[]>;

export type MaybeGroups<S extends MaybeSlots> = Groups<S> | undefined;

type SlotTarget<S extends MaybeSlots, G extends MaybeGroups<S>> =
	| SlotKey<S>
	| StringKeyof<G>;

type GroupSlots<
	G extends MaybeGroups<Slots>,
	K extends string
> = K extends keyof G
	? G[K] extends readonly (infer U extends string)[]
		? U
		: never
	: never;

// `boolean` when a record's keys include `true` or `false`, so a record mixing
// either with named keys takes both booleans.
type BooleanKeys<K> = [Extract<K, 'true' | 'false'>] extends [never]
	? never
	: boolean;

// A record keyed only by `true`/`false` is a boolean. Any other record's keys
// are its values, plus both booleans when it names either one. Anything else
// is a boolean shorthand.
type VariantPropType<T> =
	T extends Record<string | number, unknown>
		? [Extract<keyof T, number>] extends [never]
			? StringKeyof<T> extends 'true' | 'false'
				? boolean
				: KeyValue<StringKeyof<T>> | BooleanKeys<StringKeyof<T>>
			:
					| KeyValue<StringKeyof<T>>
					| Extract<keyof T, number>
					| BooleanKeys<StringKeyof<T>>
		: boolean;

export type NormalizedVariantValue =
	| ConfigClassValue
	| Record<string, ConfigClassValue>;

export type NormalizedVariantValues = Record<string, NormalizedVariantValue>;

export type NormalizedVariants = Record<string, NormalizedVariantValues>;

export type VariantValueIds = ReadonlyMap<string, number>;

export type VariantData = {
	key: string;
	valueIds: VariantValueIds;
	unsetId: number;
	stride: number;
	values: NormalizedVariantValues;
	defaultValue: RuntimeDefaultVariant;
	inherited: boolean;
};

export type CacheValue = string | Record<string, string>;

export type CacheEntry = {
	raw: CacheValue;
	processed: CacheValue;
};

export type VariantCache = Map<number, CacheEntry>;

export type CacheReturn = (cacheKey: number, value: CacheEntry) => CacheEntry;

export type RuntimeDefaultVariant =
	| RuntimeVariantValue
	| ((props: RuntimeVariantState) => RuntimeVariantValue | undefined)
	| undefined;

export type SlotClasses = Record<string, ConfigClassValue[]>;

export type SlotEntry = [string, ConfigClassValue];

export type RuntimeGroups = Record<string, readonly string[]>;

export type CompiledGroups = ReadonlyMap<string, readonly string[]>;

export type CompiledCompound = {
	matchers: ReadonlyMap<string, CompoundMatcher>;
	fragments: readonly CompoundSlotFragment[];
};

export type MultiSlots<S extends MaybeSlots, G extends MaybeGroups<S>> =
	| readonly SlotTarget<S, G>[]
	| boolean;

type MultiSlotKeys<
	S extends MaybeSlots,
	G extends MaybeGroups<S>,
	M extends MultiSlots<S, G>
> = M extends true
	? SlotKey<S>
	: M extends readonly string[]
		? (M[number] & SlotKey<S>) | GroupSlots<G, M[number]>
		: never;

type SlotResult<
	S extends MaybeSlots,
	G extends MaybeGroups<S>,
	V extends MaybeVariants<S, G>,
	P extends MaybePresets<S, G, V>,
	M extends MultiSlots<S, G>
> = Prettify<{
	readonly [K in SlotKey<S>]: K extends MultiSlotKeys<S, G, M>
		? (props?: MultiSlotFnProps<S, G, V, P>) => string
		: string;
}>;

// Without slots the result is the class string, unless `multiSlots` makes
// `base` a function — then it's the same `{ base }` object a slotted config
// returns.
type ReturnValue<
	S extends MaybeSlots,
	G extends MaybeGroups<S>,
	V extends MaybeVariants<S, G>,
	P extends MaybePresets<S, G, V>,
	M extends MultiSlots<S, G>
> = S extends undefined
	? [MultiSlotKeys<S, G, M>] extends [never]
		? string
		: SlotResult<S, G, V, P, M>
	: SlotResult<S, G, V, P, M>;

type SlotRecord<S extends MaybeSlots, G extends MaybeGroups<S>, V> =
	| Partial<Record<SlotTarget<S, G>, V>>
	| V;

// Groups name targets even without `slots`, as `base` is always a slot.
export type SlotValue<
	S extends MaybeSlots,
	G extends MaybeGroups<S>,
	V
> = S extends Slots
	? SlotRecord<S, G, V>
	: [G] extends [undefined]
		? V
		: SlotRecord<S, G, V>;

type ClassProp<
	S extends MaybeSlots,
	G extends MaybeGroups<S>,
	V
> = EitherClassProp<SlotValue<S, G, V>, true>;

export type Variants<S extends MaybeSlots, G extends MaybeGroups<S>> = Record<
	string,
	| Record<string | number, SlotValue<S, G, ConfigClassValue>>
	| ConfigClassValue
>;

export type MaybeVariants<S extends MaybeSlots, G extends MaybeGroups<S>> =
	| Variants<S, G>
	| undefined;

/** Any `variants` config, for the helpers that only read its keys. */
type AnyVariants = MaybeVariants<MaybeSlots, undefined>;

type VariantConditions<
	S extends MaybeSlots,
	G extends MaybeGroups<S>,
	V extends MaybeVariants<S, G>
> = {
	[K in StringKeyof<V>]?:
		| VariantPropType<V[K]>
		| readonly [VariantPropType<V[K]>, ...VariantPropType<V[K]>[]];
};

type CompoundConditions<
	S extends MaybeSlots,
	G extends MaybeGroups<S>,
	V extends MaybeVariants<S, G>,
	P extends MaybePresets<S, G, V>
> = VariantConditions<S, G, V> & {
	preset?: (keyof P & string) | undefined;
};

type CompoundVariants<
	S extends MaybeSlots,
	G extends MaybeGroups<S>,
	V extends MaybeVariants<S, G>,
	P extends MaybePresets<S, G, V>
> = readonly (CompoundConditions<S, G, V, P> &
	EitherClassProp<SlotValue<S, G, ConfigClassValue>>)[];

type CompoundSlots<
	S extends MaybeSlots,
	G extends MaybeGroups<S>,
	V extends MaybeVariants<S, G>,
	P extends MaybePresets<S, G, V>
> = readonly ({
	slots: readonly [SlotTarget<S, G>, ...SlotTarget<S, G>[]];
} & CompoundConditions<S, G, V, P> &
	EitherClassProp<ConfigClassValue>)[];

type VariantPropsInternal<
	S extends MaybeSlots,
	G extends MaybeGroups<S>,
	V extends MaybeVariants<S, G>
> = {
	[K in StringKeyof<V>]: VariantPropType<V[K]>;
};

type PresetVariantProps<
	S extends MaybeSlots,
	G extends MaybeGroups<S>,
	V extends MaybeVariants<S, G>,
	P extends MaybePresets<S, G, V>
> = PartialNullable<VariantPropsInternal<S, G, V>> & {
	preset?: StringKeyof<P> | undefined;
};

type MultiSlotFnProps<
	S extends MaybeSlots,
	G extends MaybeGroups<S>,
	V extends MaybeVariants<S, G>,
	P extends MaybePresets<S, G, V>
> = VariantArgs<S, G, V, P, false> & EitherClassProp<ClassValue, true>;

// A function default reads the call's variant props, with a passed preset's
// values filled in where the props leave a variant unset.
type DefaultVariantFn<
	S extends MaybeSlots,
	G extends MaybeGroups<S>,
	V extends MaybeVariants<S, G>,
	P extends MaybePresets<S, G, V>,
	R extends RequiredVariants<V>,
	K extends StringKeyof<V>
> = (props: VariantArgs<S, G, V, P, R>) => VariantPropType<V[K]> | undefined;

type DefaultVariantValue<
	S extends MaybeSlots,
	G extends MaybeGroups<S>,
	V extends MaybeVariants<S, G>,
	P extends MaybePresets<S, G, V>,
	R extends RequiredVariants<V>,
	K extends StringKeyof<V>
> = VariantPropType<V[K]> | DefaultVariantFn<S, G, V, P, R, K> | undefined;

export type RuntimeClassValue = SlotValue<Slots, undefined, ClassValue>;

type Presets<
	S extends MaybeSlots,
	G extends MaybeGroups<S>,
	V extends MaybeVariants<S, G>
> = Record<string, Partial<VariantPropsInternal<S, G, V>>>;

export type MaybePresets<
	S extends MaybeSlots,
	G extends MaybeGroups<S>,
	V extends MaybeVariants<S, G>
> = Presets<S, G, V> | undefined;

type PresetNameCollision<V extends AnyVariants, P> = {
	[
		K in Extract<keyof P, StringKeyof<V>>
	]: 'Preset name must not match a variant name';
};

/** Keys a variant function or compound entry reads besides its variants. */
type ReservedVariantName = 'slots' | 'class' | 'className' | 'preset';

// A variant named like a reserved key, typed as the reason it's rejected.
type ReservedVariantCollision<V> = {
	[K in Extract<keyof V, ReservedVariantName>]: 'Variant name is reserved';
};

export type RuntimeProps = RuntimeVariantState & {
	class?: RuntimeClassValue;
	className?: RuntimeClassValue;
	preset?: string;
};

export type CompiledConfig = {
	slots: Slots;
	slotEntries: readonly SlotEntry[];
	slotKeys: ReadonlySet<string>;
	targetKeys: ReadonlySet<string>;
	originalGroups: RuntimeGroups;
	groups: CompiledGroups;
	originalVariants: Variants<MaybeSlots, undefined>;
	normalizedVariants: NormalizedVariants;
	variantData: readonly VariantData[];
	defaultVariants: Record<string, RuntimeDefaultVariant>;
	requiredVariants: readonly string[];
	multiSlots: ReadonlySet<string>;
	presets: Record<string, ResolvedVariantState>;
	compounds: readonly CompiledCompound[];
	cache: VariantCache;
	cacheable: boolean;
	maxEntries: number;
	introspection: boolean;
	cacheReturn: CacheReturn;
	postProcess: ((className: string) => string) | undefined;
};

export type RequiredVariants<V extends AnyVariants> =
	| readonly StringKeyof<V>[]
	| boolean;

type RequiredVariantKeys<
	V extends AnyVariants,
	R extends RequiredVariants<V>
> = R extends true
	? StringKeyof<V>
	: R extends readonly string[]
		? R[number] & StringKeyof<V>
		: never;

type DefaultVariants<
	S extends MaybeSlots,
	G extends MaybeGroups<S>,
	V extends MaybeVariants<S, G>,
	P extends MaybePresets<S, G, V>,
	R extends RequiredVariants<V>
> = {
	[
		K in Exclude<StringKeyof<V>, RequiredVariantKeys<V, R>>
	]?: DefaultVariantValue<S, G, V, P, R, K>;
};

// A default for a required variant, typed as the reason it's rejected: while
// the config is still being inferred, an excess key alone isn't reported.
type RequiredDefaultCollision<
	V extends AnyVariants,
	R extends RequiredVariants<V>
> = {
	[
		K in RequiredVariantKeys<V, R>
	]?: 'Required variant must not have a default';
};

type VariantPropsWithRequired<
	S extends MaybeSlots,
	G extends MaybeGroups<S>,
	V extends MaybeVariants<S, G>,
	R extends RequiredVariants<V>
> = Pick<VariantPropsInternal<S, G, V>, RequiredVariantKeys<V, R>> &
	Omit<
		PartialNullable<VariantPropsInternal<S, G, V>>,
		RequiredVariantKeys<V, R>
	>;

type VariantArgs<
	S extends MaybeSlots,
	G extends MaybeGroups<S>,
	V extends MaybeVariants<S, G>,
	P extends MaybePresets<S, G, V>,
	R extends RequiredVariants<V>
> = Prettify<
	P extends undefined
		? VariantPropsWithRequired<S, G, V, R>
		: PresetVariantProps<S, G, V, P>
>;

type Props<
	S extends MaybeSlots,
	G extends MaybeGroups<S>,
	V extends MaybeVariants<S, G>,
	P extends MaybePresets<S, G, V>,
	R extends RequiredVariants<V>
> = VariantArgs<S, G, V, P, R> & ClassProp<S, G, ClassValue>;

// The `introspection` value as written, `undefined` included, so an explicit
// `undefined` is inferred as such instead of widening to `boolean`.
export type MaybeIntrospection = boolean | undefined;

/** The introspection a config gets: its own, or the default `D` if unset. */
export type ResolvedIntrospection<
	I extends MaybeIntrospection,
	D extends boolean
> = [I] extends [undefined] ? D : Exclude<I, undefined>;

export type Config<
	S extends MaybeSlots,
	G extends MaybeGroups<S>,
	V extends MaybeVariants<S, G>,
	P extends MaybePresets<S, G, V>,
	M extends MultiSlots<S, G>,
	R extends RequiredVariants<V>,
	I extends MaybeIntrospection = false
> = {
	/** Classes always applied, alongside matched variant/compound classes. */
	base?: ConfigClassValue;
	/** Named variants, each mapping its values to the classes they apply. */
	variants?: (V & ReservedVariantCollision<V>) | undefined;
	/** Named slots with their own classes; the result becomes a slot map. */
	slots?: S | undefined;
	/** Named slot sets usable as slot names; must not reuse a slot name. */
	groups?: G | undefined;
	/** Classes for a variant combination, also matched by `preset`. */
	compoundVariants?: CompoundVariants<S, G, V, P> | undefined;
	/** Per-slot classes for a variant combination, also matched by `preset`. */
	compoundSlots?: CompoundSlots<S, G, V, P> | undefined;
	/** Variant values used when the caller doesn't pass one. */
	defaultVariants?:
		| (DefaultVariants<S, G, V, P, R> & RequiredDefaultCollision<V, R>)
		| undefined;
	/** Variants the caller must always pass, so their props lose the `?`. */
	requiredVariants?: R | undefined;
	/** Slots whose class function takes variant props, for repeated slots. */
	multiSlots?: M | undefined;
	/** Named bundles of variant values, picked with the `preset` prop. */
	presets?: (P & PresetNameCollision<V, P>) | undefined;
	/** How many prop combinations' classes are cached. Defaults to 256. */
	cacheSize?: number | undefined;
	/** Exposes variant metadata and cache controls on the returned function. */
	introspection?: I;
	/** Transforms the final class string (or each slot's) before returning. */
	postProcess?: ((className: string) => string) | undefined;
};

export type ConfigKey = keyof Config<
	undefined,
	undefined,
	undefined,
	undefined,
	false,
	[]
>;

/** Props consumed by a variant function rather than forwarded to an element. */
type VariantPropKeys<V extends AnyVariants> =
	| StringKeyof<V>
	| 'class'
	| 'className'
	| 'preset';

type SplitProps<V extends AnyVariants> = <const T extends object>(
	props: T
) => [
	Prettify<Pick<T, Extract<keyof T, VariantPropKeys<V>>>>,
	Prettify<Omit<T, VariantPropKeys<V>>>
];

type IntrospectionValues<
	S extends MaybeSlots,
	G extends MaybeGroups<S>,
	V extends MaybeVariants<S, G>,
	P extends MaybePresets<S, G, V>,
	M extends MultiSlots<S, G>,
	R extends RequiredVariants<V>
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
	/** The `defaultVariants` config passed in, as-is. */
	defaultVariants: DefaultVariants<S, G, V, P, R>;
	/** Names of the variants the caller must always provide. */
	requiredVariants: RequiredVariantKeys<V, R>[];
	/** Slots exposed as functions, with groups expanded to their slots. */
	multiSlots: MultiSlotKeys<S, G, M>[];
	/** The `presets` config passed in, as-is. */
	presets: P extends undefined ? Record<string, never> : P;
	/** Names of all declared presets. */
	presetKeys: P extends undefined ? [] : StringKeyof<P>[];
	/** Splits props into this function's own and the rest, to forward on. */
	splitProps: SplitProps<V>;
	/** Lists every valid value for a given variant. */
	getVariantValues: V extends undefined
		? (key: never) => never[]
		: <K extends StringKeyof<V>>(key: K) => VariantPropType<V[K]>[];
	/** Number of variant combinations: the most cache entries it can hold. */
	getMaxEntries: () => number;
	/** Empties the cache of computed class results. */
	clearCache: () => void;
	/** Current number of cached class results. */
	getCacheSize: () => number;
};

export type VariantFn<
	S extends MaybeSlots,
	G extends MaybeGroups<S>,
	V extends MaybeVariants<S, G>,
	P extends MaybePresets<S, G, V>,
	M extends MultiSlots<S, G>,
	R extends RequiredVariants<V>,
	I extends boolean
> = {
	(
		...args: [RequiredVariantKeys<V, R>] extends [never]
			? [props?: Prettify<Props<S, G, V, P, R>> | undefined]
			: [props: Prettify<Props<S, G, V, P, R>>]
	): ReturnValue<S, G, V, P, M>;
} & (I extends true ? IntrospectionValues<S, G, V, P, M, R> : unknown);

export type NonConfigClassArg<T> =
	T extends Record<string, unknown>
		? Exclude<StringKeyof<T>, ConfigKey> extends never
			? never
			: T
		: T;

export type RawConfig = Config<
	MaybeSlots,
	MaybeGroups<MaybeSlots>,
	MaybeVariants<MaybeSlots, MaybeGroups<MaybeSlots>>,
	MaybePresets<
		MaybeSlots,
		MaybeGroups<MaybeSlots>,
		MaybeVariants<MaybeSlots, MaybeGroups<MaybeSlots>>
	>,
	MultiSlots<MaybeSlots, MaybeGroups<MaybeSlots>>,
	RequiredVariants<AnyVariants>,
	MaybeIntrospection
>;

/**
 * The options `createSV()` applies to every config-based call. Only options
 * that a call's types can follow are accepted, so `requiredVariants` and
 * `multiSlots` take a boolean rather than a list of names.
 */
export type SVDefaults<
	I extends boolean,
	R extends boolean,
	M extends boolean
> = {
	/** Classes always applied, unless a call passes its own `base`. */
	base?: ConfigClassValue;
	/** Makes every variant required, unless a call sets its own. */
	requiredVariants?: R | undefined;
	/** Makes every slot a function, unless a call sets its own. */
	multiSlots?: M | undefined;
	/** How many prop combinations' classes are cached. Defaults to 256. */
	cacheSize?: number | undefined;
	/** Exposes variant metadata and cache controls on the returned function. */
	introspection?: I | undefined;
	/** Transforms the final class string (or each slot's) before returning. */
	postProcess?: ((className: string) => string) | undefined;
};

/**
 * An `sv()` call signature taking class args of shape `C` before a config,
 * with the factory defaults for `introspection` (`B`), `requiredVariants`
 * (`DR`) and `multiSlots` (`DM`) used when the config omits them.
 */
type ConfigCall<
	B extends boolean,
	DR extends boolean,
	DM extends boolean,
	C extends ClassValue[]
> = <
	S extends MaybeSlots = undefined,
	G extends MaybeGroups<S> = undefined,
	V extends MaybeVariants<S, G> = undefined,
	P extends MaybePresets<S, G, V> = undefined,
	M extends MultiSlots<S, G> = DM,
	R extends RequiredVariants<V> = DR,
	I extends MaybeIntrospection = undefined
>(
	...args: [...C, Config<S, G, V, P, M, R, I>]
) => VariantFn<S, G, V, P, M, R, ResolvedIntrospection<I, B>>;

type ClassCall = <const T extends ClassValue[]>(
	...args: T & { [K in keyof T]: NonConfigClassArg<T[K]> }
) => string;

/**
 * Never matches. When a call fails every overload, TypeScript reports the
 * last one's error at the offending config property only if more than three
 * overloads were tried, otherwise it flags the whole call.
 */
type UnmatchedCall = (...args: never[]) => never;

/**
 * The shape of an `sv()` function. Mirrors the overloads of the exported `sv`,
 * with the defaults for `introspection` (`D`), `requiredVariants` (`DR`) and
 * `multiSlots` (`DM`) baked in by `createSV()`, so configs that omit them
 * inherit the factory defaults in their types.
 *
 * The fixed-arity config overloads come last so an invalid config is reported
 * at the offending property rather than across the whole call.
 */
export type SV<
	D extends boolean = false,
	DR extends boolean = false,
	DM extends boolean = false
> = ConfigCall<D, DR, DM, ClassValue[]> &
	ClassCall &
	UnmatchedCall &
	ConfigCall<D, DR, DM, []> &
	ConfigCall<D, DR, DM, [ClassValue]> &
	ConfigCall<D, DR, DM, [ClassValue, ClassValue]>;

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
 * // { size?: 'sm' | 'lg' | null | undefined; intent: 'primary' | 'danger' }
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

export type RunFn = (props: RuntimeProps) => CacheValue;

// What a compound entry adds to one slot when it applies.
export type CompoundSlotFragment = { slot: number; fragment: string };