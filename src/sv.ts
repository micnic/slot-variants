import { cn, type ClassValue } from './cn.ts';
import {
	coerceVariantKeyValue,
	compileConfig,
	isConfig,
	isReservedProp,
	isSlotObjectValue
} from './sv/compile.ts';
import { createRun } from './sv/run.ts';
import {
	type AnyFn,
	type CacheValue,
	type CompiledConfig,
	type Config,
	type MaybeGroups,
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
	type SV,
	type VariantFn
} from './sv/types.ts';

type MultiSlotResult = Record<
	string,
	string | ((props?: RuntimeProps) => string)
>;

type RuntimeVariantFn = (props?: RuntimeProps) => CacheValue | MultiSlotResult;

const { assign, entries, hasOwn, keys } = Object;

const mergeMultiSlotClass = (
	targetKeys: ReadonlySet<string>,
	outerClass: RuntimeClassValue | undefined,
	innerClass: RuntimeClassValue,
	slotKey: string
): RuntimeClassValue => {
	const merged: Record<string, ClassValue> = {};

	if (isSlotObjectValue(outerClass, targetKeys)) {
		assign(merged, outerClass);
	} else {
		merged.base = outerClass;
	}

	merged[slotKey] = cn(merged[slotKey], innerClass);

	return merged;
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

		const mergedProps: RuntimeProps = { ...outerProps, ...innerProps };

		if (innerClass !== undefined) {
			mergedProps.class = mergeMultiSlotClass(
				config.targetKeys,
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
	const output: MultiSlotResult = {};

	if (typeof result === 'string') {
		output.base = buildSlotFn(config, run, props, 'base');

		return output;
	}

	for (const [slotKey, slotValue] of entries(result)) {
		if (config.multiSlots.has(slotKey)) {
			output[slotKey] = buildSlotFn(config, run, props, slotKey);
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
const countMaxEntries = (config: CompiledConfig) => {
	const requiredVariants = new Set(config.requiredVariants);
	const { defaultVariants } = config;

	let count = 1;

	for (const { key, unsetId: valueCount } of config.variantData) {
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

	// The combination count never changes, so it is computed on first use only
	let maxEntries: number | undefined;

	return assign(variantFn, {
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
		splitProps: (props: Record<string, unknown>) =>
			splitVariantProps(config.normalizedVariants, props),
		getVariantValues: (key: string) =>
			keys(config.normalizedVariants[key] ?? {}).map(
				coerceVariantKeyValue
			),
		getMaxEntries: () => {
			if (maxEntries === undefined) {
				maxEntries = countMaxEntries(config);
			}

			return maxEntries;
		},
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
	// These overloads cover every `SV` signature, so `customSV` is checked
	// against `SV<I>` on return instead of being asserted to it
	function customSV<
		S extends MaybeSlots = undefined,
		G extends MaybeGroups<S> = undefined,
		V extends MaybeVariants<S, G> = undefined,
		P extends MaybePresets<S, G, V> = undefined,
		M extends MultiSlots<S, G> = false,
		R extends RequiredVariants<V> = false,
		J extends boolean = I
	>(
		...args: [...ClassValue[], Config<S, G, V, P, M, R, J>]
	): VariantFn<S, G, V, P, M, R, J>;
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
			compileConfig(args.slice(0, -1), { ...defaults, ...last })
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