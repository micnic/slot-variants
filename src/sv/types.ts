import { type ClassValue } from '../cn.ts';

// Keys the type-only record of a component's maps, read by `extend`.
declare const componentTypes: unique symbol;

type Prettify<T> = {
	[K in keyof T]: T[K];
} & {};

type PartialNullable<T> = {
	[K in keyof T]?: T[K] | null | undefined;
};

export type StringKeyof<T> = Extract<keyof T, string>;

// `T` when set, otherwise the fallback `F`.
type Defined<T, F> = [T] extends [undefined] ? F : Exclude<T, undefined>;

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

// A canonical numeric key (`'1'`, `'-2'`, `'1.5'`) as the number the runtime
// reads it as; never for any other key, including ones that only parse as a
// number (`'07'`, `'1e3'`).
type NumericKey<K> = K extends `${infer N extends number}`
	? number extends N
		? never
		: N
	: never;

// The prop values a variant's value key stands for: a `true`/`false` key is
// matched by that boolean, a numeric one by its number too, any other key by
// itself.
type KeyValue<K> = K extends 'true'
	? true
	: K extends 'false'
		? false
		: K | NumericKey<K>;

type SlotKey<S extends MaybeSlots> = 'base' | StringKeyof<S>;

type Groups<S extends MaybeSlots> = Record<string, readonly SlotKey<S>[]>;

export type MaybeGroups<S extends MaybeSlots> = Groups<S> | undefined;

type SlotTarget<S extends MaybeSlots, G extends MaybeGroups<S>> =
	| SlotKey<S>
	| StringKeyof<G>;

// `boolean` when a record's keys include `true` or `false`, so a record mixing
// either with named keys takes both booleans.
type BooleanKeys<K> = [Extract<K, 'true' | 'false'>] extends [never]
	? never
	: boolean;

// A record keyed only by `true`/`false` is a boolean. Any other record's keys
// are its values, a number key as its string too, plus both booleans when it
// names either one. Anything else is a boolean shorthand.
type VariantPropType<T> =
	T extends Record<string | number, unknown>
		? [keyof T] extends ['true' | 'false']
			? boolean
			:
					| KeyValue<StringKeyof<T>>
					| Extract<keyof T, number>
					| `${Extract<keyof T, number>}`
					| BooleanKeys<StringKeyof<T>>
		: boolean;

// The values `getVariantValues()` lists for a variant: its prop values, with
// a numeric key as its number only. Distributed, so each record of a union
// drops its own numeric keys' strings.
type ListedVariantValue<T> = T extends unknown
	? Exclude<
			VariantPropType<T>,
			`${NumericKey<StringKeyof<T>>}` | `${Extract<keyof T, number>}`
		>
	: never;

export type NormalizedVariantValue =
	| ConfigClassValue
	| Record<string, ConfigClassValue>;

export type NormalizedVariantValues = Record<string, NormalizedVariantValue>;

export type NormalizedVariants = Record<string, NormalizedVariantValues>;

export type VariantValueIds = ReadonlyMap<string, number>;

export type VariantData = {
	key: string;
	valueIds: VariantValueIds;
	stride: number;
	values: NormalizedVariantValues;
	defaultValue: RuntimeDefaultVariant;
	inherited: boolean;
	required: boolean;
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
		? (M[number] & SlotKey<S>) | GroupEntry<G, M[number]>
		: never;

type SlotResult<
	S extends MaybeSlots,
	G extends MaybeGroups<S>,
	V extends MaybeVariants<S, G>,
	P extends MaybePresets<V>,
	M extends MultiSlots<S, G>,
	R extends RequiredVariants<V>
> = Prettify<{
	readonly [K in SlotKey<S>]: K extends MultiSlotKeys<S, G, M>
		? (props?: MultiSlotFnProps<V, P, R>) => string
		: string;
}>;

// With no slot besides `base` the result is the class string, unless
// `multiSlots` makes `base` a function — then it's the same `{ base }` object
// a slotted config returns.
type ReturnValue<
	S extends MaybeSlots,
	G extends MaybeGroups<S>,
	V extends MaybeVariants<S, G>,
	P extends MaybePresets<V>,
	M extends MultiSlots<S, G>,
	R extends RequiredVariants<V>
> = [Exclude<StringKeyof<S>, 'base'> | MultiSlotKeys<S, G, M>] extends [never]
	? string
	: SlotResult<S, G, V, P, M, R>;

// The record form of a class value: class names mapped to conditions.
type ClassRecord = Record<string, unknown>;

// A class record names no slot or group: an object that names one is a slot
// object, whose every key has to name one.
type SlotlessClassRecord<
	S extends MaybeSlots,
	G extends MaybeGroups<S>,
	V
> = Extract<V, ClassRecord> & Partial<Record<SlotTarget<S, G>, never>>;

// A class value, or one per slot or group: `base` is always a slot, so a
// config with no `slots` takes a slot object too.
export type SlotValue<S extends MaybeSlots, G extends MaybeGroups<S>, V> =
	| Partial<Record<SlotTarget<S, G>, V>>
	| Exclude<V, ClassRecord>
	| SlotlessClassRecord<S, G, V>;

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

type VariantConditions<V extends AnyVariants> = {
	[K in StringKeyof<V>]?:
		| VariantPropType<V[K]>
		| readonly [VariantPropType<V[K]>, ...VariantPropType<V[K]>[]];
};

type CompoundConditions<
	V extends AnyVariants,
	P extends MaybePresets<V>
> = VariantConditions<V> & {
	preset?: (keyof P & string) | undefined;
};

type CompoundVariants<
	S extends MaybeSlots,
	G extends MaybeGroups<S>,
	V extends MaybeVariants<S, G>,
	P extends MaybePresets<V>
> = readonly (CompoundConditions<V, P> &
	EitherClassProp<Exclude<SlotValue<S, G, ConfigClassValue>, undefined>>)[];

type CompoundSlots<
	S extends MaybeSlots,
	G extends MaybeGroups<S>,
	V extends MaybeVariants<S, G>,
	P extends MaybePresets<V>
> = readonly ({
	slots: readonly [SlotTarget<S, G>, ...SlotTarget<S, G>[]];
} & CompoundConditions<V, P> &
	EitherClassProp<Exclude<ConfigClassValue, undefined>>)[];

type VariantPropsInternal<V extends AnyVariants> = {
	[K in StringKeyof<V>]: VariantPropType<V[K]>;
};

// Variant props where the `K` variants must be passed and the `L` ones may be
// left out but not unset with `null`, as something else gives them a value.
type VariantPropsFor<
	V extends AnyVariants,
	K extends StringKeyof<V>,
	L extends StringKeyof<V>
> = Pick<VariantPropsInternal<V>, K> & {
	[X in L]?: VariantPropsInternal<V>[X] | undefined;
} & Omit<PartialNullable<VariantPropsInternal<V>>, K | L>;

type PresetProp<P> = P extends undefined
	? unknown
	: { preset?: StringKeyof<P> | undefined };

// The entries of `T` holding a value: an `undefined` one sets nothing, even
// where `exactOptionalPropertyTypes` is off and lets it be written.
type SetValues<T> = {
	[K in keyof T as undefined extends T[K] ? never : K]: T[K];
};

type SetKeys<T> = keyof SetValues<T>;

// The props of a call naming preset `K`: the required variants it doesn't set
// still have to be passed.
type NamedPresetProps<
	V extends AnyVariants,
	P,
	R extends StringKeyof<V>,
	K extends StringKeyof<P>
> = VariantPropsFor<V, Exclude<R, SetKeys<P[K]>>, Extract<R, SetKeys<P[K]>>> & {
	preset: K;
};

// Every variant is optional when none is required. Otherwise, a call passes
// each required variant, or names a preset that sets it.
type PresetVariantProps<
	V extends AnyVariants,
	P,
	R extends RequiredVariants<V>
> = [RequiredVariantKeys<V, R>] extends [never]
	? PartialNullable<VariantPropsInternal<V>> & PresetProp<P>
	:
			| (VariantPropsFor<V, RequiredVariantKeys<V, R>, never> & {
					preset?: undefined;
			  })
			| {
					[K in StringKeyof<P>]: NamedPresetProps<
						V,
						P,
						RequiredVariantKeys<V, R>,
						K
					>;
			  }[StringKeyof<P>];

// A slot function's props: every variant is optional, as the call that made
// the result already resolved them, but a required one can't be unset.
type MultiSlotFnProps<
	V extends AnyVariants,
	P extends MaybePresets<V>,
	R extends RequiredVariants<V>
> = Prettify<
	VariantPropsFor<V, never, RequiredVariantKeys<V, R>> & PresetProp<P>
> &
	EitherClassProp<ClassValue, true>;

// A function default reads the call's variant props, with a passed preset's
// values filled in where the props leave a variant unset.
type DefaultVariantFn<
	V extends AnyVariants,
	P extends MaybePresets<V>,
	R extends RequiredVariants<V>,
	K extends StringKeyof<V>
> = (props: VariantArgs<V, P, R>) => VariantPropType<V[K]> | undefined;

type DefaultVariantValue<
	V extends AnyVariants,
	P extends MaybePresets<V>,
	R extends RequiredVariants<V>,
	K extends StringKeyof<V>
> = VariantPropType<V[K]> | DefaultVariantFn<V, P, R, K> | undefined;

export type RuntimeClassValue = SlotValue<Slots, undefined, ClassValue>;

type Presets<V extends AnyVariants> = Record<
	string,
	Partial<VariantPropsInternal<V>>
>;

export type MaybePresets<V extends AnyVariants> = Presets<V> | undefined;

type PresetNameCollision<V extends AnyVariants, P> = {
	[
		K in Extract<keyof P, StringKeyof<V>>
	]: 'Preset name must not match a variant name';
};

// The reason a preset key is rejected, an object type for the same reason as
// `UnknownSlotOrGroupName`.
type UnknownVariantName = { 'Unknown variant name': never };

// A preset naming a variant that doesn't exist, typed as the reason it's
// rejected: inferred presets skip the excess property check, and one known
// variant is enough to pass the weak type check.
type UnknownPresetVariantCollision<V extends AnyVariants, P> = {
	[N in keyof P]: {
		[X in Exclude<keyof P[N], StringKeyof<V>>]: UnknownVariantName;
	};
};

/** Keys a variant function or compound entry reads besides its variants. */
type ReservedVariantName = 'slots' | 'class' | 'className' | 'preset';

// A variant named like a reserved key, typed as the reason it's rejected.
type ReservedVariantCollision<V> = {
	[K in Extract<keyof V, ReservedVariantName>]: 'Variant name is reserved';
};

// The reason a slot object key is rejected. An object type, not a string
// literal: one clashing with the key's literal value would reduce the whole
// slot object to `never`, flagging every key and hiding the reason.
type UnknownSlotOrGroupName = { 'Unknown slot or group name': never };

// The keys of a slot object that name no slot or group, typed as the reason
// they're rejected.
type UnknownTargetKeys<T, K extends string> =
	T extends Record<string, unknown>
		? { [X in Exclude<keyof T, K>]: UnknownSlotOrGroupName }
		: unknown;

// A variant value's slot object naming no slot or group, typed as the reason
// it's rejected: inferred variants skip the excess property check, and one
// known key is enough to pass the weak type check.
type UnknownTargetCollision<V, K extends string> = {
	[N in keyof V]: V[N] extends Record<string | number, unknown>
		? { [X in keyof V[N]]: UnknownTargetKeys<V[N][X], K> }
		: unknown;
};

// A variant named like an inherited preset, typed as the reason it's
// rejected.
type InheritedPresetCollision<P, V> = {
	[
		K in Extract<keyof V, StringKeyof<P>>
	]: 'Variant name must not match a preset name';
};

// The groups that name no slot.
type EmptyGroupKeys<G> = {
	[K in keyof G]: G[K] extends readonly never[] ? K : never;
}[keyof G];

// A group named like a slot (`base` included) or naming no slot, typed as the
// reason it's rejected.
type GroupNameCollision<S extends MaybeSlots, G> = {
	[
		K in Extract<keyof G, SlotKey<S>>
	]: 'Group name must not match a slot name';
} & ([EmptyGroupKeys<G>] extends [never]
	? unknown
	: { [K in EmptyGroupKeys<G>]: 'Group must name at least one slot' });

// A slot named like an inherited group, typed as the reason it's rejected.
type InheritedGroupCollision<G, S> = {
	[
		K in Extract<keyof S, StringKeyof<G>>
	]: 'Slot name must not match a group name';
};

export type RuntimeProps = RuntimeVariantState & {
	class?: RuntimeClassValue;
	className?: RuntimeClassValue;
	preset?: string;
};

export type CompiledConfig = {
	base: string;
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
	originalCompoundVariants: RawCompoundVariants;
	originalCompoundSlots: RawCompoundSlots;
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
	V extends AnyVariants,
	P extends MaybePresets<V>,
	R extends RequiredVariants<V>
> = {
	[
		K in Exclude<StringKeyof<V>, RequiredVariantKeys<V, R>>
	]?: DefaultVariantValue<V, P, R, K>;
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

// A written default must have a value: an `undefined` one is omitted, so its
// variant would stay unset, and stay required where another layer requires
// it, while the types record it as defaulted. Mapped over the keys written
// (`D`) rather than made optional, so it holds even where
// `exactOptionalPropertyTypes` is off.
type DefinedDefaults<D extends string> = {
	[K in D]: NonNullable<unknown> | null;
};

// What a component records about itself for the components extending it.
type ComponentTypes = {
	slots: MaybeSlots;
	groups: RuntimeGroups | undefined;
	variants: object | undefined;
	presets: object | undefined;
	required: string;
	multi: string;
	defaulted: string;
	introspection: MaybeIntrospection;
};

type EmptyComponentTypes = {
	slots: undefined;
	groups: undefined;
	variants: undefined;
	presets: undefined;
	required: never;
	multi: never;
	defaulted: never;
	introspection: undefined;
};

// What a component records for the components extending it: the maps of its
// ancestors' own configs, each once and in merge order, then its own.
type ComponentLayers = readonly ComponentTypes[];

type ExtendTarget = AnyFn & { readonly [componentTypes]: ComponentLayers };

export type ExtendInput = ExtendTarget | readonly ExtendTarget[];

// An `extend` value that inherits nothing.
type NoParents = undefined | readonly [];

type MergedKeys<A, B> = StringKeyof<A> | StringKeyof<B>;

// The side that is set when the other is `undefined`, otherwise their merge
// `M`.
type MergeDefined<A, B, M> = [A] extends [undefined]
	? B
	: [B] extends [undefined]
		? A
		: M;

type MergeSlots<A extends MaybeSlots, B extends MaybeSlots> = MergeDefined<
	A,
	B,
	Record<MergedKeys<A, B>, ConfigClassValue>
>;

type GroupEntry<G, K> = K extends keyof G
	? G[K] extends readonly (infer U extends string)[]
		? U
		: never
	: never;

type MergeGroups<A, B> = MergeDefined<
	A,
	B,
	{
		[K in MergedKeys<A, B>]: readonly (
			| GroupEntry<A, K>
			| GroupEntry<B, K>
		)[];
	}
>;

// A variant's value record; a boolean shorthand stands for its `true` value.
type VariantRecordOf<T> =
	T extends Record<string | number, unknown> ? T : { true: T };

// A variant value's per-slot classes; a class value stands for `base`.
type SlotRecordOf<T> = T extends Record<string, unknown> ? T : { base: T };

// Two class values are joined, otherwise both become per-slot records whose
// shared slots are joined, as the runtime merges them.
type MergeVariantValue<A, B> = MergeDefined<
	A,
	B,
	[A | B] extends [ConfigClassValue] ? string : MergeSlotRecords<A, B>
>;

type MergeSlotRecords<A, B> = {
	[K in keyof SlotRecordOf<A> | keyof SlotRecordOf<B>]: ConfigClassValue;
};

type MergeVariantValues<A, B> = MergeRecords<
	VariantRecordOf<A>,
	VariantRecordOf<B>,
	'variant'
>;

// Keys on one side keep their value; keys on both are merged as variant
// values, or as preset values with the own ones that hold a value winning.
type MergeRecords<A, B, T extends 'variant' | 'preset'> = {
	[K in keyof A | keyof B]: K extends keyof A
		? K extends keyof B
			? T extends 'variant'
				? MergeVariantValue<A[K], B[K]>
				: Prettify<Omit<A[K], keyof SetValues<B[K]>> & SetValues<B[K]>>
			: A[K]
		: K extends keyof B
			? B[K]
			: never;
};

type MergeVariants<A, B> = MergeDefined<
	A,
	B,
	{
		[K in MergedKeys<A, B>]: K extends keyof A
			? K extends keyof B
				? MergeVariantValues<A[K], B[K]>
				: A[K]
			: K extends keyof B
				? B[K]
				: never;
	}
>;

type MergePresets<A, B> = MergeDefined<A, B, MergeRecords<A, B, 'preset'>>;

type MergeComponentTypes<A extends ComponentTypes, B extends ComponentTypes> = {
	slots: MergeSlots<A['slots'], B['slots']>;
	groups: MergeGroups<A['groups'], B['groups']>;
	variants: MergeVariants<A['variants'], B['variants']>;
	presets: MergePresets<A['presets'], B['presets']>;
	required: Exclude<A['required'], B['defaulted']> | B['required'];
	multi: A['multi'] | B['multi'];
	defaulted: A['defaulted'] | B['defaulted'];
	introspection: Defined<B['introspection'], A['introspection']>;
};

type LayersOf<T> = T extends {
	readonly [componentTypes]: infer L extends ComponentLayers;
}
	? L
	: [];

type IsSame<A, B> =
	(<X>() => X extends A ? 1 : 2) extends <X>() => X extends B ? 1 : 2
		? true
		: false;

type HasLayer<L extends ComponentLayers, H> = L extends readonly [
	infer X,
	...infer Rest extends ComponentLayers
]
	? IsSame<X, H> extends true
		? true
		: HasLayer<Rest, H>
	: false;

// The layers of `L` that `Seen` lacks. Layers are told apart by type, so two
// components with the very same config types count as one.
type NewLayers<
	L extends ComponentLayers,
	Seen extends ComponentLayers
> = L extends readonly [
	infer H extends ComponentTypes,
	...infer Rest extends ComponentLayers
]
	? HasLayer<Seen, H> extends true
		? NewLayers<Rest, Seen>
		: [H, ...NewLayers<Rest, Seen>]
	: [];

// Every parent's layers but those an earlier parent has, as the runtime
// merges a shared ancestor once, where it first appears.
type FlattenLayers<E, Seen extends ComponentLayers = []> = E extends readonly [
	infer H,
	...infer Rest
]
	? FlattenLayers<Rest, [...Seen, ...NewLayers<LayersOf<H>, Seen>]>
	: Seen;

/** The layers of every component `E` extends, left to right. */
type ParentLayers<E> = E extends readonly unknown[]
	? FlattenLayers<E>
	: LayersOf<E>;

type FoldLayers<L, Acc extends ComponentTypes> = L extends readonly [
	infer H extends ComponentTypes,
	...infer Rest
]
	? FoldLayers<Rest, MergeComponentTypes<Acc, H>>
	: Acc;

/** The merged maps of every component `E` extends, left to right. */
type ParentTypes<E> = FoldLayers<ParentLayers<E>, EmptyComponentTypes>;

// Names the parents of `extend` give two meanings: one parent's variant and
// another's preset, or one's slot and another's group.
type ParentNameClashes<T extends ComponentTypes> =
	| Extract<StringKeyof<T['variants']>, StringKeyof<T['presets']>>
	| Extract<StringKeyof<T['groups']>, SlotKey<T['slots']>>;

// Parents whose names clash, typed as the reason they're rejected.
type ParentNameCollision<E> = [ParentNameClashes<ParentTypes<E>>] extends [
	never
]
	? unknown
	: {
			[
				K in ParentNameClashes<ParentTypes<E>>
			]: 'Parents must not give a name to both a variant and a preset, or a slot and a group';
		};

/** A config's slots together with the ones it inherits. */
export type ExtendedSlots<E, S extends MaybeSlots> = Extract<
	MergeSlots<ParentTypes<E>['slots'], S>,
	MaybeSlots
>;

export type ExtendedGroups<E, S extends MaybeSlots, G> = Extract<
	MergeGroups<ParentTypes<E>['groups'], G>,
	MaybeGroups<ExtendedSlots<E, S>>
>;

export type ExtendedVariants<E, S extends MaybeSlots, G, V> = Extract<
	MergeVariants<ParentTypes<E>['variants'], V>,
	MaybeVariants<ExtendedSlots<E, S>, ExtendedGroups<E, S, G>>
>;

type ExtendedPresets<E, S extends MaybeSlots, G, V, P> = Extract<
	MergePresets<ParentTypes<E>['presets'], P>,
	MaybePresets<ExtendedVariants<E, S, G, V>>
>;

// The variants this config's own `requiredVariants` requires.
type OwnRequired<E, S extends MaybeSlots, G, V, R> = RequiredVariantKeys<
	ExtendedVariants<E, S, G, V>,
	Extract<R, RequiredVariants<ExtendedVariants<E, S, G, V>>>
>;

// The slots this config's own `multiSlots` makes functions.
type OwnMultiSlots<E, S extends MaybeSlots, G, M> = MultiSlotKeys<
	ExtendedSlots<E, S>,
	ExtendedGroups<E, S, G>,
	Extract<M, MultiSlots<ExtendedSlots<E, S>, ExtendedGroups<E, S, G>>>
>;

// Inherited required variants, minus the ones this config gives a default.
type ExtendedRequired<E, S extends MaybeSlots, G, V, R, D extends string> = [
	E
] extends [NoParents]
	? R
	: readonly Extract<
			Exclude<ParentTypes<E>['required'], D> | OwnRequired<E, S, G, V, R>,
			StringKeyof<ExtendedVariants<E, S, G, V>>
		>[];

type ExtendedMultiSlots<E, S extends MaybeSlots, G, M> = [E] extends [NoParents]
	? M
	: readonly Extract<
			ParentTypes<E>['multi'] | OwnMultiSlots<E, S, G, M>,
			SlotTarget<ExtendedSlots<E, S>, ExtendedGroups<E, S, G>>
		>[];

/**
 * A config's introspection: its own, else the last parent's that sets one,
 * else the factory default. `undefined` when none does, which turns it off.
 */
type ExtendedIntrospection<
	E,
	I extends MaybeIntrospection,
	B extends MaybeIntrospection
> = Defined<I, Defined<ParentTypes<E>['introspection'], B>>;

type VariantArgs<
	V extends AnyVariants,
	P,
	R extends RequiredVariants<V>
> = Prettify<
	P extends undefined
		? VariantPropsFor<V, RequiredVariantKeys<V, R>, never>
		: PresetVariantProps<V, P, R>
>;

type Props<
	S extends MaybeSlots,
	G extends MaybeGroups<S>,
	V extends MaybeVariants<S, G>,
	P extends MaybePresets<V>,
	R extends RequiredVariants<V>
> = VariantArgs<V, P, R> & EitherClassProp<SlotValue<S, G, ClassValue>, true>;

// The `introspection` value as written, `undefined` included, so an explicit
// `undefined` is inferred as such instead of widening to `boolean`.
export type MaybeIntrospection = boolean | undefined;

export type Config<
	S extends MaybeSlots,
	G extends MaybeGroups<ExtendedSlots<E, S>>,
	V extends MaybeVariants<ExtendedSlots<E, S>, ExtendedGroups<E, S, G>>,
	P extends MaybePresets<ExtendedVariants<E, S, G, V>>,
	M extends MultiSlots<ExtendedSlots<E, S>, ExtendedGroups<E, S, G>>,
	R extends RequiredVariants<ExtendedVariants<E, S, G, V>>,
	I extends MaybeIntrospection,
	E extends ExtendInput | undefined,
	D extends StringKeyof<ExtendedVariants<E, S, G, V>>
> = {
	/** Components whose config this one builds on, appending to theirs. */
	extend?: E & ParentNameCollision<E>;
	/** Classes always applied, alongside matched variant/compound classes. */
	base?: ConfigClassValue;
	/** Named variants, each mapping its values to the classes they apply. */
	variants?:
		| (V &
				ReservedVariantCollision<V> &
				InheritedPresetCollision<ParentTypes<E>['presets'], V> &
				UnknownTargetCollision<
					V,
					SlotTarget<ExtendedSlots<E, S>, ExtendedGroups<E, S, G>>
				>)
		| undefined;
	/** Named slots with their own classes; the result becomes a slot map. */
	slots?:
		| (S & InheritedGroupCollision<ParentTypes<E>['groups'], S>)
		| undefined;
	/** Named slot sets usable as slot names; must not reuse a slot name. */
	groups?: (G & GroupNameCollision<ExtendedSlots<E, S>, G>) | undefined;
	/** Classes for a variant combination, also matched by `preset`. */
	compoundVariants?:
		| CompoundVariants<
				ExtendedSlots<E, S>,
				ExtendedGroups<E, S, G>,
				ExtendedVariants<E, S, G, V>,
				ExtendedPresets<E, S, G, V, P>
		  >
		| undefined;
	/** Per-slot classes for a variant combination, also matched by `preset`. */
	compoundSlots?:
		| CompoundSlots<
				ExtendedSlots<E, S>,
				ExtendedGroups<E, S, G>,
				ExtendedVariants<E, S, G, V>,
				ExtendedPresets<E, S, G, V, P>
		  >
		| undefined;
	/** Variant values used when the caller doesn't pass one. */
	defaultVariants?:
		| (DefaultVariants<
				ExtendedVariants<E, S, G, V>,
				ExtendedPresets<E, S, G, V, P>,
				R
		  > &
				RequiredDefaultCollision<ExtendedVariants<E, S, G, V>, R> &
				DefinedDefaults<D>)
		| undefined;
	/** Variants the caller must always pass, so their props lose the `?`. */
	requiredVariants?: R | undefined;
	/** Slots whose class function takes variant props, for repeated slots. */
	multiSlots?: M | undefined;
	/** Named bundles of variant values, picked with the `preset` prop. */
	presets?:
		| (P &
				PresetNameCollision<ExtendedVariants<E, S, G, V>, P> &
				UnknownPresetVariantCollision<ExtendedVariants<E, S, G, V>, P>)
		| undefined;
	/** How many prop combinations' classes are cached. Defaults to 256. */
	cacheSize?: number | undefined;
	/** Exposes variant metadata and cache controls on the returned function. */
	introspection?: I;
	/** Transforms the final class string (or each slot's) before returning. */
	postProcess?: ((className: string) => string) | undefined;
};

/**
 * What makes `sv()`'s last argument its config: defining `slots` or
 * `variants`. Without either, the argument is a class value, so a config
 * overload doesn't match it.
 */
export type ConfigMarker<S, V> = [S | V] extends [undefined]
	? { variants: object }
	: unknown;

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

// The call's arguments: `props` is optional unless a variant is required.
type VariantFnArgs<
	S extends MaybeSlots,
	G extends MaybeGroups<S>,
	V extends MaybeVariants<S, G>,
	P extends MaybePresets<V>,
	R extends RequiredVariants<V>
> = [RequiredVariantKeys<V, R>] extends [never]
	? [props?: Prettify<Props<S, G, V, P, R>> | undefined]
	: [props: Prettify<Props<S, G, V, P, R>>];

/** Where an explained variant value came from. */
export type VariantSource = 'prop' | 'preset' | 'default' | 'unset';

/** A variant's value in an explained call, and where it came from. */
export type ExplainedVariant<T> = {
	/** The value the call used, or `undefined` if the variant was unset. */
	value: T | undefined;
	/** Whether the value was passed, came from the preset or the defaults. */
	from: VariantSource;
};

/** A compound entry that matched an explained call. */
export type ExplainedCompound = {
	/** The config array the entry is in. */
	kind: 'compoundVariants' | 'compoundSlots';
	/** The entry's position in that array. */
	index: number;
	/** The classes the entry added to the slot. */
	class: string;
};

/** Where each class of one slot came from in an explained call. */
export type ExplainedSlot<K extends string> = {
	/** The slot's own classes. */
	base: string;
	/** The classes each variant added, for variants that added any. */
	variants: Partial<Record<K, string>>;
	/** The matched compound entries that added classes, in config order. */
	compounds: ExplainedCompound[];
	/** The classes the call's `class`/`className` added. */
	class: string;
	/** All of the slot's classes, before `postProcess`. */
	raw: string;
	/** The slot's classes as the call returns them. */
	result: string;
	/** Classes in `raw` that `postProcess` removed from `result`. */
	dropped: string[];
};

/** Where every class of a call came from, as returned by `explain()`. */
type Explanation<S extends MaybeSlots, V extends AnyVariants> = {
	/** Each variant's value and where it came from. */
	variants: {
		[K in StringKeyof<V>]: ExplainedVariant<VariantPropType<V[K]>>;
	};
	/** Each slot's classes, broken down by where they came from. */
	slots: Record<SlotKey<S>, ExplainedSlot<StringKeyof<V>>>;
};

// A config map as passed in, or an empty record when it's unset.
type ConfigOrEmpty<T> = T extends undefined ? Record<string, never> : T;

// The names a config map declares, or an empty tuple when it's unset.
type KeysOrEmpty<T> = T extends undefined ? [] : StringKeyof<T>[];

type IntrospectionValues<
	S extends MaybeSlots,
	G extends MaybeGroups<S>,
	V extends MaybeVariants<S, G>,
	P extends MaybePresets<V>,
	M extends MultiSlots<S, G>,
	R extends RequiredVariants<V>
> = {
	/** Base classes: the base args, `base` and `slots.base`, merged. */
	base: string;
	/** The `variants` config passed in, as-is. */
	variants: ConfigOrEmpty<V>;
	/** Names of all declared variants. */
	variantKeys: StringKeyof<V>[];
	/** The `slots` config passed in, as-is. */
	slots: ConfigOrEmpty<S>;
	/** Names of all declared slots (including `'base'`). */
	slotKeys: SlotKey<S>[];
	/** The `groups` config passed in, as-is. */
	groups: ConfigOrEmpty<G>;
	/** Names of all declared groups. */
	groupKeys: KeysOrEmpty<G>;
	/** The `defaultVariants` config passed in, as-is. */
	defaultVariants: DefaultVariants<V, P, R>;
	/** Names of the variants the caller must always provide. */
	requiredVariants: RequiredVariantKeys<V, R>[];
	/** Slots exposed as functions, with groups expanded to their slots. */
	multiSlots: MultiSlotKeys<S, G, M>[];
	/** The `presets` config passed in, as-is. */
	presets: ConfigOrEmpty<P>;
	/** Names of all declared presets. */
	presetKeys: KeysOrEmpty<P>;
	/** The `compoundVariants` config passed in, as-is, or `[]` if unset. */
	compoundVariants: CompoundVariants<S, G, V, P>;
	/** The `compoundSlots` config passed in, as-is, or `[]` if unset. */
	compoundSlots: CompoundSlots<S, G, V, P>;
	/** Splits props into this function's own and the rest, to forward on. */
	splitProps: SplitProps<V>;
	/** Shows where each class of a call with these props came from. */
	explain: (...args: VariantFnArgs<S, G, V, P, R>) => Explanation<S, V>;
	/** Lists every valid value for a given variant. */
	getVariantValues: V extends undefined
		? (key: never) => never[]
		: <K extends StringKeyof<V>>(key: K) => ListedVariantValue<V[K]>[];
	/** Number of variant combinations: the most cache entries it can hold. */
	getMaxEntries: () => number;
	/** Empties the cache of computed class results. */
	clearCache: () => void;
	/** Current number of cached class results. */
	getCacheSize: () => number;
};

type VariantFn<
	S extends MaybeSlots,
	G extends MaybeGroups<S>,
	V extends MaybeVariants<S, G>,
	P extends MaybePresets<V>,
	M extends MultiSlots<S, G>,
	R extends RequiredVariants<V>,
	I extends MaybeIntrospection,
	L extends ComponentLayers
> = {
	(...args: VariantFnArgs<S, G, V, P, R>): ReturnValue<S, G, V, P, M, R>;
	/** Type-only: the layers a component extending this one merges. */
	readonly [componentTypes]: L;
} & (I extends true ? IntrospectionValues<S, G, V, P, M, R> : unknown);

// A class value `sv()` takes: a record naming `slots` or `variants` would be
// read as a config, so it's rejected. A record typed with an index signature
// names no key, so it's taken.
export type NonConfigClassArg<T> =
	T extends Record<string, unknown>
		? [Extract<keyof T, 'slots' | 'variants'>] extends [never]
			? T
			: never
		: T;

// The widest config the runtime handles, every name typed as a string.
type RuntimeVariants = Variants<Slots, RuntimeGroups>;

type RuntimePresets = Record<string, ResolvedVariantState>;

export type RawConfig = {
	extend?: ExtendInput | undefined;
	base?: ConfigClassValue;
	variants?: RuntimeVariants | undefined;
	slots?: Slots | undefined;
	groups?: RuntimeGroups | undefined;
	compoundVariants?:
		| CompoundVariants<
				Slots,
				RuntimeGroups,
				RuntimeVariants,
				RuntimePresets
		  >
		| undefined;
	compoundSlots?:
		| CompoundSlots<Slots, RuntimeGroups, RuntimeVariants, RuntimePresets>
		| undefined;
	defaultVariants?: Record<string, RuntimeDefaultVariant> | undefined;
	requiredVariants?: RequiredVariants<RuntimeVariants> | undefined;
	multiSlots?: MultiSlots<Slots, RuntimeGroups> | undefined;
	presets?: RuntimePresets | undefined;
	cacheSize?: number | undefined;
	introspection?: MaybeIntrospection;
	postProcess?: ((className: string) => string) | undefined;
};

type RawCompoundVariants = NonNullable<RawConfig['compoundVariants']>;

type RawCompoundSlots = NonNullable<RawConfig['compoundSlots']>;

/**
 * The options `createSV()` applies to every config-based call. Only options
 * that a call's types can follow are accepted, so `requiredVariants` and
 * `multiSlots` take a boolean rather than a list of names.
 */
export type SVDefaults<
	I extends MaybeIntrospection,
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
	B extends MaybeIntrospection,
	DR extends boolean,
	DM extends boolean,
	C extends ClassValue[]
> = <
	S extends MaybeSlots = undefined,
	G extends MaybeGroups<ExtendedSlots<E, S>> = undefined,
	V extends MaybeVariants<ExtendedSlots<E, S>, ExtendedGroups<E, S, G>> =
		undefined,
	P extends MaybePresets<ExtendedVariants<E, S, G, V>> = undefined,
	M extends MultiSlots<ExtendedSlots<E, S>, ExtendedGroups<E, S, G>> = DM,
	R extends RequiredVariants<ExtendedVariants<E, S, G, V>> = DR,
	I extends MaybeIntrospection = undefined,
	const E extends ExtendInput | undefined = undefined,
	D extends StringKeyof<ExtendedVariants<E, S, G, V>> = never
>(
	...args: [...C, Config<S, G, V, P, M, R, I, E, D> & ConfigMarker<S, V>]
) => ExtendedVariantFn<S, G, V, P, M, R, I, E, D, B>;

/** The variant function a config builds, with what it inherits merged in. */
export type ExtendedVariantFn<
	S extends MaybeSlots,
	G extends MaybeGroups<ExtendedSlots<E, S>>,
	V extends MaybeVariants<ExtendedSlots<E, S>, ExtendedGroups<E, S, G>>,
	P extends MaybePresets<ExtendedVariants<E, S, G, V>>,
	M extends MultiSlots<ExtendedSlots<E, S>, ExtendedGroups<E, S, G>>,
	R extends RequiredVariants<ExtendedVariants<E, S, G, V>>,
	I extends MaybeIntrospection,
	E extends ExtendInput | undefined,
	D extends string,
	B extends MaybeIntrospection
> = VariantFn<
	ExtendedSlots<E, S>,
	ExtendedGroups<E, S, G>,
	ExtendedVariants<E, S, G, V>,
	ExtendedPresets<E, S, G, V, P>,
	Extract<
		ExtendedMultiSlots<E, S, G, M>,
		MultiSlots<ExtendedSlots<E, S>, ExtendedGroups<E, S, G>>
	>,
	Extract<
		ExtendedRequired<E, S, G, V, R, D>,
		RequiredVariants<ExtendedVariants<E, S, G, V>>
	>,
	ExtendedIntrospection<E, I, B>,
	ExtendedLayers<E, S, G, V, P, M, R, D, ExtendedIntrospection<E, I, B>>
>;

// The layers a config's variant function records: the ones it extends, then
// its own maps, its required variants and multi slots resolved to what they
// cover now, as the runtime records them.
type ExtendedLayers<
	E,
	S extends MaybeSlots,
	G,
	V,
	P,
	M,
	R,
	D extends string,
	I extends MaybeIntrospection
> = [
	...ParentLayers<E>,
	{
		slots: S;
		groups: G;
		variants: V;
		presets: P;
		required: OwnRequired<E, S, G, V, R>;
		multi: OwnMultiSlots<E, S, G, M>;
		defaulted: D;
		introspection: I;
	}
];

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
	D extends MaybeIntrospection = undefined,
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
		// The props naming a preset are left out with `preset` itself, so a
		// required variant one sets stays required
		Exclude<Parameters<T>[0], undefined | { preset: string }>,
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

// The keys a `class` slot object takes: `base` and each slot, plus each group,
// inherited ones included.
type SlotClassKey<T extends AnyFn> =
	| (ReturnType<T> extends string
			? 'base'
			: Extract<keyof ReturnType<T>, string>)
	| StringKeyof<ParentTypes<T>['groups']>;

/**
 * Extracts the per-slot class injection shape from an `sv()` return type: a
 * partial record of `base`, each slot and each group. Resolves to
 * `{ base?: ClassValue }` when the definition has no slots or groups. Useful
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
export type SlotClassProps<T extends AnyFn> = Prettify<
	Partial<Record<SlotClassKey<T>, ClassValue>>
>;

export type RunFn = (props: RuntimeProps) => CacheValue;

// What a compound entry adds to one slot when it applies.
export type CompoundSlotFragment = { slot: number; fragment: string };