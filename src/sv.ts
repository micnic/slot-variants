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

type XORClassProp<C, O extends boolean = false> = O extends true
	? { class?: C; className?: never } | { class?: never; className?: C }
	: { class: C; className?: never } | { class?: never; className: C };

type ClassProp<S extends MaybeSlots, V> = XORClassProp<SlotValue<S, V>, true>;

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
> = readonly (VariantConditions<S, V> &
	XORClassProp<SlotValue<S, ConfigClassValue>>)[];

type CompoundSlots<
	S extends MaybeSlots,
	V extends MaybeVariants<S>
> = readonly ({
	slots: readonly [SlotKey<S>, ...SlotKey<S>[]];
} & VariantConditions<S, V> &
	XORClassProp<ConfigClassValue>)[];

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

type SlotClasses = Record<string, ConfigClassValue[]>;

type CompoundMatcher = {
	key: string;
	expected: RuntimeVariantValue | readonly RuntimeVariantValue[];
};

type CompiledCompoundVariant = {
	matchers: readonly CompoundMatcher[];
	classValue: SlotValue<Slots, ConfigClassValue> | undefined;
};

type CompiledCompoundSlot = {
	matchers: readonly CompoundMatcher[];
	classValue: ConfigClassValue;
	slots: readonly string[];
};

type CompiledConfig = {
	baseClassValue: string;
	slots: Slots;
	normalizedSlots: Slots;
	slotEntries: readonly [string, ConfigClassValue][];
	slotKeys: Set<string>;
	originalVariants: Variants<MaybeSlots>;
	normalizedVariants: Record<string, Record<string, NormalizedVariantValue>>;
	variantData: [string, Record<string, number>, Record<string, NormalizedVariantValue>][];
	defaultVariants: Record<string, RuntimeDefaultVariant>;
	requiredVariants: readonly string[];
	presets: Record<string, RuntimeVariantState>;
	compoundVariants: CompiledCompoundVariant[];
	compoundSlots: CompiledCompoundSlot[];
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
const { assign, entries, hasOwn, keys } = Object;

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
			for (const firstKey of cache.keys()) {
				cache.delete(firstKey);
				break;
			}
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
	compound: Record<string, unknown>,
	normalizedVariants: Record<string, Record<string, NormalizedVariantValue>>
): readonly CompoundMatcher[] => {

	const matchers: CompoundMatcher[] = [];

	for (const [compoundKey, value] of entries(compound)) {
		if (isCompoundMetaKey(compoundKey)) {
			continue;
		}

		if (!hasOwn(normalizedVariants, compoundKey)) {
			throw new Error(
				`Compound matcher references unknown variant "${compoundKey}"`
			);
		}

		matchers.push({
			key: compoundKey,
			expected: value as
				| RuntimeVariantValue
				| readonly RuntimeVariantValue[]
		});
	}

	return matchers;
};

const matchesCompound = (
	props: RuntimeVariantState,
	matchers: readonly CompoundMatcher[]
): boolean => {

	for (const { key, expected } of matchers) {
		const propValue = props[key];

		if (isArray(expected)) {
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
): value is Extract<RuntimeVariantConfigValue, Record<string, unknown>> =>
	value !== null && typeof value === 'object' && !isArray(value);

const isSlotObjectVariantValue = (
	variantValue: Record<string, NormalizedVariantValue>,
	slotKeys: Set<string>
): variantValue is Record<string, ConfigClassValue> => {
	const valueKeys = keys(variantValue);

	return (
		slotKeys.size > 1 &&
		valueKeys.length > 0 &&
		valueKeys.every((key) => slotKeys.has(key))
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

	if (
		!isObjectRecord(variantValue) ||
		isSlotObjectVariantValue(variantValue, slotKeys)
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
	compoundVariants: true,
	compoundSlots: true,
	defaultVariants: true,
	requiredVariants: true,
	presets: true,
	cacheSize: true,
	postProcess: true,
	introspection: true
};

const configKeys: Set<string> = new Set(keys(configKeysRecord));

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
	keys(value).every((key) => configKeys.has(key));

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
	normalizedVariants: Record<string, Record<string, NormalizedVariantValue>>,
	defaultVariants: Record<string, RuntimeDefaultVariant>
) => {

	if (requiredVariants.length === 0) {
		return;
	}

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
	normalizedVariants: Record<string, Record<string, NormalizedVariantValue>>
) => {

	for (const variant of keys(defaultVariants)) {
		if (!hasOwn(normalizedVariants, variant)) {
			throw new Error(
				`Default variant "${variant}" is not defined in variants`
			);
		}
	}
};

const assertKnownPresetVariants = (
	presets: Record<string, RuntimeVariantState>,
	normalizedVariants: Record<string, Record<string, NormalizedVariantValue>>
) => {

	for (const [presetName, presetValues] of entries(presets)) {
		for (const variant of keys(presetValues)) {
			if (!hasOwn(normalizedVariants, variant)) {
				throw new Error(
					`Preset "${presetName}" references unknown variant "${variant}"`
				);
			}
		}
	}
};

const assertKnownCompoundSlots = (
	compoundSlots: readonly string[],
	slotKeys: Set<string>
) => {

	if (compoundSlots.length === 0) {
		throw new Error('Compound slot must define at least one slot');
	}

	for (const slot of compoundSlots) {
		if (!slotKeys.has(slot)) {
			throw new Error(`Compound slot references unknown slot "${slot}"`);
		}
	}
};

const hasOnlySlotKeys = (
	value:
		| Record<string, unknown>
		| Partial<Record<SlotKey<Slots>, ClassValue>>,
	slotKeys: Set<string>
): boolean => {

	for (const key of keys(value)) {
		if (!slotKeys.has(key)) {
			return false;
		}
	}

	return true;
};

const isSlotObjectValue = <T>(
	value: SlotValue<Slots, T>,
	slotKeys: Set<string>
): value is Partial<Record<string, T>> =>
	value !== null &&
	typeof value === 'object' &&
	!isArray(value) &&
	hasOnlySlotKeys(value, slotKeys);

const applyValueToSlotClasses = (
	slotClasses: SlotClasses,
	value: NormalizedVariantValue,
	slotKeys: Set<string>
) => {

	if (isSlotObjectValue(value, slotKeys)) {
		for (const [slotKey, slotValue] of entries(value)) {
			slotClasses[slotKey]?.push(slotValue);
		}
		return;
	}

	slotClasses.base?.push(value);
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
		defaultVariants = {},
		requiredVariants = [],
		presets = {},
		cacheSize = 256,
		postProcess,
		introspection = false
	} = config;

	const { base: baseSlot, ...otherSlots } = slots;
	const cache = new Map<string, CacheEntry>();
	const cacheReturn = createCacheReturn(cache, cacheSize);
	const baseClassValue = cn(...baseArgs, configBase, baseSlot);
	const normalizedSlots: Slots = { base: baseClassValue, ...otherSlots };
	const slotEntries = entries(normalizedSlots);
	const slotKeys = new Set<string>(keys(normalizedSlots));
	const normalizedVariants = createNormalizedVariants(variants, slotKeys);

	const variantData: [
		string,
		Record<string, number>,
		Record<string, NormalizedVariantValue>
	][] = [];

	for (const [variantKey, variantValues] of entries(normalizedVariants)) {

		const ids: Record<string, number> = {};

		let nextId = 0;

		for (const valueKey of keys(variantValues)) {
			ids[valueKey] = nextId;
			nextId++;
		}

		variantData.push([variantKey, ids, variantValues]);
	}

	assertValidRequiredVariantConfig(
		requiredVariants,
		normalizedVariants,
		defaultVariants
	);
	assertKnownDefaultVariants(defaultVariants, normalizedVariants);
	assertKnownPresetVariants(presets, normalizedVariants);

	const compiledCompoundVariants: CompiledCompoundVariant[] = [];

	for (const compound of compoundVariants) {
		const classValue = compound.class ?? compound.className;

		if (classValue === undefined) {
			throw new Error(
				'Compound variant must define "class" or "className"'
			);
		}

		compiledCompoundVariants.push({
			matchers: compileCompoundMatchers(
				compound as Record<string, unknown>,
				normalizedVariants
			),
			classValue
		});
	}

	const compiledCompoundSlots: CompiledCompoundSlot[] = [];

	for (const compound of compoundSlots) {

		assertKnownCompoundSlots(compound.slots, slotKeys);

		const classValue = compound.class ?? compound.className;

		if (classValue === undefined) {
			throw new Error(
				'Compound slot must define "class" or "className"'
			);
		}

		compiledCompoundSlots.push({
			matchers: compileCompoundMatchers(
				compound as Record<string, unknown>,
				normalizedVariants
			),
			classValue,
			slots: compound.slots
		});
	}

	return {
		baseClassValue,
		slots,
		normalizedSlots,
		slotEntries,
		slotKeys,
		originalVariants: variants,
		normalizedVariants,
		variantData,
		defaultVariants,
		requiredVariants,
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
	config: CompiledConfig,
	presetName: string | undefined
): RuntimeVariantState | undefined => {

	if (presetName === undefined) {
		return undefined;
	}

	if (!hasOwn(config.presets, presetName)) {
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

	const resolvedProps: RuntimeVariantState = {};

	let cacheKey = '';

	for (const [variantKey, valueIds] of config.variantData) {

		const value = resolveVariantValue(
			config,
			variantKey,
			props,
			presetValues
		);

		if (value === undefined) {
			cacheKey += '.';
			continue;
		}

		resolvedProps[variantKey] = value;

		const id = valueIds[`${value}`];

		if (id === undefined) {
			cacheKey += `.?${value}`;
		} else {
			cacheKey += `.${id}`;
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

	if (config.requiredVariants.length === 0) {
		return;
	}

	for (const variant of config.requiredVariants) {
		if (resolvedProps[variant] === undefined) {
			throw new Error(`Missing required variant: "${variant}"`);
		}
	}
};

const getVariantClasses = (
	variantKey: string,
	variantProp: RuntimeVariantValue,
	variantValues: Record<string, NormalizedVariantValue>
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
	config: CompiledConfig,
	slotClasses: SlotClasses,
	resolvedProps: RuntimeVariantState
) => {

	for (const [variantKey, , variantValues] of config.variantData) {

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
		if (matchesCompound(resolvedProps, compound.matchers)) {
			for (const slotName of compound.slots) {
				slotClasses[slotName]?.push(compound.classValue);
			}
		}
	}
};

const finalizeVariantResult = (
	config: CompiledConfig,
	slotClasses: SlotClasses
): CacheValue => {

	if (config.slotKeys.size === 1) {
		return cn(slotClasses.base);
	}

	const result: Record<string, string> = {};

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

const mergeClassPropIntoResult = (
	config: CompiledConfig,
	baseResult: CacheValue,
	classProp: RuntimeClassValue
): CacheValue => {

	const classPropIsSlotObject = isSlotObjectValue(classProp, config.slotKeys);

	if (typeof baseResult === 'string') {

		if (classPropIsSlotObject) {
			return cn(baseResult, classProp.base);
		}

		return cn(baseResult, classProp);
	}

	const result: Record<string, string> = { ...baseResult };

	if (classPropIsSlotObject) {

		for (const [slotKey, slotValue] of entries(classProp)) {
			result[slotKey] = cn(baseResult[slotKey], slotValue);
		}

		return result;
	}

	result.base = cn(baseResult.base, classProp);

	return result;
};

const buildCacheEntry = (
	config: CompiledConfig,
	cacheKey: string,
	resolvedProps: RuntimeVariantState
): CacheEntry => {

	assertRequiredVariants(config, resolvedProps);

	const slotClasses: SlotClasses = {};

	for (const [key, value] of config.slotEntries) {
		slotClasses[key] = [value];
	}

	applyResolvedVariantClasses(config, slotClasses, resolvedProps);
	applyCompoundClasses(config, slotClasses, resolvedProps);

	const raw = finalizeVariantResult(config, slotClasses);

	return config.cacheReturn(cacheKey, {
		raw,
		processed: applyPostProcess(config, raw)
	});
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
	const entry =
		config.cache.get(cacheKey) ??
		buildCacheEntry(config, cacheKey, resolvedProps);

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

	const last = args.at(-1);

	// Return merged class string if no config is provided
	if (!isConfig<S, V, RV, P, I>(last)) {
		return cn(...(args as ClassValue[]));
	}

	const config = compileConfig(args.slice(0, -1) as ClassValue[], last);
	const variantFn = (props: RuntimeProps = {}) => runVariant(config, props);

	// Conditionally add introspection properties if enabled in config
	if (!config.introspection) {
		return variantFn as VariantFn<S, V, RV, P, I>;
	}

	return assign(variantFn, {
		variants: config.originalVariants,
		variantKeys: keys(config.normalizedVariants),
		slots: config.slots,
		slotKeys: [...config.slotKeys],
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
	}) as unknown as VariantFn<S, V, RV, P, I>;
}