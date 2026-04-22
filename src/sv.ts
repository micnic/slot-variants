import { cn, type ClassValue } from './cn.ts';

type Prettify<T> = {
	[K in keyof T]: T[K];
} & {};

type PartialUndefined<T> = {
	[K in keyof T]?: T[K] | undefined;
};

type StringKeyof<T> = Extract<keyof T, string>;

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

export type VariantValue<
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	T extends (...args: any[]) => unknown,
	K extends keyof VariantProps<T>
> = NonNullable<VariantProps<T>[K]>;

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

		// Skip class/className/slots keys
		if (
			compoundKey === 'class' ||
			compoundKey === 'className' ||
			compoundKey === 'slots'
		) {
			continue;
		}

		const compoundValue = compound[compoundKey];
		const propValue = props[compoundKey];

		if (isArray(compoundValue)) {
			if (!compoundValue.some((value) => looseEquals(value, propValue))) {
				return false;
			}
		} else if (!looseEquals(compoundValue, propValue)) {
			return false;
		}
	}

	return true;
};

/**
 * Creates variant-based class name generator with optional slots support.
 * Inspired by CVA and tailwind-variants.
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
export function sv(...args: ClassValue[]): string;
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

	const cache = new Map<string, string | Record<string, string>>();

	const cacheReturn = <T extends string | Record<string, string>>(
		cacheKey: string | null,
		value: T
	): T => {

		// Only cache if cacheKey is not null
		if (cacheKey) {

			// If cache size limit is reached, delete the oldest entry
			if (cache.size >= cacheSize) {
				const firstKey = cache.keys().next().value;

				// Delete the oldest entry
				if (firstKey) {
					cache.delete(firstKey);
				}
			}

			// Cache the computed value
			cache.set(cacheKey, value);
		}

		return value;
	};

	const { base: baseSlot, ...otherSlots } = slots;

	const baseArgs = isArray(base) ? base : [base];
	const baseClassValue = cn(...baseArgs, configBase, baseSlot);
	const slotKeys = new Set(keys(otherSlots));

	const normalizedVariants: Record<
		string,
		Record<string, NormalizedVariantValue>
	> = {};

	// Normalize variants to ensure consistent structure for processing
	for (const [variantKey, variantValue] of entries(variants)) {
		if (
			variantValue &&
			typeof variantValue === 'object' &&
			!isArray(variantValue)
		) {

			// Distinguish slot-object (only slot keys) from variant record
			const valueKeys = keys(variantValue);
			const isSlotObjectValue =
				slotKeys.size > 0 &&
				valueKeys.length > 0 &&
				valueKeys.every((k) => k === 'base' || slotKeys.has(k));

			if (isSlotObjectValue) {

				// It's a boolean shorthand with slot object value
				normalizedVariants[variantKey] = {
					false: '',
					true: variantValue as Partial<
						Record<string, ConfigClassValue>
					>
				};
			} else if (valueKeys.every((k) => k === 'true' || k === 'false')) {

				// It's a boolean variant record, ensure both keys exist
				normalizedVariants[variantKey] = {
					true: '',
					false: '',
					...variantValue
				};
			} else {

				// It's a regular variant record
				normalizedVariants[variantKey] = variantValue;
			}
		} else {

			// It's a boolean shorthand (string, array, etc.)
			normalizedVariants[variantKey] = { false: '', true: variantValue };
		}
	}

	const variantEntries = entries(normalizedVariants);
	const variantKeys = new Set(keys(normalizedVariants));
	const defaultVariantKeys = new Set(keys(defaultVariants));

	const applyPostProcess = (className: string) =>
		postProcess?.(className) ?? className;

	const isSlotObject = (
		value: ResolvedVariantValue<S>
	): value is Partial<Record<SlotKey<S>, ClassValue>> => {
		if (!value || typeof value !== 'object' || isArray(value)) {
			return false;
		}

		for (const key of keys(value)) {
			if (!(key === 'base' || slotKeys.has(key))) {
				return false;
			}
		}

		return true;
	};

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

	const variantFn = (
		props: Props<S, V, RV, P> = {} as Props<S, V, RV, P>
	) => {
		const classProp = props.class ?? props.className;
		const presetName = (props as { preset?: string }).preset;

		// Resolve preset values
		let presetValues: Record<string, ResolvedVariantValue<S>> | undefined;

		if (presetName !== undefined) {
			if (!presetKeys.has(presetName)) {
				throw new Error(`Invalid preset "${presetName}"`);
			}

			presetValues = (
				presets as Record<string, Record<string, ResolvedVariantValue<S>>>
			)[presetName];
		}

		const resolvedProps: Record<string, ResolvedVariantValue<S>> = {};

		let cacheKey = '';

		// Resolve variant props: explicit prop > preset > default
		for (const variantKey of variantKeys) {

			const propValue = (
				props as Record<string, ResolvedVariantValue<S> | undefined>
			)[variantKey];

			if (propValue === undefined) {
				const presetValue = presetValues?.[variantKey];

				if (presetValue !== undefined) {
					resolvedProps[variantKey] = presetValue;

					if (!classProp) {
						cacheKey += `${presetValue};`;
					}
				} else if (defaultVariantKeys.has(variantKey)) {
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
						resolvedProps[variantKey] = defaultValue(props);
					} else {
						resolvedProps[variantKey] = defaultValue;
					}

					if (!classProp) {
						cacheKey += `${resolvedProps[variantKey]};`;
					}
				}
			} else {
				resolvedProps[variantKey] = propValue;

				if (!classProp) {
					cacheKey += `${propValue};`;
				}
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

		// Apply variant classes
		for (const [variantKey, variantValues] of variantEntries) {

			const variantProp = resolvedProps[variantKey];

			// Skip if variant prop is not defined (undefined or not provided)
			if (variantProp === undefined) {
				continue;
			}

			const variantClasses = variantValues[String(variantProp)];

			// If variant value is invalid, throw an error
			if (variantClasses === undefined) {
				throw new Error(
					`Invalid value "${variantProp}" for variant "${variantKey}"`
				);
			}

			// Apply variant classes if they exist
			if (variantClasses !== '') {
				applyClasses(slotClasses, variantClasses);
			}
		}

		// Apply compound variant classes
		for (const compound of compoundVariants) {
			if (matchesCompound(resolvedProps, compound)) {
				applyClasses(slotClasses, compound.class ?? compound.className);
			}
		}

		// Apply compound slot classes
		for (const compound of compoundSlots) {
			if (matchesCompound(resolvedProps, compound)) {

				const compoundClass = compound.class ?? compound.className;

				for (const slotName of compound.slots) {
					slotClasses[slotName]?.push(compoundClass as ClassValue);
				}
			}
		}

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