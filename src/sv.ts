import { cn, type ClassValue } from './cn.ts';

type Prettify<T> = {
	[K in keyof T]: T[K];
} & {};

type PartialUndefined<T> = {
	[K in keyof T]?: T[K] | undefined;
};

type StringKeyof<T> = Extract<keyof T, string>;

type ConfigClassValue = string | string[] | undefined;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFn = (...args: any[]) => unknown;

type RuntimeVariantValue = string | number | boolean;

type RuntimeVariantState = Record<string, RuntimeVariantValue | undefined>;

type MaybeSlots = Slots | undefined;

type MaybeVariants<S extends MaybeSlots> = Variants<S> | undefined;

type SlotValue<S extends MaybeSlots, V> = S extends Slots
	? Partial<Record<SlotKey<S>, V>> | V
	: V;

type ClassProp<S extends MaybeSlots, V> = {
	class?: SlotValue<S, V>;
	className?: SlotValue<S, V>;
};

type Slots = Record<string, ConfigClassValue>;

type BooleanString<T> = T extends `${boolean}` ? boolean : T;

type SlotKey<S extends MaybeSlots> = 'base' | StringKeyof<S>;

type Variants<S extends MaybeSlots> = Record<
	string,
	| Record<string | number, SlotValue<S, ConfigClassValue>>
	| SlotValue<S, ConfigClassValue>
>;

type VariantConditions<S extends MaybeSlots, V extends MaybeVariants<S>> = {
	[K in StringKeyof<V>]?:
		| VariantPropType<V[K], S>
		| readonly VariantPropType<V[K], S>[]
		| undefined;
};

type CompoundVariants<
	S extends MaybeSlots,
	V extends MaybeVariants<S>
> = readonly (VariantConditions<S, V> & ClassProp<S, ConfigClassValue>)[];

type CompoundSlots<
	S extends MaybeSlots,
	V extends MaybeVariants<S>
> = readonly ({
	slots: readonly SlotKey<S>[];
} & VariantConditions<S, V> &
	ClassProp<S, ConfigClassValue>)[];

type BooleanShorthandKeys<S extends MaybeSlots> =
	| (S extends Slots ? SlotKey<S> : never)
	| 'true'
	| 'false';

type VariantPropType<T, S extends MaybeSlots> =
	T extends Record<string | number, unknown>
		? [Extract<keyof T, number>] extends [never]
			? StringKeyof<T> extends BooleanShorthandKeys<S>
				? boolean
				: BooleanString<StringKeyof<T>>
			: BooleanString<StringKeyof<T>> | Extract<keyof T, number>
		: boolean;

type VariantPropsInternal<S extends MaybeSlots, V extends MaybeVariants<S>> = {
	[K in StringKeyof<V>]: VariantPropType<V[K], S>;
};

type DefaultVariantValue<
	S extends MaybeSlots,
	V extends MaybeVariants<S>,
	K extends StringKeyof<V>
> =
	| VariantPropType<V[K], S>
	| ((
			props: RuntimeVariantState
	  ) => VariantPropType<V[K], S> | undefined)
	| undefined;

type DefaultVariants<
	S extends MaybeSlots,
	V extends MaybeVariants<S>,
	RV extends readonly StringKeyof<V>[]
> = {
	[K in Exclude<StringKeyof<V>, RV[number]>]?: DefaultVariantValue<S, V, K>;
};

type RuntimeClassValue = SlotValue<Slots, ClassValue>;

type NormalizedVariantValue =
	| ConfigClassValue
	| Record<string, ConfigClassValue>;

type RuntimeVariantConfigValue =
	| ConfigClassValue
	| Record<string, NormalizedVariantValue>;

type CacheValue = string | Record<string, string>;

type CacheEntry = {
	raw: CacheValue;
	processed: CacheValue;
};

type Presets<S extends MaybeSlots, V extends MaybeVariants<S>> = Record<
	string,
	Partial<VariantPropsInternal<S, V>>
>;

type VariantPropsWithRequired<
	S extends MaybeSlots,
	V extends MaybeVariants<S>,
	RV extends readonly StringKeyof<V>[]
> = Pick<VariantPropsInternal<S, V>, RV[number]> &
	Omit<PartialUndefined<VariantPropsInternal<S, V>>, RV[number]>;

type Props<
	S extends MaybeSlots,
	V extends MaybeVariants<S>,
	RV extends readonly StringKeyof<V>[],
	P extends Presets<S, V> | undefined
> = Prettify<
	P extends undefined
		? VariantPropsWithRequired<S, V, RV>
		: PartialUndefined<VariantPropsInternal<S, V>> & {
				preset?: StringKeyof<P> | undefined;
			}
> &
	ClassProp<S, ClassValue>;

type RuntimeProps = RuntimeVariantState & {
	class?: RuntimeClassValue;
	className?: RuntimeClassValue;
	preset?: string;
};

type RuntimeDefaultVariant =
	| RuntimeVariantValue
	| ((props: RuntimeVariantState) => RuntimeVariantValue | undefined)
	| undefined;


type Config<
	S extends MaybeSlots,
	V extends MaybeVariants<S>,
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

type SlotClasses = { base: ClassValue[] } & Record<string, ClassValue[]>;

type CompoundMatcher = {
	key: string;
	expected: RuntimeVariantValue | readonly RuntimeVariantValue[];
	isArrayExpected: boolean;
};

type CompiledCompoundVariant = {
	matchers: readonly CompoundMatcher[];
	classValue: ClassValue;
};

type CompiledCompoundSlot = CompiledCompoundVariant & {
	slots: readonly string[];
};

type CompiledConfig = {
	baseClassValue: ClassValue;
	slots: Slots;
	otherSlots: Record<string, ConfigClassValue>;
	slotKeys: Set<string>;
	originalVariants: Variants<MaybeSlots>;
	normalizedVariants: Record<string, Record<string, NormalizedVariantValue>>;
	variantKeys: string[];
	variantValueIds: Record<string, Record<string, number>>;
	defaultVariants: Record<string, RuntimeDefaultVariant>;
	requiredVariants: readonly string[];
	presets: Record<string, RuntimeVariantState>;
	presetKeys: Set<string>;
	compoundVariants: readonly CompiledCompoundVariant[];
	compoundSlots: readonly CompiledCompoundSlot[];
	cache: Map<string, CacheEntry>;
	introspection: boolean;
	cacheReturn: (cacheKey: string, value: CacheEntry) => CacheEntry;
	postProcess: ((className: string) => string) | undefined;
};

type ConfigKey = keyof Config<undefined, undefined, [], undefined>;

type VariantFn<
	S extends MaybeSlots,
	V extends MaybeVariants<S>,
	RV extends readonly StringKeyof<V>[],
	P extends Presets<S, V> | undefined,
	I extends boolean
> = {
	(
		...args: RV extends readonly []
			? [props?: Prettify<Props<S, V, RV, P>> | undefined]
			: [props: Prettify<Props<S, V, RV, P>>]
	): ReturnValue<S>;
} & (I extends true ? Prettify<IntrospectionValues<S, V, RV, P>> : unknown);

type ReturnValue<S extends MaybeSlots> = S extends undefined
	? string
	: Prettify<Record<SlotKey<S>, string>>;

type IntrospectionValues<
	S extends MaybeSlots,
	V extends MaybeVariants<S>,
	RV extends readonly StringKeyof<V>[],
	P extends Presets<S, V> | undefined
> = {
	variants: V extends undefined ? Record<string, never> : V;
	variantKeys: StringKeyof<V>[];
	slots: S extends undefined ? Record<string, never> : S;
	slotKeys: SlotKey<S>[];
	defaultVariants: DefaultVariants<S, V, RV>;
	requiredVariants: RV;
	presets: P extends undefined ? Record<string, never> : P;
	presetKeys: P extends undefined ? [] : StringKeyof<P>[];
	getVariantValues: V extends undefined
		? (key: never) => never[]
		: <K extends StringKeyof<V>>(key: K) => VariantPropType<V[K], S>[];
	clearCache: () => void;
	getCacheSize: () => number;
};

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
	T extends AnyFn,
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
export type SlotClassProps<
	T extends AnyFn
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

const createCacheReturn = (
	cache: Map<string, CacheEntry>,
	cacheSize: number
) => {

	if (cacheSize <= 0) {
		return (_cacheKey: string, value: CacheEntry): CacheEntry => value;
	}

	return (cacheKey: string, value: CacheEntry): CacheEntry => {

		if (cache.size >= cacheSize) {
			const firstKey = cache.keys().next().value;

			/* c8 ignore next 3 -- size >= cacheSize > 0 guarantees a key */
			if (firstKey === undefined) {
				return value;
			}

			cache.delete(firstKey);
		}

		cache.set(cacheKey, value);

		return value;
	};
};

const isCompoundMetaKey = (compoundKey: string): boolean =>
	compoundKey === 'class' ||
	compoundKey === 'className' ||
	compoundKey === 'slots';

const compileCompoundMatchers = (
	compound: Record<string, unknown>
): readonly CompoundMatcher[] => {

	const matchers: CompoundMatcher[] = [];

	for (const compoundKey of keys(compound)) {
		if (isCompoundMetaKey(compoundKey)) {
			continue;
		}

		const expected = compound[compoundKey] as
			| RuntimeVariantValue
			| readonly RuntimeVariantValue[]
			| undefined;

		matchers.push({
			key: compoundKey,
			expected: expected as
				| RuntimeVariantValue
				| readonly RuntimeVariantValue[],
			isArrayExpected: isArray(expected)
		});
	}

	return matchers;
};

const matchesCompound = (
	props: RuntimeVariantState,
	matchers: readonly CompoundMatcher[]
): boolean => {

	for (const { key, expected, isArrayExpected } of matchers) {
		const propValue = props[key];

		if (isArrayExpected) {
			const list = expected as readonly RuntimeVariantValue[];
			let matched = false;

			for (const value of list) {
				if (looseEquals(value, propValue)) {
					matched = true;
					break;
				}
			}

			if (!matched) {
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
): value is Extract<RuntimeVariantConfigValue, Record<string, unknown>> =>
	value !== null && typeof value === 'object' && !isArray(value);

const isSlotObjectVariantValue = (
	variantValue: Record<string, NormalizedVariantValue>,
	slotKeys: Set<string>
): variantValue is Record<string, ConfigClassValue> => {
	const valueKeys = keys(variantValue);

	return (
		slotKeys.size > 0 &&
		valueKeys.length > 0 &&
		valueKeys.every((key) => key === 'base' || slotKeys.has(key))
	);
};

const isBooleanVariantRecord = (
	variantValue: Record<string, NormalizedVariantValue>
): boolean =>
	keys(variantValue).every((key) => key === 'true' || key === 'false');

const normalizeVariantValue = (
	variantValue: RuntimeVariantConfigValue,
	slotKeys: Set<string>
): Record<string, NormalizedVariantValue> => {

	if (!isObjectRecord(variantValue)) {
		return {
			false: '',
			true: variantValue
		};
	}

	if (isSlotObjectVariantValue(variantValue, slotKeys)) {
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

	if (booleanValue === '') {
		return booleanValue;
	}

	const numericValue = Number(booleanValue);

	if (Number.isNaN(numericValue)) {
		return booleanValue;
	}

	return numericValue;
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
	S extends MaybeSlots,
	V extends MaybeVariants<S>,
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

const resolveInputs = <
	S extends MaybeSlots,
	V extends MaybeVariants<S>,
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

const createNormalizedVariants = <S extends MaybeSlots>(
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
	variantKeys: readonly string[],
	defaultVariantKeys: Set<string>
) => {

	const variantKeySet = new Set(variantKeys);

	for (const variant of requiredVariants) {
		if (!variantKeySet.has(variant)) {
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
	value:
		| Record<string, unknown>
		| Partial<Record<SlotKey<Slots>, ClassValue>>,
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
	value: RuntimeClassValue,
	slotKeys: Set<string>
): value is Partial<Record<string, ClassValue>> =>
	value !== null &&
	typeof value === 'object' &&
	!isArray(value) &&
	hasOnlyBaseOrSlotKeys(value, slotKeys);

const applyValueToSlotClasses = (
	slotClasses: SlotClasses,
	value: RuntimeClassValue,
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

const compileConfig = <
	S extends MaybeSlots,
	V extends MaybeVariants<S>,
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
		slots = {},
		compoundVariants = [],
		compoundSlots = [],
		defaultVariants = {} as DefaultVariants<S, V, RV>,
		requiredVariants = [],
		presets = {},
		cacheSize = 256,
		postProcess,
		introspection = false
	} = config;

	const cache = new Map<string, CacheEntry>();
	const cacheReturn = createCacheReturn(cache, cacheSize);
	const { base: baseSlot, ...otherSlots } = slots;
	const baseClassValue = cn(...baseArgs, configBase, baseSlot);
	const slotKeys = new Set(keys(otherSlots));
	const normalizedVariants = createNormalizedVariants(variants, slotKeys);
	const variantKeys = keys(normalizedVariants);
	const defaultVariantKeys = new Set(keys(defaultVariants));
	const variantValueIds: Record<string, Record<string, number>> = {};

	for (const [variantKey, variantValues] of entries(normalizedVariants)) {

		const ids: Record<string, number> = {};

		let nextId = 0;

		for (const valueKey of keys(variantValues)) {
			ids[valueKey] = nextId;
			nextId++;
		}

		variantValueIds[variantKey] = ids;
	}

	assertValidRequiredVariantConfig(
		requiredVariants,
		variantKeys,
		defaultVariantKeys
	);

	const compiledCompoundVariants: CompiledCompoundVariant[] =
		compoundVariants.map((compound) => ({
			matchers: compileCompoundMatchers(
				compound as Record<string, unknown>
			),
			classValue: compound.class ?? compound.className
		}));

	const compiledCompoundSlots: CompiledCompoundSlot[] = compoundSlots.map(
		(compound) => ({
			matchers: compileCompoundMatchers(
				compound as Record<string, unknown>
			),
			classValue: compound.class ?? compound.className,
			slots: compound.slots as readonly string[]
		})
	);

	return {
		baseClassValue,
		slots,
		otherSlots,
		slotKeys,
		originalVariants: variants,
		normalizedVariants,
		variantKeys,
		variantValueIds,
		defaultVariants,
		requiredVariants,
		presets,
		presetKeys: new Set(keys(presets)),
		compoundVariants: compiledCompoundVariants,
		compoundSlots: compiledCompoundSlots,
		cache,
		introspection,
		cacheReturn,
		postProcess
	};
};

const resolvePresetValues = (
	config: CompiledConfig,
	presetName: string | undefined
): RuntimeVariantState | undefined => {

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
	props: RuntimeVariantState,
	presetValues: RuntimeVariantState | undefined
): RuntimeVariantValue | undefined => {

	const propValue = props[variantKey];

	if (propValue !== undefined) {
		return propValue;
	}

	const presetValue = presetValues?.[variantKey];

	if (presetValue !== undefined) {
		return presetValue;
	}

	const defaultValue = config.defaultVariants[variantKey];

	if (typeof defaultValue === 'function') {
		return defaultValue(props);
	}

	return defaultValue;
};

const resolveVariantState = (
	config: CompiledConfig,
	props: RuntimeProps,
	presetValues: RuntimeVariantState | undefined
): {
	cacheKey: string;
	resolvedProps: RuntimeVariantState;
} => {

	const { variantKeys, variantValueIds } = config;
	const resolvedProps: RuntimeVariantState = {};

	let cacheKey = '';
	let first = true;

	for (const variantKey of variantKeys) {

		const value = resolveVariantValue(
			config,
			variantKey,
			props,
			presetValues
		);

		if (!first) {
			cacheKey += '.';
		}
		first = false;

		if (value === undefined) {
			continue;
		}

		resolvedProps[variantKey] = value;

		const id = variantValueIds[variantKey]?.[`${value}`];

		if (id === undefined) {
			cacheKey += `?${value}`;
		} else {
			cacheKey += id;
		}
	}

	return {
		cacheKey,
		resolvedProps
	};
};

const assertRequiredVariants = (
	config: CompiledConfig,
	resolvedProps: RuntimeVariantState
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
	resolvedProps: RuntimeVariantState
) => {

	for (const [variantKey, variantProp] of entries(resolvedProps)) {

		const variantValues = config.normalizedVariants[variantKey];

		/* c8 ignore next 3 -- resolvedProps keys always correspond to normalized variants */
		if (variantValues === undefined) {
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
				variantClasses,
				config.slotKeys
			);
		}
	}
};

const applyCompoundClasses = (
	config: CompiledConfig,
	slotClasses: SlotClasses,
	resolvedProps: RuntimeVariantState
) => {

	for (const compound of config.compoundVariants) {
		if (matchesCompound(resolvedProps, compound.matchers)) {
			applyValueToSlotClasses(
				slotClasses,
				compound.classValue,
				config.slotKeys
			);
		}
	}

	for (const compound of config.compoundSlots) {
		if (!matchesCompound(resolvedProps, compound.matchers)) {
			continue;
		}

		for (const slotName of compound.slots) {
			slotClasses[slotName]?.push(compound.classValue);
		}
	}
};

const finalizeVariantResult = (
	config: CompiledConfig,
	slotClasses: SlotClasses
): CacheValue => {

	if (config.slotKeys.size === 0) {
		return cn(slotClasses.base);
	}

	const result: { base: string } & Record<string, string> = { base: '' };

	for (const [slotKey, slotValues] of entries(slotClasses)) {
		result[slotKey] = cn(slotValues);
	}

	return result;
};

const applyPostProcess = (
	config: CompiledConfig,
	value: CacheValue
): CacheValue => {

	const { postProcess } = config;

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

const toSlotResult = (cacheValue: CacheValue): Record<string, string> =>
	typeof cacheValue === 'string' ? { base: cacheValue } : cacheValue;

const mergeClassPropIntoResult = (
	config: CompiledConfig,
	baseResult: CacheValue,
	classProp: RuntimeClassValue
): CacheValue => {

	const baseObj = toSlotResult(baseResult);
	const slotClasses: SlotClasses = { base: [baseObj.base] };

	for (const key of config.slotKeys) {
		slotClasses[key] = [baseObj[key]];
	}

	applyValueToSlotClasses(slotClasses, classProp, config.slotKeys);

	return finalizeVariantResult(config, slotClasses);
};

const runVariant = (
	config: CompiledConfig,
	props: RuntimeProps
): CacheValue => {

	const classProp = props.class ?? props.className;
	const presetValues = resolvePresetValues(config, props.preset);
	const { cacheKey, resolvedProps } = resolveVariantState(
		config,
		props,
		presetValues
	);

	let entry = config.cache.get(cacheKey);

	if (!entry) {
		assertRequiredVariants(config, resolvedProps);

		const slotClasses = createSlotClasses(config);

		applyResolvedVariantClasses(config, slotClasses, resolvedProps);
		applyCompoundClasses(config, slotClasses, resolvedProps);

		const raw = finalizeVariantResult(config, slotClasses);

		entry = config.cacheReturn(cacheKey, {
			raw,
			processed: applyPostProcess(config, raw)
		});
	}

	if (!classProp) {
		return entry.processed;
	}

	return applyPostProcess(
		config,
		mergeClassPropIntoResult(config, entry.raw, classProp)
	);
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
	S extends MaybeSlots = undefined,
	V extends MaybeVariants<S> = undefined,
	RV extends readonly StringKeyof<V>[] = [],
	P extends Presets<S, V> | undefined = undefined,
	I extends boolean = false
>(config: Config<S, V, RV, P, I>): VariantFn<S, V, RV, P, I>;
export function sv<
	S extends MaybeSlots = undefined,
	V extends MaybeVariants<S> = undefined,
	RV extends readonly StringKeyof<V>[] = [],
	P extends Presets<S, V> | undefined = undefined,
	I extends boolean = false
>(
	...args: [...ClassValue[], Config<S, V, RV, P, I>]
): VariantFn<S, V, RV, P, I>;
export function sv<const T extends ClassValue[]>(
	...args: T & { [K in keyof T]: NonConfigClassArg<T[K]> }
): string;
export function sv<
	S extends MaybeSlots = undefined,
	V extends MaybeVariants<S> = undefined,
	RV extends readonly StringKeyof<V>[] = [],
	P extends Presets<S, V> | undefined = undefined,
	I extends boolean = false
>(
	...args: (ClassValue | Config<S, V, RV, P, I>)[]
): string | VariantFn<S, V, RV, P, I> {

	const { baseArgs, config } = resolveInputs(args);

	if (!config) {
		return cn(...baseArgs);
	}

	const variantFn = (props: RuntimeProps = {}) => runVariant(config, props);

	if (!config.introspection) {
		return variantFn as VariantFn<S, V, RV, P, I>;
	}

	return assign(variantFn, {
		variants: config.originalVariants,
		variantKeys: [...config.variantKeys],
		slots: config.slots,
		slotKeys: ['base', ...config.slotKeys],
		defaultVariants: config.defaultVariants,
		requiredVariants: config.requiredVariants,
		presets: config.presets,
		presetKeys: [...config.presetKeys],
		getVariantValues: (key: string) =>
			keys(config.normalizedVariants[key] ?? {}).map(
				coerceVariantKeyValue
			),
		clearCache: () => config.cache.clear(),
		getCacheSize: () => config.cache.size
	}) as unknown as VariantFn<S, V, RV, P, I>;
}