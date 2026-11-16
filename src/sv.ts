import { cn, type ClassValue } from './cn.ts';
import {
	coerceVariantKeyValue,
	compileConfig,
	isConfig,
	isReservedProp,
	isSlotObjectValue
} from './sv/compile.ts';
import { createRun, mergeSlotObjectIntoResult } from './sv/run.ts';
import {
	type AnyFn,
	type CacheValue,
	type CompiledConfig,
	type Config,
	type MaybeGroups,
	type MaybeIntrospection,
	type MaybePresets,
	type MaybeSlots,
	type MaybeVariants,
	type MultiSlots,
	type NonConfigClassArg,
	type NormalizedVariants,
	type RawConfig,
	type RequiredVariants,
	type ResolvedIntrospection,
	type RunFn,
	type RuntimeClassValue,
	type RuntimeProps,
	type SV,
	type SVDefaults,
	type VariantFn
} from './sv/types.ts';

type MultiSlotResult = Record<
	string,
	string | ((props?: RuntimeProps) => string)
>;

type RuntimeVariantFn = (props?: RuntimeProps) => CacheValue | MultiSlotResult;

const { assign, entries, hasOwn, keys } = Object;

const mergeMultiSlotClass = (
	config: CompiledConfig,
	outerClass: RuntimeClassValue | undefined,
	innerClass: RuntimeClassValue,
	slotKey: string
): RuntimeClassValue => {
	const { targetKeys, groups } = config;
	let merged: Record<string, ClassValue> = {};

	if (isSlotObjectValue(outerClass, targetKeys)) {
		// Expanding groups gathers every outer class per slot, in order, so
		// the inner class appended below follows all of them.
		merged = mergeSlotObjectIntoResult({}, outerClass, groups);
	} else if (outerClass !== undefined) {
		// A `base: undefined` key would only add a no-op merge step
		merged.base = outerClass;
	}

	merged[slotKey] = cn(merged[slotKey], innerClass);

	return merged;
};

/**
 * Overrides the outer variant props with the slot function's own, skipping
 * the ones left `undefined` so they keep the outer value, like an omitted
 * prop. The class props are merged separately.
 */
const mergeSlotFnProps = (
	outerProps: RuntimeProps,
	innerProps: RuntimeProps
): RuntimeProps => {
	const mergedProps: RuntimeProps = { ...outerProps };

	for (const key of keys(innerProps)) {
		const value = innerProps[key];

		if (value !== undefined && key !== 'class' && key !== 'className') {
			mergedProps[key] = value;
		}
	}

	return mergedProps;
};

const buildSlotFn =
	(
		config: CompiledConfig,
		run: RunFn,
		outerProps: RuntimeProps,
		slotKey: string
	) =>
	(innerProps: RuntimeProps = {}) => {
		const outerClass = outerProps.class ?? outerProps.className;
		const innerClass = innerProps.class ?? innerProps.className;

		const mergedProps = mergeSlotFnProps(outerProps, innerProps);

		if (innerClass !== undefined) {
			mergedProps.class = mergeMultiSlotClass(
				config,
				outerClass,
				innerClass,
				slotKey
			);
		}

		const result = run(mergedProps);

		if (typeof result === 'string') {
			return result;
		}

		return cn(result[slotKey]);
	};

const applyMultiSlots = (
	config: CompiledConfig,
	run: RunFn,
	props: RuntimeProps,
	result: CacheValue
) => {
	if (typeof result === 'string') {
		return { base: buildSlotFn(config, run, props, 'base') };
	}

	// Overwriting a copied key keeps its place, so slots stay in order.
	const output: MultiSlotResult = { ...result };

	for (const slotKey of config.multiSlots) {
		output[slotKey] = buildSlotFn(config, run, props, slotKey);
	}

	return output;
};

// Multi-slot wrapping is decided once here, so plain variant functions skip it
// on every call.
const createRuntimeVariantFn = (
	config: CompiledConfig,
	run: RunFn
): RuntimeVariantFn => {
	if (config.multiSlots.size === 0) {
		return (props = {}) => run(props);
	}

	return (props = {}) => applyMultiSlots(config, run, props, run(props));
};

const splitVariantProps = (
	variants: NormalizedVariants,
	props: Record<string, unknown>
) => {
	const variantProps: Record<string, unknown> = {};
	const restProps: Record<string, unknown> = {};

	for (const [key, value] of entries(props)) {
		if (isReservedProp(key) || hasOwn(variants, key)) {
			variantProps[key] = value;
		} else {
			restProps[key] = value;
		}
	}

	return [variantProps, restProps] as const;
};

const createVariantFn = (config: CompiledConfig) => {
	const variantFn = createRuntimeVariantFn(config, createRun(config));

	// Conditionally add introspection properties if enabled in config
	if (!config.introspection) {
		return variantFn;
	}

	return assign(variantFn, {
		base: config.base,
		variants: config.originalVariants,
		variantKeys: keys(config.normalizedVariants),
		slots: config.slots,
		slotKeys: [...config.slotKeys],
		groups: config.originalGroups,
		groupKeys: [...config.groups.keys()],
		defaultVariants: config.defaultVariants,
		requiredVariants: config.requiredVariants,
		multiSlots: [...config.multiSlots],
		presets: config.presets,
		presetKeys: keys(config.presets),
		compoundVariants: config.originalCompoundVariants,
		compoundSlots: config.originalCompoundSlots,
		splitProps: (props: Record<string, unknown>) =>
			splitVariantProps(config.normalizedVariants, props),
		getVariantValues: (key: string) =>
			keys(config.normalizedVariants[key] ?? {}).map(
				coerceVariantKeyValue
			),
		getMaxEntries: () => config.maxEntries,
		clearCache: () => config.cache.clear(),
		getCacheSize: () => config.cache.size
	});
};

/**
 * Copies the source's own values onto the target, except `undefined` ones.
 */
const assignDefinedValues = <T extends object>(target: T, source: T) => {
	for (const key in source) {
		const value = source[key];

		if (value !== undefined) {
			target[key] = value;
		}
	}
};

/**
 * Applies a per-call config over the factory defaults. An option left
 * `undefined` keeps its default, like an omitted one.
 */
const mergeConfig = (defaults: RawConfig | undefined, config: RawConfig) => {
	const merged: RawConfig = { ...defaults };

	assignDefinedValues(merged, config);

	return merged;
};

/**
 * Builds a pre-configured `sv()` function whose `defaults` are applied to every
 * config-based call. The defaults accept `base`, `cacheSize`, `postProcess`,
 * `introspection` and boolean `requiredVariants`/`multiSlots`, and are shallow
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
export const createSV = <
	I extends boolean = false,
	DR extends boolean = false,
	DM extends boolean = false
>(
	defaults?: SVDefaults<I, DR, DM>
): SV<I, DR, DM> => {
	// These overloads cover every `SV` signature, so `customSV` is checked
	// against `SV<I>` on return instead of being asserted to it
	function customSV<
		S extends MaybeSlots = undefined,
		G extends MaybeGroups<S> = undefined,
		V extends MaybeVariants<S, G> = undefined,
		P extends MaybePresets<S, G, V> = undefined,
		M extends MultiSlots<S, G> = DM,
		R extends RequiredVariants<V> = DR,
		J extends MaybeIntrospection = undefined
	>(
		...args: [...ClassValue[], Config<S, G, V, P, M, R, J>]
	): VariantFn<S, G, V, P, M, R, ResolvedIntrospection<J, I>>;
	function customSV<const T extends ClassValue[]>(
		...args: T & { [K in keyof T]: NonConfigClassArg<T[K]> }
	): string;
	function customSV(...args: never[]): never;
	function customSV(...args: ClassValue[]): string | AnyFn {
		const last = args.at(-1);

		// Treat this as a `cn()`-style call when no config is provided
		if (!isConfig(last)) {
			return cn(...args);
		}

		return createVariantFn(
			compileConfig(args.slice(0, -1), mergeConfig(defaults, last))
		);
	}

	return customSV;
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