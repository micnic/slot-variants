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

type XORClassProp<C, O extends boolean = false> = O extends true
	? { class?: C; className?: never } | { class?: never; className?: C }
	: { class: C; className?: never } | { class?: never; className: C };

type Slots = Record<string, ConfigClassValue>;
type MaybeSlots = Slots | undefined;
type BooleanString<T> = T extends `${boolean}` ? boolean : T;
type SlotKey<S extends MaybeSlots> = 'base' | StringKeyof<S>;

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

type CompoundMatcher = {
	key: string;
	expected: RuntimeVariantMatcher;
};

type CompiledCompoundSlot = {
	matchers: readonly CompoundMatcher[];
	classValue: ConfigClassValue;
	slots: readonly string[];
};

type MultiSlots<S extends MaybeSlots> = readonly SlotKey<S>[] | boolean;

type MultiSlotKeys<
	S extends MaybeSlots,
	MS extends MultiSlots<S>
> = MS extends true
	? SlotKey<S>
	: MS extends readonly string[]
		? MS[number] & SlotKey<S>
		: never;

type ReturnValue<
	S extends MaybeSlots,
	V extends MaybeVariants<S>,
	P extends MaybePresets<S, V>,
	MS extends MultiSlots<S>
> = S extends undefined
	? string
	: Prettify<{
			readonly [K in SlotKey<S>]: K extends MultiSlotKeys<S, MS>
				? (props?: MultiSlotFnProps<S, V, P>) => string
				: string;
		}>;

type SlotValue<S extends MaybeSlots, V> = S extends Slots
	? Partial<Record<SlotKey<S>, V>> | V
	: V;

type ClassProp<S extends MaybeSlots, V> = XORClassProp<SlotValue<S, V>, true>;

type Variants<S extends MaybeSlots> = Record<
	string,
	| Record<string | number, SlotValue<S, ConfigClassValue>>
	| SlotValue<S, ConfigClassValue>
>;

type MaybeVariants<S extends MaybeSlots> = Variants<S> | undefined;

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

type VariantPropsInternal<S extends MaybeSlots, V extends MaybeVariants<S>> = {
	[K in StringKeyof<V>]: VariantPropType<V[K], S>;
};

type MultiSlotFnProps<
	S extends MaybeSlots,
	V extends MaybeVariants<S>,
	P extends MaybePresets<S, V>
> = Prettify<
	P extends undefined
		? PartialNullable<VariantPropsInternal<S, V>>
		: PartialNullable<VariantPropsInternal<S, V>> & {
				preset?: StringKeyof<P> | undefined;
			}
> &
	XORClassProp<ClassValue, true>;

type DefaultVariantValue<
	S extends MaybeSlots,
	V extends MaybeVariants<S>,
	K extends StringKeyof<V>
> =
	| VariantPropType<V[K], S>
	| ((props: RuntimeVariantState) => VariantPropType<V[K], S> | undefined)
	| undefined;

type RuntimeClassValue = SlotValue<Slots, ClassValue>;

type Presets<S extends MaybeSlots, V extends MaybeVariants<S>> = Record<
	string,
	Partial<VariantPropsInternal<S, V>>
>;

type MaybePresets<S extends MaybeSlots, V extends MaybeVariants<S>> =
	Presets<S, V> | undefined;

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
	V extends MaybeVariants<S>,
	RV extends RequiredVariants<V>
> = {
	[K in Exclude<
		StringKeyof<V>,
		RequiredVariantKeys<V, RV>
	>]?: DefaultVariantValue<S, V, K>;
};

type VariantPropsWithRequired<
	S extends MaybeSlots,
	V extends MaybeVariants<S>,
	RV extends RequiredVariants<V>
> = Pick<VariantPropsInternal<S, V>, RequiredVariantKeys<V, RV>> &
	Omit<
		PartialNullable<VariantPropsInternal<S, V>>,
		RequiredVariantKeys<V, RV>
	>;

type Props<
	S extends MaybeSlots,
	V extends MaybeVariants<S>,
	RV extends RequiredVariants<V>,
	P extends MaybePresets<S, V>
> = Prettify<
	P extends undefined
		? VariantPropsWithRequired<S, V, RV>
		: PartialNullable<VariantPropsInternal<S, V>> & {
				preset?: StringKeyof<P> | undefined;
			}
> &
	ClassProp<S, ClassValue>;

type Config<
	S extends MaybeSlots,
	V extends MaybeVariants<S>,
	RV extends RequiredVariants<V>,
	P extends MaybePresets<S, V>,
	MS extends MultiSlots<S>,
	I extends boolean = false
> = {
	base?: ConfigClassValue;
	variants?: V | undefined;
	slots?: S | undefined;
	compoundVariants?: CompoundVariants<S, V> | undefined;
	compoundSlots?: CompoundSlots<S, V> | undefined;
	defaultVariants?: DefaultVariants<S, V, RV> | undefined;
	requiredVariants?: RV | undefined;
	multiSlots?: MS | undefined;
	presets?: P | undefined;
	cacheSize?: number | undefined;
	introspection?: I | undefined;
	postProcess?: ((className: string) => string) | undefined;
};

type ConfigKey = keyof Config<undefined, undefined, [], undefined, false>;

type IntrospectionValues<
	S extends MaybeSlots,
	V extends MaybeVariants<S>,
	RV extends RequiredVariants<V>,
	P extends MaybePresets<S, V>,
	MS extends MultiSlots<S>
> = {
	variants: V extends undefined ? Record<string, never> : V;
	variantKeys: StringKeyof<V>[];
	slots: S extends undefined ? Record<string, never> : S;
	slotKeys: SlotKey<S>[];
	defaultVariants: DefaultVariants<S, V, RV>;
	requiredVariants: RV extends true ? StringKeyof<V>[] : RV;
	multiSlots: MS extends true ? SlotKey<S>[] : MS;
	presets: P extends undefined ? Record<string, never> : P;
	presetKeys: P extends undefined ? [] : StringKeyof<P>[];
	getVariantValues: V extends undefined
		? (key: never) => never[]
		: <K extends StringKeyof<V>>(key: K) => VariantPropType<V[K], S>[];
	getMaxEntries: () => number;
	clearCache: () => void;
	getCacheSize: () => number;
};

type VariantFn<
	S extends MaybeSlots,
	V extends MaybeVariants<S>,
	RV extends RequiredVariants<V>,
	P extends MaybePresets<S, V>,
	MS extends MultiSlots<S>,
	I extends boolean
> = {
	(
		...args: [RequiredVariantKeys<V, RV>] extends [never]
			? [props?: Prettify<Props<S, V, RV, P>> | undefined]
			: [props: Prettify<Props<S, V, RV, P>>]
	): ReturnValue<S, V, P, MS>;
} & (I extends true
	? Prettify<IntrospectionValues<S, V, RV, P, MS>>
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
	MaybeVariants<MaybeSlots>,
	RequiredVariants<MaybeVariants<MaybeSlots>>,
	MaybePresets<MaybeSlots, MaybeVariants<MaybeSlots>>,
	MultiSlots<MaybeSlots>,
	boolean
>;

/**
 * The shape of an `sv()` function. Mirrors the overloads of the exported `sv`,
 * with the introspection default `DI` baked in by `createSV()` so configs that
 * omit `introspection` inherit the factory default in their return type.
 */
export type SV<DI extends boolean = false> = {
	<
		S extends MaybeSlots = undefined,
		V extends MaybeVariants<S> = undefined,
		RV extends RequiredVariants<V> = false,
		P extends MaybePresets<S, V> = undefined,
		MS extends MultiSlots<S> = false,
		I extends boolean = DI
	>(
		config: Config<S, V, RV, P, MS, I>
	): VariantFn<S, V, RV, P, MS, I>;
	<
		S extends MaybeSlots = undefined,
		V extends MaybeVariants<S> = undefined,
		RV extends RequiredVariants<V> = false,
		P extends MaybePresets<S, V> = undefined,
		MS extends MultiSlots<S> = false,
		I extends boolean = DI
	>(
		...args: [...ClassValue[], Config<S, V, RV, P, MS, I>]
	): VariantFn<S, V, RV, P, MS, I>;
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
	compoundKey === 'slots';

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

const compileCompoundMatchers = (
	compound: Record<string, unknown>,
	normalizedVariants: NormalizedVariants
): readonly CompoundMatcher[] => {

	const matchers: CompoundMatcher[] = [];

	for (const [compoundKey, value] of entries(compound)) {

		if (isCompoundMetaKey(compoundKey)) {
			continue;
		}

		const variantValues = getKnownVariantValues(
			normalizedVariants,
			compoundKey,
			`Compound matcher references unknown variant "${compoundKey}"`
		);

		matchers.push({
			key: compoundKey,
			expected: resolveCompoundMatcherExpected(
				compoundKey,
				value,
				variantValues
			)
		});
	}

	return matchers;
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
	slotKeys: ReadonlySet<string>
): variantValue is Record<string, ConfigClassValue> => {

	if (slotKeys.size <= 1) {
		return false;
	}

	const valueKeys = keys(variantValue);

	return valueKeys.length > 0 && valueKeys.every((key) => slotKeys.has(key));
};

const isBooleanVariantRecord = (
	variantValue: NormalizedVariantValues
): boolean =>
	keys(variantValue).every((key) => key === 'true' || key === 'false');

const normalizeVariantValue = (
	variantValue: RuntimeVariantConfigValue,
	slotKeys: ReadonlySet<string>
): NormalizedVariantValues => {

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
	multiSlots: true,
	presets: true,
	cacheSize: true,
	postProcess: true,
	introspection: true
};

const configKeys: ReadonlySet<string> = new Set(keys(configKeysRecord));

const isConfig = <
	S extends MaybeSlots,
	V extends MaybeVariants<S>,
	RV extends RequiredVariants<V>,
	P extends MaybePresets<S, V>,
	MS extends MultiSlots<S>,
	I extends boolean
>(
	value: ClassValue | Config<S, V, RV, P, MS, I>
): value is Config<S, V, RV, P, MS, I> =>
	value !== null &&
	typeof value === 'object' &&
	!isArray(value) &&
	keys(value).every((key) => configKeys.has(key));

const createNormalizedVariants = <S extends MaybeSlots>(
	variants: Variants<S>,
	slotKeys: ReadonlySet<string>
): NormalizedVariants => {

	const result: NormalizedVariants = {};

	for (const [variantKey, variantValue] of entries(variants)) {
		result[variantKey] = normalizeVariantValue(variantValue, slotKeys);
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
	slotKeys: ReadonlySet<string>
): ReadonlySet<string> => {

	if (multiSlots === true) {
		return slotKeys;
	}

	if (multiSlots === false) {
		return new Set();
	}

	for (const slot of multiSlots) {
		if (!slotKeys.has(slot)) {
			throw new Error(`Multi slot references unknown slot "${slot}"`);
		}
	}

	return new Set(multiSlots);
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

const assertKnownPresetVariants = (
	presets: Record<string, ResolvedVariantState>,
	normalizedVariants: NormalizedVariants
) => {

	for (const [presetName, presetValues] of entries(presets)) {
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

const assertKnownCompoundSlots = (
	compoundSlots: readonly string[],
	slotKeys: ReadonlySet<string>
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
	slotKeys: ReadonlySet<string>
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
	slotKeys: ReadonlySet<string>
): value is Partial<Record<string, T>> =>
	value !== null &&
	typeof value === 'object' &&
	!isArray(value) &&
	hasOnlySlotKeys(value, slotKeys);

const applyValueToSlotClasses = (
	slotClasses: SlotClasses,
	value: NormalizedVariantValue,
	slotKeys: ReadonlySet<string>
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
	RV extends RequiredVariants<V>,
	P extends MaybePresets<S, V>,
	MS extends MultiSlots<S>,
	I extends boolean
>(
	baseArgs: ClassValue[],
	config: Config<S, V, RV, P, MS, I>
): CompiledConfig => {

	const {
		base: configBase,
		variants = {},
		slots = {},
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
	const normalizedVariants = createNormalizedVariants(variants, slotKeys);
	const variantData = createVariantData(normalizedVariants);
	const resolvedMultiSlots = resolveMultiSlots(multiSlots, slotKeys);

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
	assertKnownPresetVariants(presets, normalizedVariants);

	const compiledCompoundVariants = compoundVariants.map(
		(compound): CompiledCompoundVariant => ({
			classValue: requireCompoundClassValue(compound, 'variant'),
			matchers: compileCompoundMatchers(compound, normalizedVariants)
		})
	);

	const compiledCompoundSlots = compoundSlots.map(
		(compound): CompiledCompoundSlot => {
			assertKnownCompoundSlots(compound.slots, slotKeys);
			return {
				classValue: requireCompoundClassValue(compound, 'slot'),
				matchers: compileCompoundMatchers(compound, normalizedVariants),
				slots: compound.slots
			};
		}
	);

	return {
		slots,
		slotEntries,
		slotKeys,
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
	slotKeys: ReadonlySet<string>,
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
			applyValueToSlotClasses(slotClasses, variantClasses, slotKeys);
		}
	}
};

const applyCompoundClasses = (
	compoundVariants: readonly CompiledCompoundVariant[],
	compoundSlots: readonly CompiledCompoundSlot[],
	slotKeys: ReadonlySet<string>,
	slotClasses: SlotClasses,
	resolvedProps: ResolvedVariantState
) => {

	for (const compound of compoundVariants) {
		if (matchesCompound(resolvedProps, compound.matchers)) {
			applyValueToSlotClasses(slotClasses, compound.classValue, slotKeys);
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

const mergeClassPropIntoResult = (
	slotKeys: ReadonlySet<string>,
	baseResult: CacheValue,
	classProp: RuntimeClassValue
): CacheValue => {

	const classPropIsSlotObject = isSlotObjectValue(classProp, slotKeys);

	if (typeof baseResult === 'string') {

		if (classPropIsSlotObject) {
			return cn(baseResult, classProp.base);
		}

		return cn(baseResult, classProp);
	}

	if (!classPropIsSlotObject) {
		return {
			...baseResult,
			base: cn(baseResult.base, classProp)
		};
	}

	const result: Record<string, string> = { ...baseResult };

	for (const [slotKey, slotValue] of entries(classProp)) {
		result[slotKey] = cn(baseResult[slotKey], slotValue);
	}

	return result;
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
		slotKeys,
		slotClasses,
		resolvedProps
	);

	applyCompoundClasses(
		compoundVariants,
		compoundSlots,
		slotKeys,
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
		slotKeys
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
		mergeClassPropIntoResult(slotKeys, entry.raw, classProp)
	);
};

const mergeMultiSlotClass = (
	slotKeys: ReadonlySet<string>,
	outerClass: RuntimeClassValue | undefined,
	innerClass: RuntimeClassValue,
	slotKey: string
): RuntimeClassValue => {

	const merged: Record<string, ClassValue> = {};

	if (outerClass !== undefined && isSlotObjectValue(outerClass, slotKeys)) {
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
				config.slotKeys,
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