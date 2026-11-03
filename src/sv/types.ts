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

type BooleanString<T> = T extends `${boolean}` ? boolean : T;

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

type BooleanShorthandKeys<S extends MaybeSlots, G extends MaybeGroups<S>> =
	| (S extends Slots ? SlotTarget<S, G> : never)
	| 'true'
	| 'false';

type VariantPropType<S extends MaybeSlots, G extends MaybeGroups<S>, T> =
	T extends Record<string | number, unknown>
		? [Extract<keyof T, number>] extends [never]
			? StringKeyof<T> extends BooleanShorthandKeys<S, G>
				? boolean
				: BooleanString<StringKeyof<T>>
			: BooleanString<StringKeyof<T>> | Extract<keyof T, number>
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

type ReturnValue<
	S extends MaybeSlots,
	G extends MaybeGroups<S>,
	V extends MaybeVariants<S, G>,
	P extends MaybePresets<S, G, V>,
	M extends MultiSlots<S, G>
> = S extends undefined
	? string
	: Prettify<{
			readonly [K in SlotKey<S>]: K extends MultiSlotKeys<S, G, M>
				? (props?: MultiSlotFnProps<S, G, V, P>) => string
				: string;
		}>;

export type SlotValue<
	S extends MaybeSlots,
	G extends MaybeGroups<S>,
	V
> = S extends Slots ? Partial<Record<SlotTarget<S, G>, V>> | V : V;

type ClassProp<
	S extends MaybeSlots,
	G extends MaybeGroups<S>,
	V
> = EitherClassProp<SlotValue<S, G, V>, true>;

export type Variants<S extends MaybeSlots, G extends MaybeGroups<S>> = Record<
	string,
	| Record<string | number, SlotValue<S, G, ConfigClassValue>>
	| SlotValue<S, G, ConfigClassValue>
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
		| VariantPropType<S, G, V[K]>
		| readonly [
				VariantPropType<S, G, V[K]>,
				...VariantPropType<S, G, V[K]>[]
		  ];
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
	[K in StringKeyof<V>]: VariantPropType<S, G, V[K]>;
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
> = Prettify<
	P extends undefined
		? PartialNullable<VariantPropsInternal<S, G, V>>
		: PresetVariantProps<S, G, V, P>
> &
	EitherClassProp<ClassValue, true>;

type DefaultVariantValue<
	S extends MaybeSlots,
	G extends MaybeGroups<S>,
	V extends MaybeVariants<S, G>,
	K extends StringKeyof<V>
> =
	| VariantPropType<S, G, V[K]>
	| ((props: RuntimeVariantState) => VariantPropType<S, G, V[K]> | undefined)
	| undefined;

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
	R extends RequiredVariants<V>
> = {
	[
		K in Exclude<StringKeyof<V>, RequiredVariantKeys<V, R>>
	]?: DefaultVariantValue<S, G, V, K>;
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

type Props<
	S extends MaybeSlots,
	G extends MaybeGroups<S>,
	V extends MaybeVariants<S, G>,
	P extends MaybePresets<S, G, V>,
	R extends RequiredVariants<V>
> = Prettify<
	P extends undefined
		? VariantPropsWithRequired<S, G, V, R>
		: PresetVariantProps<S, G, V, P>
> &
	ClassProp<S, G, ClassValue>;

export type Config<
	S extends MaybeSlots,
	G extends MaybeGroups<S>,
	V extends MaybeVariants<S, G>,
	P extends MaybePresets<S, G, V>,
	M extends MultiSlots<S, G>,
	R extends RequiredVariants<V>,
	I extends boolean = false
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
	compoundVariants?: CompoundVariants<S, G, V, P> | undefined;
	/** Extra per-slot classes applied only when a specific combination of variant values matches. A `preset` name stands for the variant values it holds. */
	compoundSlots?: CompoundSlots<S, G, V, P> | undefined;
	/** Variant values used when the caller doesn't pass a value for that variant. */
	defaultVariants?: DefaultVariants<S, G, V, R> | undefined;
	/** Variant keys the caller must always provide, dropping their `?` from the props type. */
	requiredVariants?: R | undefined;
	/** Slot keys whose class function accepts variant props per call, for slots repeated across multiple elements. */
	multiSlots?: M | undefined;
	/** Named bundles of variant values selectable by passing a single `preset` prop. Preset names must not match a variant name. */
	presets?: (P & PresetNameCollision<V, P>) | undefined;
	/** Number of distinct prop combinations whose computed classes are cached. Defaults to 256. */
	cacheSize?: number | undefined;
	/** Exposes variant metadata and cache controls as properties on the returned function. */
	introspection?: I | undefined;
	/** Transforms the final class string (or each slot's class string) before it's returned. */
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
	/** The effective default variant values, after `defaultVariants` and `requiredVariants` are merged. */
	defaultVariants: DefaultVariants<S, G, V, R>;
	/** Names of the variants the caller must always provide. */
	requiredVariants: R extends true ? StringKeyof<V>[] : R;
	/** The `multiSlots` config passed in, as-is. */
	multiSlots: M extends true ? SlotKey<S>[] : M;
	/** The `presets` config passed in, as-is. */
	presets: P extends undefined ? Record<string, never> : P;
	/** Names of all declared presets. */
	presetKeys: P extends undefined ? [] : StringKeyof<P>[];
	/**
	 * Splits a props object into the props this variant function consumes
	 * (its variants plus `class`, `className` and `preset`) and everything
	 * else, which is safe to forward to an element.
	 */
	splitProps: SplitProps<V>;
	/** Lists every valid value for a given variant. */
	getVariantValues: V extends undefined
		? (key: never) => never[]
		: <K extends StringKeyof<V>>(key: K) => VariantPropType<S, G, V[K]>[];
	/** The configured cache size (`cacheSize`, or the default of 256). */
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
} & (I extends true
	? Prettify<IntrospectionValues<S, G, V, P, M, R>>
	: unknown);

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
	boolean
>;

/**
 * An `sv()` call signature taking class args of shape `C` before a config.
 */
type ConfigCall<B extends boolean, C extends ClassValue[]> = <
	S extends MaybeSlots = undefined,
	G extends MaybeGroups<S> = undefined,
	V extends MaybeVariants<S, G> = undefined,
	P extends MaybePresets<S, G, V> = undefined,
	M extends MultiSlots<S, G> = false,
	R extends RequiredVariants<V> = false,
	I extends boolean = B
>(
	...args: [...C, Config<S, G, V, P, M, R, I>]
) => VariantFn<S, G, V, P, M, R, I>;

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
 * with the introspection default `D` baked in by `createSV()` so configs that
 * omit `introspection` inherit the factory default in their return type.
 *
 * The fixed-arity config overloads come last so an invalid config is reported
 * at the offending property rather than across the whole call.
 */
export type SV<D extends boolean = false> = ConfigCall<D, ClassValue[]> &
	ClassCall &
	UnmatchedCall &
	ConfigCall<D, []> &
	ConfigCall<D, [ClassValue]> &
	ConfigCall<D, [ClassValue, ClassValue]>;

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

export type RunFn = (props: RuntimeProps) => CacheValue;

// What a compound entry adds to one slot when it applies.
export type CompoundSlotFragment = { slot: number; fragment: string };