import { cn, type ClassValue } from './cn.ts';

type Prettify<T> = {
	[K in keyof T]: T[K];
} & {};

type PartialUndefined<T> = {
	[K in keyof T]?: T[K] | undefined;
};

type StringKeyof<T> = Extract<keyof T, string>;

type ConfigKey =
	| 'base'
	| 'variants'
	| 'slots'
	| 'compoundVariants'
	| 'compoundSlots'
	| 'defaultVariants'
	| 'requiredVariants'
	| 'presets'
	| 'cacheSize'
	| 'postProcess'
	| 'introspection';

type ConfigClassValue = string | string[] | undefined;

type ConfigSlotClassValue<S extends Slots | undefined> = S extends Slots
	? ConfigSlotsClassValue<S> | ConfigClassValue
	: ConfigClassValue;

type SlotClassValue<S extends Slots | undefined> = S extends Slots
	? SlotsClassValue<S> | ClassValue
	: ClassValue;

type ClassProp<S extends Slots | undefined = undefined> =
	| { class?: SlotClassValue<S>; className?: never }
	| { class?: never; className?: SlotClassValue<S> };

type ConfigClassProp<S extends Slots | undefined = undefined> =
	| { class?: ConfigSlotClassValue<S>; className?: never }
	| { class?: never; className?: ConfigSlotClassValue<S> };

type Slots = { base?: ConfigClassValue } & Record<string, ConfigClassValue>;

type BooleanString<T> = T extends `${boolean}` ? boolean : T;

type SlotKey<S extends Slots | undefined> = 'base' | StringKeyof<S>;

type SlotsClassValue<S extends Slots> = Partial<Record<SlotKey<S>, ClassValue>>;

type ConfigSlotsClassValue<S extends Slots> = Partial<
	Record<SlotKey<S>, ConfigClassValue>
>;

type Variants<S extends Slots | undefined> = Record<
	string,
	Record<string | number, ConfigSlotClassValue<S>> | ConfigSlotClassValue<S>
>;

type VariantConditions<
	S extends Slots | undefined,
	V extends Variants<S> | undefined
> = {
	[K in StringKeyof<V>]?:
		| VariantPropType<V[K], S>
		| readonly VariantPropType<V[K], S>[]
		| undefined;
};

type CompoundVariants<
	S extends Slots | undefined,
	V extends Variants<S> | undefined
> = readonly (VariantConditions<S, V> & ConfigClassProp<S>)[];

type CompoundSlots<
	S extends Slots | undefined,
	V extends Variants<S> | undefined
> = readonly ({
	slots: readonly SlotKey<S>[];
} & VariantConditions<S, V> &
	ConfigClassProp<S>)[];

type IsBooleanShorthand<T, S extends Slots | undefined> =
	T extends Record<string, unknown>
		? [Extract<keyof T, number>] extends [never]
			? S extends Slots
				? StringKeyof<T> extends SlotKey<S>
					? true
					: StringKeyof<T> extends 'true' | 'false'
						? true
						: false
				: StringKeyof<T> extends 'true' | 'false'
					? true
					: false
			: false
		: true;

type VariantPropType<T, S extends Slots | undefined> =
	IsBooleanShorthand<T, S> extends true
		? boolean
		: T extends Record<string | number, unknown>
			? BooleanString<StringKeyof<T>> | Extract<keyof T, number>
			: boolean;

type VariantPropsInternal<
	S extends Slots | undefined,
	V extends Variants<S> | undefined
> = { [K in StringKeyof<V>]: VariantPropType<V[K], S> };

type DefaultVariantFn<
	S extends Slots | undefined,
	V extends Variants<S> | undefined,
	K extends StringKeyof<V>
> = (
	props: Partial<VariantPropsInternal<S, V>>
) => VariantPropType<V[K], S> | undefined;

type DefaultVariants<
	S extends Slots | undefined,
	V extends Variants<S> | undefined,
	RV extends readonly StringKeyof<V>[]
> = {
	[K in StringKeyof<Omit<VariantPropsInternal<S, V>, RV[number]>>]?:
		| VariantPropType<V[K], S>
		| DefaultVariantFn<S, V, K>
		| undefined;
};

type ResolvedVariantValue<S extends Slots | undefined> =
	| ClassValue
	| Partial<Record<SlotKey<S>, ClassValue>>;

type NormalizedVariantValue =
	| ConfigClassValue
	| Partial<Record<string, ConfigClassValue>>;

type Presets<
	S extends Slots | undefined,
	V extends Variants<S> | undefined
> = Record<string, Partial<VariantPropsInternal<S, V>>>;

type PresetProp<P extends Record<string, unknown> | undefined> =
	P extends Record<string, unknown>
		? { preset?: StringKeyof<P> | undefined }
		: unknown;

type Props<
	S extends Slots | undefined,
	V extends Variants<S> | undefined,
	RV extends readonly StringKeyof<V>[],
	P extends Presets<S, V> | undefined
> = V extends undefined
	? ClassProp<S>
	: P extends Record<string, unknown>
		? Prettify<PartialUndefined<VariantPropsInternal<S, V>>> &
				ClassProp<S> &
				PresetProp<P>
		: Prettify<
				Pick<VariantPropsInternal<S, V>, RV[number]> &
					Omit<
						PartialUndefined<VariantPropsInternal<S, V>>,
						RV[number]
					>
			> &
				ClassProp<S>;

type Config<
	S extends Slots | undefined,
	V extends Variants<S> | undefined,
	RV extends readonly StringKeyof<V>[],
	P extends Presets<S, V> | undefined,
	I extends boolean = false
> = {
	base?: ConfigClassValue;
	variants?: V | undefined;
	slots?: S | undefined;
	compoundVariants?: CompoundVariants<S, V> | undefined;
	compoundSlots?: CompoundSlots<S, V> | undefined;
	defaultVariants?: DefaultVariants<S, V, RV> | undefined;
	requiredVariants?: RV | undefined;
	presets?: P | undefined;
	cacheSize?: number | undefined;
	postProcess?: ((className: string) => string) | undefined;
	introspection?: I | undefined;
};

type ReturnValue<S extends Slots | undefined> = S extends undefined
	? string
	: Prettify<Record<SlotKey<S>, string>>;

type ReturnFn<
	S extends Slots | undefined,
	V extends Variants<S> | undefined,
	RV extends readonly StringKeyof<V>[],
	P extends Presets<S, V> | undefined
> = RV extends readonly []
	? (props?: Props<S, V, RV, P> | undefined) => ReturnValue<S>
	: (props: Props<S, V, RV, P>) => ReturnValue<S>;

type IntrospectionValues<
	S extends Slots | undefined,
	V extends Variants<S> | undefined,
	RV extends readonly StringKeyof<V>[],
	P extends Presets<S, V> | undefined
> = {
	variants: V;
	variantKeys: StringKeyof<V>[];
	slots: S;
	slotKeys: S extends Slots ? SlotKey<S>[] : ['base'];
	defaultVariants: DefaultVariants<S, V, RV>;
	requiredVariants: RV;
	presets: P;
	presetKeys: P extends Record<string, unknown> ? StringKeyof<P>[] : [];
	getVariantValues: V extends Variants<S>
		? <K extends StringKeyof<V>>(key: K) => VariantPropType<V[K], S>[]
		: (key: never) => never[];
	clearCache: () => void;
	getCacheSize: () => number;
};

type ResultType<
	S extends Slots | undefined,
	V extends Variants<S> | undefined,
	RV extends readonly StringKeyof<V>[],
	P extends Presets<S, V> | undefined,
	I extends boolean
> = ReturnFn<S, V, RV, P> &
	(I extends true ? IntrospectionValues<S, V, RV, P> : object);

type NonConfigClassArg<T> =
	T extends Record<string, unknown>
		? Exclude<StringKeyof<T>, ConfigKey> extends never
			? never
			: T
		: T;

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
export type VariantProps<
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	T extends (...args: any[]) => unknown,
	E extends string = never
> = Prettify<
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
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	T extends (...args: any[]) => unknown,
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
export type SlotClassProps<
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	T extends (...args: any[]) => unknown
> =
	ReturnType<T> extends string
		? Partial<Record<'base', ClassValue>>
		: Prettify<
				Partial<
					Record<Extract<keyof ReturnType<T>, string>, ClassValue>
				>
			>;

const { isArray } = Array;
const { assign, entries, keys } = Object;

const configKeys = new Set([
	'base',
	'variants',
	'slots',
	'compoundVariants',
	'compoundSlots',
	'defaultVariants',
	'requiredVariants',
	'presets',
	'cacheSize',
	'postProcess',
	'introspection'
]);

/**
 * Check if a value is a Config object
 */
const isConfig = <
	S extends Slots | undefined,
	V extends Variants<S> | undefined,
	RV extends readonly StringKeyof<V>[],
	P extends Presets<S, V> | undefined,
	I extends boolean
>(
	value: ClassValue | Config<S, V, RV, P, I>
): value is Config<S, V, RV, P, I> =>
	!!value &&
	typeof value === 'object' &&
	!isArray(value) &&
	keys(value).every((key) => configKeys.has(key));

/**
 * Compare two values for equality, with string coercion fallback
 */
const looseEquals = (first: unknown, second: unknown) =>
	first === second || `${first}` === `${second}`;

/**
 * Check if a compound variant matches the given props
 */
type CacheValue = string | Record<string, string>;

const createCacheReturn =
	(cache: Map<string, CacheValue>, cacheSize: number) =>
	<T extends CacheValue>(cacheKey: string | null, value: T): T => {
		if (!cacheKey) {
			return value;
		}

		if (cache.size >= cacheSize) {
			const firstKey = cache.keys().next().value;

			if (firstKey) {
				cache.delete(firstKey);
			}
		}

		cache.set(cacheKey, value);

		return value;
	};

const compoundMatchValue = (
	compoundValue:
		| string
		| number
		| boolean
		| readonly (string | number | boolean)[]
		| undefined,
	propValue: unknown
): boolean => {
	if (isArray(compoundValue)) {
		return compoundValue.some((value) => looseEquals(value, propValue));
	}

	return looseEquals(compoundValue, propValue);
};

const isCompoundMetaKey = (compoundKey: string): boolean =>
	compoundKey === 'class' ||
	compoundKey === 'className' ||
	compoundKey === 'slots';

const matchesCompound = (
	props: Record<
		string,
		ClassValue | Partial<{ base: ClassValue } & Record<string, ClassValue>>
	>,
	compound: Record<string, unknown>
): boolean => {
	for (const compoundKey of keys(compound)) {
		if (isCompoundMetaKey(compoundKey)) {
			continue;
		}

		if (
			!compoundMatchValue(
				compound[compoundKey] as
					| string
					| number
					| boolean
					| readonly (string | number | boolean)[]
					| undefined,
				props[compoundKey]
			)
		) {
			return false;
		}
	}

	return true;
};

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
	!!value && typeof value === 'object' && !isArray(value);

const isSlotObjectVariantValue = (
	variantValue: Record<string, unknown>,
	slotKeys: Set<string>
): boolean => {
	const valueKeys = keys(variantValue);

	return (
		slotKeys.size > 0 &&
		valueKeys.length > 0 &&
		valueKeys.every((key) => key === 'base' || slotKeys.has(key))
	);
};

const isBooleanVariantRecord = (
	variantValue: Record<string, unknown>
): boolean => keys(variantValue).every((key) => key === 'true' || key === 'false');

const normalizeVariantValue = (
	variantValue: unknown,
	slotKeys: Set<string>
): Record<string, NormalizedVariantValue> => {
	if (!isObjectRecord(variantValue)) {
		return { false: '', true: variantValue as NormalizedVariantValue };
	}

	if (isSlotObjectVariantValue(variantValue, slotKeys)) {
		return {
			false: '',
			true: variantValue as Partial<Record<string, ConfigClassValue>>
		};
	}

	if (isBooleanVariantRecord(variantValue)) {
		return {
			true: '',
			false: '',
			...(variantValue as Record<string, NormalizedVariantValue>)
		};
	}

	return variantValue as Record<string, NormalizedVariantValue>;
};

const coerceBooleanVariantKey = (value: string): string | boolean => {
	if (value === 'true') {
		return true;
	}

	if (value === 'false') {
		return false;
	}

	return value;
};

const coerceVariantKeyValue = (value: string): string | number | boolean => {
	const booleanValue = coerceBooleanVariantKey(value);

	if (typeof booleanValue === 'boolean') {
		return booleanValue;
	}

	const numericValue = Number(booleanValue);

	return booleanValue !== '' && !Number.isNaN(numericValue)
		? numericValue
		: booleanValue;
};

const getConfigBaseArgs = (args: ClassValue[]): ClassValue[] =>
	args.length === 1 ? [] : args.slice(0, -1);

const resolveSvInputs = <
	S extends Slots | undefined,
	V extends Variants<S> | undefined,
	RV extends readonly StringKeyof<V>[],
	P extends Presets<S, V> | undefined,
	I extends boolean
>(
	args: (ClassValue | Config<S, V, RV, P, I>)[]
): {
	baseArgs: ClassValue[];
	config: Config<S, V, RV, P, I> | undefined;
} => {
	const lastArg = args[args.length - 1];
	const config = isConfig<S, V, RV, P, I>(lastArg) ? lastArg : undefined;

	if (config !== undefined) {
		return {
			baseArgs: getConfigBaseArgs(args as ClassValue[]),
			config
		};
	}

	return {
		baseArgs: args as ClassValue[],
		config: undefined
	};
};

const createNormalizedVariants = <S extends Slots | undefined>(
	variants: Variants<S>,
	slotKeys: Set<string>
): Record<string, Record<string, NormalizedVariantValue>> => {
	const normalizedVariants: Record<
		string,
		Record<string, NormalizedVariantValue>
	> = {};

	for (const [variantKey, variantValue] of entries(variants)) {
		normalizedVariants[variantKey] = normalizeVariantValue(
			variantValue,
			slotKeys
		);
	}

	return normalizedVariants;
};

const assertValidRequiredVariantConfig = (
	requiredVariants: readonly string[],
	variantKeys: Set<string>,
	defaultVariantKeys: Set<string>
) => {
	for (const variant of requiredVariants) {
		if (!variantKeys.has(variant)) {
			throw new Error(
				`Required variant "${variant}" is not defined in variants`
			);
		}

		if (defaultVariantKeys.has(variant)) {
			throw new Error(
				`Required variant "${variant}" cannot have a default value`
			);
		}
	}
};

const hasOnlyBaseOrSlotKeys = (
	value: object,
	slotKeys: Set<string>
): boolean => {
	for (const key of keys(value)) {
		if (key !== 'base' && !slotKeys.has(key)) {
			return false;
		}
	}

	return true;
};

const isSlotObjectValue = <S extends Slots | undefined>(
	value: ResolvedVariantValue<S>,
	slotKeys: Set<string>
): value is Partial<Record<SlotKey<S>, ClassValue>> =>
	!!value &&
	typeof value === 'object' &&
	!isArray(value) &&
	hasOnlyBaseOrSlotKeys(value, slotKeys);

const applyValueToSlotClasses = <S extends Slots | undefined>(
	slotClasses: { base: ClassValue[] } & Record<string, ClassValue[]>,
	value: ResolvedVariantValue<S>,
	slotKeys: Set<string>
) => {
	if (isSlotObjectValue(value, slotKeys)) {
		for (const [slotKey, slotValue] of entries(value)) {
			slotClasses[slotKey]?.push(slotValue);
		}
		return;
	}

	slotClasses.base.push(value);
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
export function sv<
	S extends Slots | undefined = undefined,
	V extends Variants<S> | undefined = undefined,
	RV extends readonly StringKeyof<V>[] = [],
	P extends Presets<S, V> | undefined = undefined,
	I extends boolean = false
>(config: Config<S, V, RV, P, I>): ResultType<S, V, RV, P, I>;
export function sv<
	S extends Slots | undefined = undefined,
	V extends Variants<S> | undefined = undefined,
	RV extends readonly StringKeyof<V>[] = [],
	P extends Presets<S, V> | undefined = undefined,
	I extends boolean = false
>(
	...args: [...ClassValue[], Config<S, V, RV, P, I>]
): ResultType<S, V, RV, P, I>;
export function sv<const T extends ClassValue[]>(
	...args: T & { [K in keyof T]: NonConfigClassArg<T[K]> }
): string;
export function sv<
	S extends Slots | undefined = undefined,
	V extends Variants<S> | undefined = undefined,
	RV extends readonly StringKeyof<V>[] = [],
	P extends Presets<S, V> | undefined = undefined,
	I extends boolean = false
>(
	...args: (ClassValue | Config<S, V, RV, P, I>)[]
): string | ResultType<S, V, RV, P, I> {
	const { baseArgs, config } = resolveSvInputs(args);

	// If no config provided, just return the base
	if (!config) {
		return cn(...baseArgs);
	}

	const {
		base: configBase,
		variants = {},
		slots = {},
		compoundVariants = [],
		compoundSlots = [],
		defaultVariants = {} as DefaultVariants<S, V, RV>,
		requiredVariants = [],
		presets = {},
		cacheSize = 256,
		introspection = false,
		postProcess
	} = config;

	const cache = new Map<string, CacheValue>();
	const cacheReturn = createCacheReturn(cache, cacheSize);

	const { base: baseSlot, ...otherSlots } = slots;

	const baseClassValue = cn(...baseArgs, configBase, baseSlot);
	const slotKeys = new Set(keys(otherSlots));
	const normalizedVariants = createNormalizedVariants(variants, slotKeys);

	const variantEntries = entries(normalizedVariants);
	const variantKeys = new Set(keys(normalizedVariants));
	const defaultVariantKeys = new Set(keys(defaultVariants));

	const applyPostProcess = (className: string) =>
		postProcess?.(className) ?? className;

	assertValidRequiredVariantConfig(
		requiredVariants,
		variantKeys,
		defaultVariantKeys
	);

	const presetKeys = new Set(keys(presets));

	const getPropOrPresetVariantValue = (
		variantKey: string,
		props: Props<S, V, RV, P>,
		presetValues: Record<string, ResolvedVariantValue<S>> | undefined
	): ResolvedVariantValue<S> | undefined => {
		const propValue = (
			props as Record<string, ResolvedVariantValue<S> | undefined>
		)[variantKey];

		if (propValue !== undefined) {
			return propValue;
		}

		return presetValues?.[variantKey];
	};

	const getDefaultVariantValue = (
		variantKey: string,
		props: Props<S, V, RV, P>
	): ResolvedVariantValue<S> | undefined => {
		if (!defaultVariantKeys.has(variantKey)) {
			return undefined;
		}

		const defaultValue = (
			defaultVariants as Record<
				string,
				| ResolvedVariantValue<S>
				| ((
						props: Props<S, V, RV, P>
				  ) => ResolvedVariantValue<S> | undefined)
			>
		)[variantKey];

		if (typeof defaultValue === 'function') {
			return defaultValue(props);
		}

		return defaultValue;
	};

	const resolveVariantValue = (
		variantKey: string,
		props: Props<S, V, RV, P>,
		presetValues: Record<string, ResolvedVariantValue<S>> | undefined
	): ResolvedVariantValue<S> | undefined =>
		getPropOrPresetVariantValue(variantKey, props, presetValues) ??
		getDefaultVariantValue(variantKey, props);

	const resolvePresetValues = (
		presetName: string | undefined
	): Record<string, ResolvedVariantValue<S>> | undefined => {
		if (presetName === undefined) {
			return undefined;
		}

		if (!presetKeys.has(presetName)) {
			throw new Error(`Invalid preset "${presetName}"`);
		}

		return (
			presets as Record<string, Record<string, ResolvedVariantValue<S>>>
		)[presetName];
	};

	const applyCompoundSlotsClasses = (
		slotClasses: { base: ClassValue[] } & Record<string, ClassValue[]>,
		resolvedProps: Record<string, ResolvedVariantValue<S>>
	) => {
		const applyCompoundSlotsClass = (
			compound: (typeof compoundSlots)[number]
		) => {
			const compoundClass = compound.class ?? compound.className;

			for (const slotName of compound.slots) {
				slotClasses[slotName]?.push(compoundClass as ClassValue);
			}
		};

		for (const compound of compoundSlots) {
			if (!matchesCompound(resolvedProps, compound)) {
				continue;
			}

			applyCompoundSlotsClass(compound);
		}
	};

	const applyCompoundClasses = (
		slotClasses: { base: ClassValue[] } & Record<string, ClassValue[]>,
		resolvedProps: Record<string, ResolvedVariantValue<S>>
	) => {
		for (const compound of compoundVariants) {
			if (matchesCompound(resolvedProps, compound)) {
				applyValueToSlotClasses(
					slotClasses,
					compound.class ?? compound.className,
					slotKeys
				);
			}
		}

		applyCompoundSlotsClasses(slotClasses, resolvedProps);
	};

	const getVariantClasses = (
		variantKey: string,
		variantProp: ResolvedVariantValue<S>,
		variantValues: Record<string, NormalizedVariantValue>
	): NormalizedVariantValue => {
		const variantClasses = variantValues[String(variantProp)];

		if (variantClasses === undefined) {
			throw new Error(
				`Invalid value "${variantProp}" for variant "${variantKey}"`
			);
		}

		return variantClasses;
	};

	const applyResolvedVariantClasses = (
		slotClasses: { base: ClassValue[] } & Record<string, ClassValue[]>,
		resolvedProps: Record<string, ResolvedVariantValue<S>>
	) => {
		for (const [variantKey, variantValues] of variantEntries) {
			const variantProp = resolvedProps[variantKey];

			if (variantProp === undefined) {
				continue;
			}

			const variantClasses = getVariantClasses(
				variantKey,
				variantProp,
				variantValues
			);

			if (variantClasses !== '') {
				applyValueToSlotClasses(slotClasses, variantClasses, slotKeys);
			}
		}
	};

	const resolveVariantState = (
		props: Props<S, V, RV, P>,
		presetValues: Record<string, ResolvedVariantValue<S>> | undefined,
		useCache: boolean
	): {
		cacheKey: string;
		resolvedProps: Record<string, ResolvedVariantValue<S>>;
	} => {
		const resolvedProps: Record<string, ResolvedVariantValue<S>> = {};
		let cacheKey = '';

		for (const variantKey of variantKeys) {
			const value = resolveVariantValue(variantKey, props, presetValues);

			if (value === undefined) {
				continue;
			}

			resolvedProps[variantKey] = value;

			if (useCache) {
				cacheKey += `${value};`;
			}
		}

		return { cacheKey, resolvedProps };
	};

	const getCachedResult = (
		cacheKey: string,
		useCache: boolean
	): CacheValue | undefined => (useCache ? cache.get(cacheKey) : undefined);

	const assertRequiredVariants = (
		resolvedProps: Record<string, ResolvedVariantValue<S>>
	) => {
		for (const variant of requiredVariants) {
			if (resolvedProps[variant] === undefined) {
				throw new Error(`Missing required variant: "${variant}"`);
			}
		}
	};

	const createSlotClasses = () => {
		const slotClasses: { base: ClassValue[] } & Record<
			string,
			ClassValue[]
		> = {
			base: [baseClassValue]
		};

		for (const key of slotKeys) {
			slotClasses[key] = [otherSlots[key]];
		}

		return slotClasses;
	};

	const finalizeVariantResult = (
		slotClasses: { base: ClassValue[] } & Record<string, ClassValue[]>,
		cacheKey: string
	) => {
		const result: { base: string } & Record<string, string> = {
			base: ''
		};

		for (const [slotKey, slotValues] of entries(slotClasses)) {
			result[slotKey] = applyPostProcess(cn(slotValues));
		}

		return slotKeys.size === 0
			? cacheReturn(cacheKey, result.base)
			: cacheReturn(cacheKey, result);
	};

	const variantFn = (
		props: Props<S, V, RV, P> = {} as Props<S, V, RV, P>
	) => {
		const classProp = props.class ?? props.className;
		const useCache = !classProp;
		const presetValues = resolvePresetValues(
			(props as { preset?: string }).preset
		);
		const { cacheKey, resolvedProps } = resolveVariantState(
			props,
			presetValues,
			useCache
		);
		const cacheValue = getCachedResult(cacheKey, useCache);

		if (cacheValue) {
			return cacheValue;
		}

		assertRequiredVariants(resolvedProps);

		const slotClasses = createSlotClasses();

		applyResolvedVariantClasses(slotClasses, resolvedProps);
		applyCompoundClasses(slotClasses, resolvedProps);

		if (classProp) {
			applyValueToSlotClasses(slotClasses, classProp, slotKeys);
		}

		return finalizeVariantResult(slotClasses, cacheKey);
	};

	const getVariantValues = (key: string) =>
		keys(normalizedVariants[key] ?? {}).map(coerceVariantKeyValue);

	// Skip introspection properties when disabled
	if (!introspection) {
		return variantFn as ResultType<S, V, RV, P, I>;
	}

	return assign(variantFn, {
		variants,
		variantKeys: keys(variants),
		slots,
		slotKeys: ['base', ...slotKeys],
		defaultVariants,
		requiredVariants,
		presets,
		presetKeys: keys(presets),
		getVariantValues,
		clearCache: () => cache.clear(),
		getCacheSize: () => cache.size
	}) as unknown as ResultType<S, V, RV, P, I>;
}