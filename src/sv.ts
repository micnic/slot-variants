import { cn, type ClassValue } from './cn.ts';
import {
	coerceVariantKeyValue,
	compileConfig,
	isConfig,
	isReservedProp
} from './sv/compile.ts';
import { createExplain } from './sv/explain.ts';
import { hasParents, recordConfig, resolveExtend } from './sv/extend.ts';
import { createRun, createRunPlan, getClassBySlot } from './sv/run.ts';
import {
	type AnyFn,
	type CacheValue,
	type CompiledConfig,
	type Config,
	type ExtendedGroups,
	type ExtendedSlots,
	type ExtendedVariantFn,
	type ExtendedVariants,
	type ExtendInput,
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
	type RunFn,
	type RuntimeClassValue,
	type RuntimeProps,
	type StringKeyof,
	type SV,
	type SVDefaults
} from './sv/types.ts';

type MultiSlotResult = Record<
	string,
	string | ((props?: RuntimeProps) => string)
>;

type RuntimeVariantFn = (props?: RuntimeProps) => CacheValue | MultiSlotResult;

type ResolvedCall = { baseArgs: ClassValue[]; config: RawConfig };

const { assign, entries, hasOwn, keys } = Object;

const mergeMultiSlotClass = (
	config: CompiledConfig,
	outerClass: RuntimeClassValue | undefined,
	innerClass: RuntimeClassValue,
	slotKey: string
): RuntimeClassValue => {
	// Expanding groups gathers every outer class per slot, in order, so the
	// inner class appended below follows all of them.
	const merged = getClassBySlot(config, outerClass);

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

// Reads one slot's class from a variant function result.
const readSlot = (result: CacheValue, slotKey: string): string => {
	if (typeof result === 'string') {
		return result;
	}

	return cn(result[slotKey]);
};

// `outerResult` is the outer call's result, which a slot function called
// without props reads from instead of running the variant function again.
const buildSlotFn =
	(
		config: CompiledConfig,
		run: RunFn,
		outerProps: RuntimeProps,
		outerResult: CacheValue,
		slotKey: string
	) =>
	(innerProps?: RuntimeProps) => {
		if (innerProps === undefined) {
			return readSlot(outerResult, slotKey);
		}

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

		return readSlot(run(mergedProps), slotKey);
	};

const applyMultiSlots = (
	config: CompiledConfig,
	run: RunFn,
	props: RuntimeProps,
	result: CacheValue
) => {
	if (typeof result === 'string') {
		return { base: buildSlotFn(config, run, props, result, 'base') };
	}

	// Overwriting a copied key keeps its place, so slots stay in order.
	const output: MultiSlotResult = { ...result };

	for (const slotKey of config.multiSlots) {
		output[slotKey] = buildSlotFn(config, run, props, result, slotKey);
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
	const plan = createRunPlan(config);
	const variantFn = createRuntimeVariantFn(config, createRun(config, plan));

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
		explain: createExplain(config, plan),
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
 * Folds the base args into the config's `base`, ahead of its own classes.
 */
const foldBaseArgs = (baseArgs: ClassValue[], config: RawConfig): RawConfig => {
	if (baseArgs.length === 0) {
		return config;
	}

	return { ...config, base: cn(...baseArgs, config.base) };
};

/**
 * Resolves what a call compiles: its base args and its config over the
 * factory defaults, with the configs of the components it extends merged in
 * first. Base args then count as the config's own `base`, so they follow the
 * inherited base classes.
 */
const resolveCall = (
	defaults: RawConfig | undefined,
	baseArgs: ClassValue[],
	config: RawConfig
): ResolvedCall => {
	const { extend } = config;

	if (!hasParents(extend)) {
		return { baseArgs, config: mergeConfig(defaults, config) };
	}

	const own = foldBaseArgs(baseArgs, config);

	// These two are joined with the inherited ones rather than replacing
	// them, so their defaults belong to the config's own side.
	const { requiredVariants, multiSlots } = defaults ?? {};
	const ownWithDefaults = mergeConfig({ requiredVariants, multiSlots }, own);

	return {
		baseArgs: [],
		config: mergeConfig(defaults, resolveExtend(ownWithDefaults, extend))
	};
};

/**
 * The config a component extending this one inherits: base args folded into
 * `base`, and the introspection it resolved to.
 */
const toInheritedConfig = ({ baseArgs, config }: ResolvedCall): RawConfig => ({
	...foldBaseArgs(baseArgs, config),
	introspection: config.introspection ?? false
});

const buildVariantFn = (
	defaults: RawConfig | undefined,
	baseArgs: ClassValue[],
	config: RawConfig
) => {
	const call = resolveCall(defaults, baseArgs, config);
	const variantFn = createVariantFn(
		compileConfig(call.baseArgs, call.config)
	);

	recordConfig(variantFn, toInheritedConfig(call));

	return variantFn;
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
		J extends MaybeIntrospection = undefined,
		const E extends ExtendInput | undefined = undefined,
		D extends StringKeyof<ExtendedVariants<E, S, G, V>> = never
	>(
		...args: [...ClassValue[], Config<S, G, V, P, M, R, J, E, D>]
	): ExtendedVariantFn<S, G, V, P, M, R, J, E, D, I>;
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

		return buildVariantFn(defaults, args.slice(0, -1), last);
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