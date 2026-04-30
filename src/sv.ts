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

type SlotsClassValue<S extends Slots> = Partial<
	Record<SlotKey<S>, ClassValue>
>;

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
		| VariantPropType<V[K], S>[]
		| undefined;
};

type CompoundVariants<
	S extends Slots | undefined,
	V extends Variants<S> | undefined
> = (VariantConditions<S, V> & ConfigClassProp<S>)[];

type CompoundSlots<
	S extends Slots | undefined,
	V extends Variants<S> | undefined
> = ({
	slots: SlotKey<S>[];
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
	RV extends StringKeyof<V>[]
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
	RV extends StringKeyof<V>[],
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
	RV extends StringKeyof<V>[],
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
	RV extends StringKeyof<V>[],
	P extends Presets<S, V> | undefined
> = RV extends []
	? (props?: Props<S, V, RV, P> | undefined) => ReturnValue<S>
	: (props: Props<S, V, RV, P>) => ReturnValue<S>;

type IntrospectionValues<
	S extends Slots | undefined,
	V extends Variants<S> | undefined,
	RV extends StringKeyof<V>[],
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
	RV extends StringKeyof<V>[],
	P extends Presets<S, V> | undefined,
	I extends boolean
> = ReturnFn<S, V, RV, P> &
	(I extends true ? IntrospectionValues<S, V, RV, P> : object);

type NonConfigClassArg<T> = T extends Record<string, unknown>
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
	RV extends StringKeyof<V>[] | [],
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

const createCacheReturn = (
	cache: Map<string, CacheValue>,
	cacheSize: number
) => <T extends CacheValue>(cacheKey: string | null, value: T): T => {
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
	compoundValue: string | number | boolean | (string | number | boolean)[] | undefined,
	propValue: unknown
): boolean => {
	if (isArray(compoundValue)) {
		return compoundValue.some((value) => looseEquals(value, propValue));
	}

	return looseEquals(compoundValue, propValue);
};

const matchesCompound = (
	props: Record<
		string,
		ClassValue | Partial<{ base: ClassValue } & Record<string, ClassValue>>
	>,
	compound: Record<
		string,
		string | number | boolean | (string | number | boolean)[] | undefined
	>
): boolean => {
	for (const compoundKey of keys(compound)) {
		if (
			compoundKey === 'class' ||
			compoundKey === 'className' ||
			compoundKey === 'slots'
		) {
			continue;
		}

		if (!compoundMatchValue(compound[compoundKey], props[compoundKey])) {
			return false;
		}
	}

	return true;
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
	RV extends StringKeyof<V>[] | [] = [],
	P extends Presets<S, V> | undefined = undefined,
	I extends boolean = false
>(config: Config<S, V, RV, P, I>): ResultType<S, V, RV, P, I>;
export function sv<
	S extends Slots | undefined = undefined,
	V extends Variants<S> | undefined = undefined,
	RV extends StringKeyof<V>[] | [] = [],
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
	RV extends StringKeyof<V>[] | [] = [],
	P extends Presets<S, V> | undefined = undefined,
	I extends boolean = false
>(
	...args: (ClassValue | Config<S, V, RV, P, I>)[]
): string | ResultType<S, V, RV, P, I> {

	const lastArg = args[args.length - 1];

	let base: ClassValue;
	let config: Config<S, V, RV, P, I> | undefined;

	// Detect config as last argument (only when 2+ args or single config arg)
	if (args.length >= 2 && isConfig<S, V, RV, P, I>(lastArg)) {
		base =
			args.length > 2
				? (args.slice(0, -1) as ClassValue[])
				: (args[0] as ClassValue);
		config = lastArg;
	} else if (args.length === 1 && isConfig<S, V, RV, P, I>(lastArg)) {
		config = lastArg;
	} else {
		base = args as ClassValue[];
	}

	// If no config provided, just return the base
	if (!config) {
		return cn(base);
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

	const baseArgs = isArray(base) ? base : [base];
	const baseClassValue = cn(...baseArgs, configBase, baseSlot);
	const slotKeys = new Set(keys(otherSlots));

	const normalizeVariantValue = (
		variantValue: unknown
	): Record<string, NormalizedVariantValue> => {
		if (
			!variantValue ||
			typeof variantValue !== 'object' ||
			isArray(variantValue)
		) {
			// It's a boolean shorthand (string, array, etc.)
			return { false: '', true: variantValue as NormalizedVariantValue };
		}

		const valueKeys = keys(variantValue as Record<string, unknown>);
		const isSlotObjectValue =
			slotKeys.size > 0 &&
			valueKeys.length > 0 &&
			valueKeys.every((k) => k === 'base' || slotKeys.has(k));

		if (isSlotObjectValue) {
			// It's a boolean shorthand with slot object value
			return {
				false: '',
				true: variantValue as Partial<Record<string, ConfigClassValue>>
			};
		}

		if (valueKeys.every((k) => k === 'true' || k === 'false')) {
			// It's a boolean variant record, ensure both keys exist
			return {
				true: '',
				false: '',
				...(variantValue as Record<string, NormalizedVariantValue>)
			};
		}

		// It's a regular variant record
		return variantValue as Record<string, NormalizedVariantValue>;
	};

	const normalizedVariants: Record<
		string,
		Record<string, NormalizedVariantValue>
	> = {};

	for (const [variantKey, variantValue] of entries(variants)) {
		normalizedVariants[variantKey] = normalizeVariantValue(variantValue);
	}

	const variantEntries = entries(normalizedVariants);
	const variantKeys = new Set(keys(normalizedVariants));
	const defaultVariantKeys = new Set(keys(defaultVariants));

	const applyPostProcess = (className: string) =>
		postProcess?.(className) ?? className;

	const hasOnlySlotKeys = (value: object): boolean => {
		for (const key of keys(value)) {
			if (key !== 'base' && !slotKeys.has(key)) {
				return false;
			}
		}

		return true;
	};

	const isSlotObject = (
		value: ResolvedVariantValue<S>
	): value is Partial<Record<SlotKey<S>, ClassValue>> =>
		!!value &&
		typeof value === 'object' &&
		!isArray(value) &&
		hasOnlySlotKeys(value);

	const applyClasses = (
		slotClasses: { base: ClassValue[] } & Record<string, ClassValue[]>,
		value: ResolvedVariantValue<S>
	) => {
		if (isSlotObject(value)) {
			for (const [slotKey, slotValue] of entries(value)) {
				slotClasses[slotKey]?.push(slotValue);
			}
		} else {
			slotClasses.base.push(value);
		}
	};

	// Validate required variants
	for (const variant of requiredVariants) {

		// Check if the required variant exists in variants
		if (!variantKeys.has(variant)) {
			throw new Error(
				`Required variant "${variant}" is not defined in variants`
			);
		}

		// Check if the required variant has a default value
		if (defaultVariantKeys.has(variant)) {
			throw new Error(
				`Required variant "${variant}" cannot have a default value`
			);
		}
	}

	const presetKeys = new Set(keys(presets));

	const resolveVariantValue = (
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

		const presetValue = presetValues?.[variantKey];

		if (presetValue !== undefined) {
			return presetValue;
		}

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
		for (const compound of compoundSlots) {
			if (!matchesCompound(resolvedProps, compound)) {
				continue;
			}

			const compoundClass = compound.class ?? compound.className;

			for (const slotName of compound.slots) {
				slotClasses[slotName]?.push(compoundClass as ClassValue);
			}
		}
	};

	const applyCompoundClasses = (
		slotClasses: { base: ClassValue[] } & Record<string, ClassValue[]>,
		resolvedProps: Record<string, ResolvedVariantValue<S>>
	) => {
		for (const compound of compoundVariants) {
			if (matchesCompound(resolvedProps, compound)) {
				applyClasses(slotClasses, compound.class ?? compound.className);
			}
		}

		applyCompoundSlotsClasses(slotClasses, resolvedProps);
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

			const variantClasses = variantValues[String(variantProp)];

			if (variantClasses === undefined) {
				throw new Error(
					`Invalid value "${variantProp}" for variant "${variantKey}"`
				);
			}

			if (variantClasses !== '') {
				applyClasses(slotClasses, variantClasses);
			}
		}
	};

	const variantFn = (
		props: Props<S, V, RV, P> = {} as Props<S, V, RV, P>
	) => {
		const classProp = props.class ?? props.className;
		const presetValues = resolvePresetValues(
			(props as { preset?: string }).preset
		);

		const resolvedProps: Record<string, ResolvedVariantValue<S>> = {};

		let cacheKey = '';

		// Resolve variant props: explicit prop > preset > default
		for (const variantKey of variantKeys) {
			const value = resolveVariantValue(variantKey, props, presetValues);

			if (value === undefined) {
				continue;
			}

			resolvedProps[variantKey] = value;

			if (!classProp) {
				cacheKey += `${value};`;
			}
		}

		// Skip caching if cacheKey is not available
		if (!classProp) {

			const cacheValue = cache.get(cacheKey);

			// If cache hit, return cached value
			if (cacheValue) {
				return cacheValue;
			}
		}

		// Validate required variants
		for (const variant of requiredVariants) {
			if (resolvedProps[variant] === undefined) {
				throw new Error(`Missing required variant: "${variant}"`);
			}
		}

		const slotClasses: { base: ClassValue[] } & Record<
			string,
			ClassValue[]
		> = {
			base: [baseClassValue]
		};

		// Initialize slot classes
		for (const key of slotKeys) {
			slotClasses[key] = [otherSlots[key]];
		}

		applyResolvedVariantClasses(slotClasses, resolvedProps);
		applyCompoundClasses(slotClasses, resolvedProps);

		// Handle class/className prop, detect slot-specific object
		if (classProp) {
			applyClasses(slotClasses, classProp);
		}

		const result: { base: string } & Record<string, string> = {
			base: ''
		};

		// Process slot classes and apply post-processing if needed
		for (const [slotKey, slotValues] of entries(slotClasses)) {
			result[slotKey] = applyPostProcess(cn(slotValues));
		}

		// If only base slot exists, return it as a string
		if (slotKeys.size === 0) {
			return cacheReturn(cacheKey, result.base);
		}

		return cacheReturn(cacheKey, result);
	};

	const getVariantValues = (key: string) =>
		keys(normalizedVariants[key] ?? {}).map((value) => {

			// Coerce 'true' string as boolean true
			if (value === 'true') {
				return true;
			}

			// Coerce 'false' string as boolean false
			if (value === 'false') {
				return false;
			}

			// Coerce numeric strings to numbers
			if (value !== '' && !Number.isNaN(Number(value))) {
				return Number(value);
			}

			return value;
		});

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