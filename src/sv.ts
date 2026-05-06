import { cn, type ClassValue } from './cn.ts';

type Prettify<T> = {
	[K in keyof T]: T[K];
} & {};

type PartialUndefined<T> = {
	[K in keyof T]?: T[K] | undefined;
};

type StringKeyof<T> = Extract<keyof T, string>;

type ConfigClassValue = string | string[] | undefined;

type SlotValue<S extends Slots | undefined, V> = S extends Slots
	? Partial<Record<SlotKey<S>, V>> | V
	: V;

type ConfigSlotClassValue<S extends Slots | undefined> = SlotValue<
	S,
	ConfigClassValue
>;

type XorClass<V> =
	| { class?: V; className?: never }
	| { class?: never; className?: V };

type ClassProp<S extends Slots | undefined = undefined> = XorClass<
	SlotValue<S, ClassValue>
>;

type ConfigClassProp<S extends Slots | undefined = undefined> = XorClass<
	ConfigSlotClassValue<S>
>;

type Slots = { base?: ConfigClassValue } & Record<string, ConfigClassValue>;

type BooleanString<T> = T extends `${boolean}` ? boolean : T;

type SlotKey<S extends Slots | undefined> = 'base' | StringKeyof<S>;

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

type BooleanShorthandKeys<S extends Slots | undefined> = S extends Slots
	? SlotKey<S> | 'true' | 'false'
	: 'true' | 'false';

type VariantPropType<T, S extends Slots | undefined> =
	T extends Record<string | number, unknown>
		? [Extract<keyof T, number>] extends [never]
			? StringKeyof<T> extends BooleanShorthandKeys<S>
				? boolean
				: BooleanString<StringKeyof<T>>
			: BooleanString<StringKeyof<T>> | Extract<keyof T, number>
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
	[K in Exclude<StringKeyof<V>, RV[number]>]?:
		| VariantPropType<V[K], S>
		| DefaultVariantFn<S, V, K>
		| undefined;
};

type ResolvedVariantValue<S extends Slots | undefined> =
	| ClassValue
	| Partial<Record<SlotKey<S>, ClassValue>>;

type NormalizedVariantValue =
	| ConfigClassValue
	| Record<string, ConfigClassValue>;

type Presets<
	S extends Slots | undefined,
	V extends Variants<S> | undefined
> = Record<string, Partial<VariantPropsInternal<S, V>>>;

type PresetProp<
	S extends Slots | undefined,
	V extends Variants<S> | undefined,
	P extends Presets<S, V> | undefined
> = P extends undefined
	? { preset?: undefined }
	: { preset?: StringKeyof<P> | undefined };

type Props<
	S extends Slots | undefined,
	V extends Variants<S> | undefined,
	RV extends readonly StringKeyof<V>[],
	P extends Presets<S, V> | undefined
> = (P extends undefined
	? Prettify<
			Pick<VariantPropsInternal<S, V>, RV[number]> &
				Omit<PartialUndefined<VariantPropsInternal<S, V>>, RV[number]>
		>
	: Prettify<PartialUndefined<VariantPropsInternal<S, V>>>) &
	ClassProp<S> &
	PresetProp<S, V, P>;

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
	introspection?: I | undefined;
	postProcess?: ((className: string) => string) | undefined;
};

type ConfigKey = keyof Config<undefined, undefined, [], undefined>;

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
	props: Record<string, ResolvedVariantValue<Slots>>,
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
	value !== null && typeof value === 'object' && !isArray(value);

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
): boolean =>
	keys(variantValue).every((key) => key === 'true' || key === 'false');

const normalizeVariantValue = (
	variantValue: unknown,
	slotKeys: Set<string>
): Record<string, NormalizedVariantValue> => {

	if (!isObjectRecord(variantValue)) {
		return {
			false: '',
			true: variantValue as NormalizedVariantValue
		};
	}

	if (isSlotObjectVariantValue(variantValue, slotKeys)) {
		return {
			false: '',
			true: variantValue as Record<string, ConfigClassValue>
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

const configKeysRecord: Record<ConfigKey, true> = {
	base: true,
	variants: true,
	slots: true,
	compoundVariants: true,
	compoundSlots: true,
	defaultVariants: true,
	requiredVariants: true,
	presets: true,
	cacheSize: true,
	postProcess: true,
	introspection: true
};

const configKeys = new Set(keys(configKeysRecord) as ConfigKey[]);

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
	value !== null &&
	typeof value === 'object' &&
	!isArray(value) &&
	keys(value).every((key) => (configKeys as Set<string>).has(key));

const resolveSVInputs = <
	S extends Slots | undefined,
	V extends Variants<S> | undefined,
	RV extends readonly StringKeyof<V>[],
	P extends Presets<S, V> | undefined,
	I extends boolean
>(
	args: (ClassValue | Config<S, V, RV, P, I>)[]
): {
	baseArgs: ClassValue[];
	config: CompiledConfig | undefined;
} => {

	const last = args.at(-1);

	if (isConfig<S, V, RV, P, I>(last)) {

		const baseArgs = args.slice(0, -1) as ClassValue[];
		const config = compileConfig(baseArgs, last);

		return {
			baseArgs,
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

const isSlotObjectValue = (
	value: ResolvedVariantValue<Slots>,
	slotKeys: Set<string>
): value is Partial<Record<string, ClassValue>> =>
	value !== null &&
	typeof value === 'object' &&
	!isArray(value) &&
	hasOnlyBaseOrSlotKeys(value, slotKeys);

const applyValueToSlotClasses = (
	slotClasses: SlotClasses,
	value: ResolvedVariantValue<Slots>,
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

type SlotClasses = { base: ClassValue[] } & Record<string, ClassValue[]>;

type CompiledConfig = {
	baseClassValue: ClassValue;
	slots: Slots;
	otherSlots: Record<string, ConfigClassValue>;
	slotKeys: Set<string>;
	normalizedVariants: Record<string, Record<string, NormalizedVariantValue>>;
	variantEntries: [string, Record<string, NormalizedVariantValue>][];
	variantKeys: Set<string>;
	defaultVariants: Record<string, unknown>;
	defaultVariantKeys: Set<string>;
	requiredVariants: readonly string[];
	presets: Record<string, Record<string, ResolvedVariantValue<Slots>>>;
	presetKeys: Set<string>;
	compoundVariants: readonly Record<string, unknown>[];
	compoundSlots: readonly ({
		slots: readonly string[];
	} & Record<string, unknown>)[];
	cache: Map<string, CacheValue>;
	introspection: boolean;
	cacheReturn: <T extends CacheValue>(cacheKey: string | null, value: T) => T;
	postProcess: (className: string) => string;
};

const compileConfig = <
	S extends Slots | undefined,
	V extends Variants<S> | undefined,
	RV extends readonly StringKeyof<V>[],
	P extends Presets<S, V> | undefined,
	I extends boolean
>(
	baseArgs: ClassValue[],
	config: Config<S, V, RV, P, I>
): CompiledConfig => {

	const {
		base: configBase,
		variants = {},
		slots = {} as Slots,
		compoundVariants = [],
		compoundSlots = [],
		defaultVariants = {} as DefaultVariants<S, V, RV>,
		requiredVariants = [],
		presets = {},
		cacheSize = 256,
		postProcess,
		introspection = false
	} = config;

	const cache = new Map<string, CacheValue>();
	const cacheReturn = createCacheReturn(cache, cacheSize);
	const { base: baseSlot, ...otherSlots } = slots;
	const baseClassValue = cn(...baseArgs, configBase, baseSlot);
	const slotKeys = new Set(keys(otherSlots));
	const normalizedVariants = createNormalizedVariants(variants, slotKeys);
	const variantKeys = new Set(keys(normalizedVariants));
	const defaultVariantKeys = new Set(keys(defaultVariants));

	assertValidRequiredVariantConfig(
		requiredVariants,
		variantKeys,
		defaultVariantKeys
	);

	return {
		baseClassValue,
		slots,
		otherSlots,
		slotKeys,
		normalizedVariants,
		variantEntries: entries(normalizedVariants),
		variantKeys,
		defaultVariants,
		defaultVariantKeys,
		requiredVariants,
		presets,
		presetKeys: new Set(keys(presets)),
		compoundVariants,
		compoundSlots,
		cache,
		introspection,
		cacheReturn,
		postProcess: postProcess ?? ((className) => className)
	};
};

const resolvePresetValues = (
	config: CompiledConfig,
	presetName: string | undefined
): Record<string, ResolvedVariantValue<Slots>> | undefined => {

	if (presetName === undefined) {
		return undefined;
	}

	if (!config.presetKeys.has(presetName)) {
		throw new Error(`Invalid preset "${presetName}"`);
	}

	return config.presets[presetName];
};

const resolveVariantValue = (
	config: CompiledConfig,
	variantKey: string,
	props: Record<string, unknown>,
	presetValues: Record<string, ResolvedVariantValue<Slots>> | undefined
): ResolvedVariantValue<Slots> | undefined => {

	const propValue = props[variantKey];

	if (propValue !== undefined) {
		return propValue;
	}

	const presetValue = presetValues?.[variantKey];

	if (presetValue !== undefined) {
		return presetValue;
	}

	if (!config.defaultVariantKeys.has(variantKey)) {
		return undefined;
	}

	const defaultValue = config.defaultVariants[variantKey];

	if (typeof defaultValue === 'function') {
		return (
			defaultValue as (
				p: Record<string, unknown>
			) => ResolvedVariantValue<Slots> | undefined
		)(props);
	}

	return defaultValue as ResolvedVariantValue<Slots> | undefined;
};

const resolveVariantState = (
	config: CompiledConfig,
	props: Record<string, unknown>,
	presetValues: Record<string, ResolvedVariantValue<Slots>> | undefined
): {
	cacheKey: string;
	resolvedProps: Record<string, ResolvedVariantValue<Slots>>;
} => {

	const resolvedProps: Record<string, ResolvedVariantValue<Slots>> = {};

	let cacheKey = '';

	for (const variantKey of config.variantKeys) {

		const value = resolveVariantValue(
			config,
			variantKey,
			props,
			presetValues
		);

		if (value === undefined) {
			continue;
		}

		resolvedProps[variantKey] = value;

		cacheKey += `${value};`;
	}

	return { cacheKey, resolvedProps };
};

const assertRequiredVariants = (
	config: CompiledConfig,
	resolvedProps: Record<string, ResolvedVariantValue<Slots>>
) => {

	for (const variant of config.requiredVariants) {
		if (resolvedProps[variant] === undefined) {
			throw new Error(`Missing required variant: "${variant}"`);
		}
	}
};

const createSlotClasses = (config: CompiledConfig): SlotClasses => {

	const slotClasses: SlotClasses = {
		base: [config.baseClassValue]
	};

	for (const key of config.slotKeys) {
		slotClasses[key] = [config.otherSlots[key]];
	}

	return slotClasses;
};

const getVariantClasses = (
	variantKey: string,
	variantProp: unknown,
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
	config: CompiledConfig,
	slotClasses: SlotClasses,
	resolvedProps: Record<string, ResolvedVariantValue<Slots>>
) => {

	for (const [variantKey, variantValues] of config.variantEntries) {
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
			applyValueToSlotClasses(
				slotClasses,
				variantClasses as ResolvedVariantValue<Slots>,
				config.slotKeys
			);
		}
	}
};

const applyCompoundSlotsClasses = (
	config: CompiledConfig,
	slotClasses: SlotClasses,
	resolvedProps: Record<string, ResolvedVariantValue<Slots>>
) => {

	for (const compound of config.compoundSlots) {
		if (!matchesCompound(resolvedProps, compound)) {
			continue;
		}

		const compoundClass =
			(compound as { class?: ClassValue }).class ??
			(compound as { className?: ClassValue }).className;

		for (const slotName of compound.slots) {
			slotClasses[slotName]?.push(compoundClass);
		}
	}
};

const applyCompoundClasses = (
	config: CompiledConfig,
	slotClasses: SlotClasses,
	resolvedProps: Record<string, ResolvedVariantValue<Slots>>
) => {

	for (const compound of config.compoundVariants) {
		if (matchesCompound(resolvedProps, compound)) {
			applyValueToSlotClasses(
				slotClasses,
				((compound as { class?: ClassValue }).class ??
					(compound as { className?: ClassValue })
						.className) as ResolvedVariantValue<Slots>,
				config.slotKeys
			);
		}
	}

	applyCompoundSlotsClasses(config, slotClasses, resolvedProps);
};

const finalizeVariantResult = (
	config: CompiledConfig,
	slotClasses: SlotClasses,
	cacheKey: string
): CacheValue => {

	const result: { base: string } & Record<string, string> = { base: '' };

	for (const [slotKey, slotValues] of entries(slotClasses)) {
		result[slotKey] = config.postProcess(cn(slotValues));
	}

	return config.slotKeys.size === 0
		? config.cacheReturn(cacheKey, result.base)
		: config.cacheReturn(cacheKey, result);
};

const mergeClassPropIntoResult = (
	config: CompiledConfig,
	baseResult: CacheValue,
	classProp: ResolvedVariantValue<Slots>
): CacheValue => {

	const baseObj =
		config.slotKeys.size === 0
			? { base: baseResult as string }
			: (baseResult as Record<string, string>);
	const slotClasses: SlotClasses = { base: [baseObj.base] };

	for (const key of config.slotKeys) {
		slotClasses[key] = [baseObj[key]];
	}

	applyValueToSlotClasses(slotClasses, classProp, config.slotKeys);

	if (config.slotKeys.size === 0) {
		return cn(slotClasses.base);
	}

	const result: { base: string } & Record<string, string> = { base: '' };

	for (const [slotKey, slotValues] of entries(slotClasses)) {
		result[slotKey] = cn(slotValues);
	}

	return result;
};

const runVariant = <
	S extends Slots | undefined = undefined,
	V extends Variants<S> | undefined = undefined,
	RV extends readonly StringKeyof<V>[] = [],
	P extends Presets<S, V> | undefined = undefined
>(
	config: CompiledConfig,
	props: Props<S, V, RV, P>
): CacheValue => {

	const classProp = props.class ?? props.className;
	const presetValues = resolvePresetValues(config, props.preset);
	const { cacheKey, resolvedProps } = resolveVariantState(
		config,
		props,
		presetValues
	);

	let baseResult = config.cache.get(cacheKey);

	if (!baseResult) {
		assertRequiredVariants(config, resolvedProps);

		const slotClasses = createSlotClasses(config);

		applyResolvedVariantClasses(config, slotClasses, resolvedProps);
		applyCompoundClasses(config, slotClasses, resolvedProps);

		baseResult = finalizeVariantResult(config, slotClasses, cacheKey);
	}

	if (!classProp) {
		return baseResult;
	}

	return mergeClassPropIntoResult(config, baseResult, classProp);
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

	const { baseArgs, config } = resolveSVInputs(args);

	if (!config) {
		return cn(...baseArgs);
	}

	const variantFn = (props: Props<S, V, RV, P> = {} as Props<S, V, RV, P>) =>
		runVariant(config, props);

	if (!config.introspection) {
		return variantFn as ResultType<S, V, RV, P, I>;
	}

	return assign(variantFn, {
		variants: config.normalizedVariants,
		variantKeys: keys(config.normalizedVariants),
		slots: config.slots,
		slotKeys: ['base', ...config.slotKeys],
		defaultVariants: config.defaultVariants,
		requiredVariants: config.requiredVariants,
		presets: config.presets,
		presetKeys: keys(config.presets),
		getVariantValues: (key: string) =>
			keys(config.normalizedVariants[key] ?? {}).map(
				coerceVariantKeyValue
			),
		clearCache: () => config.cache.clear(),
		getCacheSize: () => config.cache.size
	}) as unknown as ResultType<S, V, RV, P, I>;
}