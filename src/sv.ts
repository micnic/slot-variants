import { cn, type ClassValue } from './cn.ts';

type Prettify<T> = {
	[K in keyof T]: T[K];
} & {};

type PartialUndefined<T> = {
	[K in keyof T]?: T[K] | undefined;
};

type StringKeyof<T> = Extract<keyof T, string>;

type SVClassValue<S extends SVSlots | undefined> = S extends SVSlots
	? SlotsClassValue<S> | ClassValue
	: ClassValue;

type ClassProp<S extends SVSlots | undefined = undefined> =
	| { class?: SVClassValue<S>; className?: never }
	| { class?: never; className?: SVClassValue<S> };

type SVSlots = { base?: ClassValue } & Record<string, ClassValue>;

type BooleanString<T> = T extends 'true' | 'false' ? boolean : T;

type SVSlotKey<S> = 'base' | StringKeyof<S>;

type SlotsClassValue<S extends SVSlots> = Partial<
	Record<SVSlotKey<S>, ClassValue>
>;

type SVVariants<S extends SVSlots | undefined> = Record<
	string,
	Record<string | number, SVClassValue<S>> | SVClassValue<S>
>;

type SVVariantConditions<
	S extends SVSlots | undefined,
	V extends SVVariants<S> | undefined
> = {
	[K in StringKeyof<V>]?:
		| SVVariantPropType<V[K], S>
		| SVVariantPropType<V[K], S>[]
		| undefined;
};

type SVCompoundVariants<
	S extends SVSlots | undefined,
	V extends SVVariants<S> | undefined
> = (SVVariantConditions<S, V> & ClassProp<S>)[];

type SVCompoundSlots<
	S extends SVSlots | undefined,
	V extends SVVariants<S> | undefined
> = ({
	slots: SVSlotKey<S>[];
} & SVVariantConditions<S, V> &
	ClassProp<S>)[];

type IsBooleanShorthand<T, S extends SVSlots | undefined> =
	T extends Record<string, unknown>
		? [Extract<keyof T, number>] extends [never]
			? S extends SVSlots
				? StringKeyof<T> extends SVSlotKey<S>
					? true
					: StringKeyof<T> extends 'true' | 'false'
						? true
						: false
				: StringKeyof<T> extends 'true' | 'false'
					? true
					: false
			: false
		: true;

type SVVariantPropType<T, S extends SVSlots | undefined> =
	IsBooleanShorthand<T, S> extends true
		? boolean
		: T extends Record<string | number, unknown>
			? BooleanString<StringKeyof<T>> | Extract<keyof T, number>
			: boolean;

type SVVariantProps<
	S extends SVSlots | undefined,
	V extends SVVariants<S> | undefined
> = { [K in StringKeyof<V>]: SVVariantPropType<V[K], S> };

type SVDefaultVariantFn<
	S extends SVSlots | undefined,
	V extends SVVariants<S> | undefined,
	K extends StringKeyof<V>
> = (
	props: Partial<SVVariantProps<S, V>>
) => SVVariantPropType<V[K], S> | undefined;

type SVDefaultVariants<
	S extends SVSlots | undefined,
	V extends SVVariants<S> | undefined,
	RV extends StringKeyof<V>[]
> = {
	[K in StringKeyof<Omit<SVVariantProps<S, V>, RV[number]>>]?:
		| SVVariantPropType<V[K], S>
		| SVDefaultVariantFn<S, V, K>
		| undefined;
};

type SVProps<
	S extends SVSlots | undefined,
	V extends SVVariants<S> | undefined,
	RV extends StringKeyof<V>[]
> = V extends undefined
	? ClassProp<S>
	: Prettify<
			Pick<SVVariantProps<S, V>, RV[number]> &
				Omit<PartialUndefined<SVVariantProps<S, V>>, RV[number]>
		> &
			ClassProp<S>;

type SVConfig<
	S extends SVSlots | undefined,
	V extends SVVariants<S> | undefined,
	RV extends StringKeyof<V>[]
> = {
	variants?: V | undefined;
	slots?: S | undefined;
	compoundVariants?: SVCompoundVariants<S, V> | undefined;
	compoundSlots?: SVCompoundSlots<S, V> | undefined;
	defaultVariants?: SVDefaultVariants<S, V, RV> | undefined;
	requiredVariants?: RV | undefined;
	cacheSize?: number | undefined;
	postProcess?: ((className: string) => string) | undefined;
};

type SVReturnValue<S extends SVSlots | undefined> = S extends undefined
	? string
	: Prettify<Record<SVSlotKey<S>, string>>;

type SVReturnFn<
	S extends SVSlots | undefined,
	V extends SVVariants<S> | undefined,
	RV extends StringKeyof<V>[]
> = RV extends []
	? (props?: SVProps<S, V, RV> | undefined) => SVReturnValue<S>
	: (props: SVProps<S, V, RV>) => SVReturnValue<S>;

type SVReturnType<
	S extends SVSlots | undefined,
	V extends SVVariants<S> | undefined,
	RV extends StringKeyof<V>[]
> = SVReturnFn<S, V, RV> & {
	variants: V;
	variantKeys: StringKeyof<V>[];
	slots: S;
	slotKeys: S extends SVSlots ? SVSlotKey<S>[] : ['base'];
	defaultVariants: SVDefaultVariants<S, V, RV>;
	requiredVariants: RV;
	clearCache: () => void;
	getCacheSize: () => number;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type VariantProps<T extends (...args: any[]) => unknown> = Prettify<
	Omit<Exclude<Parameters<T>[0], undefined>, 'class' | 'className'>
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
export function sv(base: ClassValue): string;
export function sv<
	S extends SVSlots | undefined = undefined,
	V extends SVVariants<S> | undefined = undefined,
	RV extends StringKeyof<V>[] | [] = []
>(base: ClassValue, config: SVConfig<S, V, RV>): SVReturnType<S, V, RV>;
export function sv<
	S extends SVSlots | undefined = undefined,
	V extends SVVariants<S> | undefined = undefined,
	RV extends StringKeyof<V>[] | [] = []
>(
	base: ClassValue,
	config?: SVConfig<S, V, RV> | undefined
): string | SVReturnType<S, V, RV> {

	// If no config provided, just return the base
	if (!config) {
		return cn(base);
	}

	const {
		variants = {},
		slots = {},
		compoundVariants = [],
		compoundSlots = [],
		defaultVariants = {} as SVDefaultVariants<S, V, RV>,
		requiredVariants = [],
		cacheSize = 256,
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

	const baseClassValue = cn(base, baseSlot);
	const slotKeys = new Set(keys(otherSlots));

	const normalizedVariants: Record<string, Record<string, unknown>> = {};

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
					true: variantValue
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

	const defaultVariantKeys = new Set(keys(defaultVariants));
	const variantEntries = entries(normalizedVariants);
	const variantKeysSet = new Set(keys(normalizedVariants));

	const applyPostProcess = (className: string) =>
		postProcess?.(className) ?? className;

	const isSlotObject = (
		value: unknown
	): value is Partial<Record<SVSlotKey<S>, ClassValue>> => {
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
		value: unknown
	) => {
		if (isSlotObject(value)) {
			for (const [slotKey, slotValue] of entries(value)) {
				slotClasses[slotKey]?.push(slotValue);
			}
		} else {
			slotClasses.base.push(value as ClassValue);
		}
	};

	const getCacheKey = (
		mergedProps: Record<
			string,
			ClassValue | Partial<Record<SVSlotKey<S>, ClassValue>>
		>,
		classProp:
			| ClassValue
			| Partial<Record<SVSlotKey<S>, ClassValue>>
			| undefined
	) => {
		if (classProp) {
			return null;
		}

		return variantEntries.reduce(
			(key, [variantKey]) => key + mergedProps[variantKey] + ';',
			''
		);
	};

	// Validate required variants
	for (const variant of requiredVariants) {

		// Check if the required variant exists in variants
		if (!variantKeysSet.has(variant)) {
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

	const variantFn = (props: SVProps<S, V, RV> = {} as SVProps<S, V, RV>) => {

		const filteredProps: Record<string, unknown> = {};

		// Strip undefined props so they don't override defaults
		for (const key of keys(props)) {

			const value = (props as Record<string, unknown>)[key];

			// Only include defined props
			if (value !== undefined) {
				filteredProps[key] = value;
			}
		}

		const resolvedDefaults: Record<string, unknown> = {};

		// Resolve default variants
		for (const key of defaultVariantKeys) {
			if (filteredProps[key] === undefined) {

				const value = (defaultVariants as Record<string, unknown>)[key];

				// Check for conditional default variant function
				if (typeof value === 'function') {

					const resolvedValue = value(
						filteredProps as Partial<SVVariantProps<S, V>>
					);

					// Only include resolved default if it's defined
					if (resolvedValue !== undefined) {
						resolvedDefaults[key] = resolvedValue;
					}
				} else if (value !== undefined) {
					resolvedDefaults[key] = value;
				}
			}
		}

		const mergedProps = {
			...resolvedDefaults,
			...filteredProps
		} as Record<
			string,
			ClassValue | Partial<Record<SVSlotKey<S>, ClassValue>>
		>;

		const classProp = mergedProps.class ?? mergedProps.className;
		const cacheKey = getCacheKey(mergedProps, classProp);

		// Skip caching if cacheKey is null
		if (cacheKey !== null) {

			const cacheValue = cache.get(cacheKey);

			// If cache hit, return cached value
			if (cacheValue) {
				return cacheValue;
			}
		}

		// Validate required variants
		for (const variant of requiredVariants) {
			if (mergedProps[variant] === undefined) {
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

			const variantProp = mergedProps[variantKey];

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
			if (matchesCompound(mergedProps, compound)) {
				applyClasses(slotClasses, compound.class ?? compound.className);
			}
		}

		// Apply compound slot classes
		for (const compound of compoundSlots) {
			if (matchesCompound(mergedProps, compound)) {

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

	return assign(variantFn, {
		variants,
		variantKeys: keys(variants),
		slots,
		slotKeys: ['base', ...slotKeys],
		defaultVariants,
		requiredVariants,
		clearCache: () => cache.clear(),
		getCacheSize: () => cache.size
	}) as SVReturnType<S, V, RV>;
}