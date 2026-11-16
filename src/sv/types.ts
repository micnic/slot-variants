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
		? [keyof T] extends ['true' | 'false']
			? boolean
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

// Infers the keys a config's `defaultVariants` names.
type DefaultKeys<D extends string> = { [K in D]?: unknown };

// What a component records about itself for the components extending it.
type ComponentTypes = {
	slots: MaybeSlots;
	groups: RuntimeGroups | undefined;
	variants: object | undefined;
	presets: object | undefined;
	required: string;
	multi: string;
	defaulted: string;
	introspection: boolean;
};

type EmptyComponentTypes = {
	slots: undefined;
	groups: undefined;
	variants: undefined;
	presets: undefined;
	required: never;
	multi: never;
	defaulted: never;
	introspection: false;
};

type ExtendTarget = AnyFn & { readonly [componentTypes]: ComponentTypes };

export type ExtendInput = ExtendTarget | readonly ExtendTarget[];

// An `extend` value that inherits nothing.
type NoParents = undefined | readonly [];

type MergedKeys<A, B> = StringKeyof<A> | StringKeyof<B>;

type MergeSlots<A extends MaybeSlots, B extends MaybeSlots> = [A] extends [
	undefined
]
	? B
	: [B] extends [undefined]
		? A
		: Record<MergedKeys<A, B>, ConfigClassValue>;

type GroupEntry<G, K> = K extends keyof G
	? G[K] extends readonly (infer U extends string)[]
		? U
		: never
	: never;

type MergeGroups<A, B> = [A] extends [undefined]
	? B
	: [B] extends [undefined]
		? A
		: {
				[K in MergedKeys<A, B>]: readonly (
					| GroupEntry<A, K>
					| GroupEntry<B, K>
				)[];
			};

// A variant's value keys; a boolean shorthand stands for `true`.
type VariantValueKeys<T> =
	T extends Record<string | number, unknown> ? keyof T : 'true';

type MergeVariantValues<A, B> = Record<
	VariantValueKeys<A> | VariantValueKeys<B>,
	ConfigClassValue
>;

type MergeVariants<A, B> = [A] extends [undefined]
	? B
	: [B] extends [undefined]
		? A
		: {
				[K in MergedKeys<A, B>]: K extends keyof A
					? K extends keyof B
						? MergeVariantValues<A[K], B[K]>
						: A[K]
					: K extends keyof B
						? B[K]
						: never;
			};

type MergePresets<A, B> = [A] extends [undefined]
	? B
	: [B] extends [undefined]
		? A
		: Record<MergedKeys<A, B>, Record<never, never>>;

type MergeComponentTypes<A extends ComponentTypes, B extends ComponentTypes> = {
	slots: MergeSlots<A['slots'], B['slots']>;
	groups: MergeGroups<A['groups'], B['groups']>;
	variants: MergeVariants<A['variants'], B['variants']>;
	presets: MergePresets<A['presets'], B['presets']>;
	required: Exclude<A['required'], B['defaulted']> | B['required'];
	multi: A['multi'] | B['multi'];
	defaulted: A['defaulted'] | B['defaulted'];
	introspection: B['introspection'];
};

type TypesOf<T> = T extends {
	readonly [componentTypes]: infer X extends ComponentTypes;
}
	? X
	: EmptyComponentTypes;

type FoldParents<E, Acc extends ComponentTypes> = E extends readonly [
	infer H,
	...infer Rest
]
	? FoldParents<Rest, MergeComponentTypes<Acc, TypesOf<H>>>
	: Acc;

/** The merged maps of every component `E` extends, left to right. */
type ParentTypes<E> = E extends readonly unknown[]
	? FoldParents<E, EmptyComponentTypes>
	: TypesOf<E>;

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
	MaybePresets<
		ExtendedSlots<E, S>,
		ExtendedGroups<E, S, G>,
		ExtendedVariants<E, S, G, V>
	>
>;

// Inherited required variants, minus the ones this config gives a default.
type ExtendedRequired<E, S extends MaybeSlots, G, V, R, D extends string> = [
	E
] extends [NoParents]
	? R
	: readonly Extract<
			| Exclude<ParentTypes<E>['required'], D>
			| RequiredVariantKeys<
					ExtendedVariants<E, S, G, V>,
					Extract<R, RequiredVariants<ExtendedVariants<E, S, G, V>>>
			  >,
			StringKeyof<ExtendedVariants<E, S, G, V>>
		>[];

type ExtendedMultiSlots<E, S extends MaybeSlots, G, M> = [E] extends [NoParents]
	? M
	: readonly Extract<
			| ParentTypes<E>['multi']
			| MultiSlotKeys<
					ExtendedSlots<E, S>,
					ExtendedGroups<E, S, G>,
					Extract<
						M,
						MultiSlots<ExtendedSlots<E, S>, ExtendedGroups<E, S, G>>
					>
			  >,
			SlotTarget<ExtendedSlots<E, S>, ExtendedGroups<E, S, G>>
		>[];

/** A config's introspection: its own, the last parent's, or the default. */
type ExtendedIntrospection<
	E,
	I extends MaybeIntrospection,
	B extends boolean
> = [I] extends [undefined]
	? [E] extends [NoParents]
		? B
		: ParentTypes<E>['introspection']
	: Exclude<I, undefined>;

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

export type Config<
	S extends MaybeSlots,
	G extends MaybeGroups<ExtendedSlots<E, S>>,
	V extends MaybeVariants<ExtendedSlots<E, S>, ExtendedGroups<E, S, G>>,
	P extends MaybePresets<
		ExtendedSlots<E, S>,
		ExtendedGroups<E, S, G>,
		ExtendedVariants<E, S, G, V>
	>,
	M extends MultiSlots<ExtendedSlots<E, S>, ExtendedGroups<E, S, G>>,
	R extends RequiredVariants<ExtendedVariants<E, S, G, V>>,
	I extends MaybeIntrospection = false,
	E extends ExtendInput | undefined = undefined,
	D extends StringKeyof<ExtendedVariants<E, S, G, V>> = never
> = {
	/** Components whose config this one builds on, appending to theirs. */
	extend?: E;
	/** Classes always applied, alongside matched variant/compound classes. */
	base?: ConfigClassValue;
	/** Named variants, each mapping its values to the classes they apply. */
	variants?: (V & ReservedVariantCollision<V>) | undefined;
	/** Named slots with their own classes; the result becomes a slot map. */
	slots?: S | undefined;
	/** Named slot sets usable as slot names; must not reuse a slot name. */
	groups?: G | undefined;
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
				ExtendedSlots<E, S>,
				ExtendedGroups<E, S, G>,
				ExtendedVariants<E, S, G, V>,
				ExtendedPresets<E, S, G, V, P>,
				R
		  > &
				RequiredDefaultCollision<ExtendedVariants<E, S, G, V>, R> &
				DefaultKeys<D>)
		| undefined;
	/** Variants the caller must always pass, so their props lose the `?`. */
	requiredVariants?: R | undefined;
	/** Slots whose class function takes variant props, for repeated slots. */
	multiSlots?: M | undefined;
	/** Named bundles of variant values, picked with the `preset` prop. */
	presets?:
		| (P & PresetNameCollision<ExtendedVariants<E, S, G, V>, P>)
		| undefined;
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

// The call's arguments: `props` is optional unless a variant is required.
type VariantFnArgs<
	S extends MaybeSlots,
	G extends MaybeGroups<S>,
	V extends MaybeVariants<S, G>,
	P extends MaybePresets<S, G, V>,
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
type Explanation<
	S extends MaybeSlots,
	G extends MaybeGroups<S>,
	V extends MaybeVariants<S, G>
> = {
	/** Each variant's value and where it came from. */
	variants: {
		[K in StringKeyof<V>]: ExplainedVariant<VariantPropType<V[K]>>;
	};
	/** Each slot's classes, broken down by where they came from. */
	slots: Record<SlotKey<S>, ExplainedSlot<StringKeyof<V>>>;
};

type IntrospectionValues<
	S extends MaybeSlots,
	G extends MaybeGroups<S>,
	V extends MaybeVariants<S, G>,
	P extends MaybePresets<S, G, V>,
	M extends MultiSlots<S, G>,
	R extends RequiredVariants<V>
> = {
	/** Base classes: the base args, `base` and `slots.base`, merged. */
	base: string;
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
	/** The `compoundVariants` config passed in, as-is, or `[]` if unset. */
	compoundVariants: CompoundVariants<S, G, V, P>;
	/** The `compoundSlots` config passed in, as-is, or `[]` if unset. */
	compoundSlots: CompoundSlots<S, G, V, P>;
	/** Splits props into this function's own and the rest, to forward on. */
	splitProps: SplitProps<V>;
	/** Shows where each class of a call with these props came from. */
	explain: (...args: VariantFnArgs<S, G, V, P, R>) => Explanation<S, G, V>;
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
	I extends boolean,
	D extends string = never
> = {
	(...args: VariantFnArgs<S, G, V, P, R>): ReturnValue<S, G, V, P, M>;
	/** Type-only: the maps a component extending this one inherits. */
	readonly [componentTypes]: {
		slots: S;
		groups: G;
		variants: V;
		presets: P;
		required: RequiredVariantKeys<V, R>;
		multi: MultiSlotKeys<S, G, M>;
		defaulted: D;
		introspection: I;
	};
} & (I extends true ? IntrospectionValues<S, G, V, P, M, R> : unknown);

export type NonConfigClassArg<T> =
	T extends Record<string, unknown>
		? Exclude<StringKeyof<T>, ConfigKey> extends never
			? never
			: T
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
	G extends MaybeGroups<ExtendedSlots<E, S>> = undefined,
	V extends MaybeVariants<ExtendedSlots<E, S>, ExtendedGroups<E, S, G>> =
		undefined,
	P extends MaybePresets<
		ExtendedSlots<E, S>,
		ExtendedGroups<E, S, G>,
		ExtendedVariants<E, S, G, V>
	> = undefined,
	M extends MultiSlots<ExtendedSlots<E, S>, ExtendedGroups<E, S, G>> = DM,
	R extends RequiredVariants<ExtendedVariants<E, S, G, V>> = DR,
	I extends MaybeIntrospection = undefined,
	const E extends ExtendInput | undefined = undefined,
	D extends StringKeyof<ExtendedVariants<E, S, G, V>> = never
>(
	...args: [...C, Config<S, G, V, P, M, R, I, E, D>]
) => ExtendedVariantFn<S, G, V, P, M, R, I, E, D, B>;

/** The variant function a config builds, with what it inherits merged in. */
export type ExtendedVariantFn<
	S extends MaybeSlots,
	G extends MaybeGroups<ExtendedSlots<E, S>>,
	V extends MaybeVariants<ExtendedSlots<E, S>, ExtendedGroups<E, S, G>>,
	P extends MaybePresets<
		ExtendedSlots<E, S>,
		ExtendedGroups<E, S, G>,
		ExtendedVariants<E, S, G, V>
	>,
	M extends MultiSlots<ExtendedSlots<E, S>, ExtendedGroups<E, S, G>>,
	R extends RequiredVariants<ExtendedVariants<E, S, G, V>>,
	I extends MaybeIntrospection,
	E extends ExtendInput | undefined,
	D extends string,
	B extends boolean
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
	ParentTypes<E>['defaulted'] | D
>;

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