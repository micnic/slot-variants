import { cn } from '../cn.ts';
import { getOwn, isPlainObject, resolveNames } from './compile.ts';
import {
	type AnyFn,
	type ConfigClassValue,
	type ExtendInput,
	type RawConfig
} from './types.ts';

type RawVariants = NonNullable<RawConfig['variants']>;

type RawVariant = RawVariants[string];

type RawVariantRecord = Exclude<RawVariant, ConfigClassValue>;

type RawVariantValue = RawVariantRecord[string];

type RawSlotRecord = Exclude<RawVariantValue, ConfigClassValue>;

type MergeValue<T> = (inherited: T, own: T) => T;

const { entries, hasOwn, keys } = Object;

// Each config-based `sv()` result, mapped to the config it was built from.
const configs = new WeakMap<AnyFn, RawConfig>();

/**
 * Remembers the config a variant function was built from, so that other
 * configs can extend it.
 */
export const recordConfig = (variantFn: AnyFn, config: RawConfig) => {
	configs.set(variantFn, config);
};

const getParentConfig = (parent: AnyFn) => {
	const config = configs.get(parent);

	if (config === undefined) {
		throw new Error('extend must be an sv() component');
	}

	return config;
};

const toParentList = (extend: ExtendInput): readonly AnyFn[] => {
	if (typeof extend === 'function') {
		return [extend];
	}

	return extend;
};

/**
 * Tells whether an `extend` value names at least one component.
 */
export const hasParents = (
	extend: ExtendInput | undefined
): extend is ExtendInput =>
	extend !== undefined && toParentList(extend).length > 0;

/**
 * Merges two values that may be missing: a missing side yields the other,
 * otherwise `merge` joins them, inherited value first.
 */
const mergeOptional = <T extends string | object>(
	inherited: T | undefined,
	own: T | undefined,
	merge: MergeValue<T>
) => {
	if (inherited === undefined) {
		return own;
	}

	if (own === undefined) {
		return inherited;
	}

	return merge(inherited, own);
};

/**
 * Builds a merge of two records key by key: a key on one side only is kept,
 * a key on both is merged with `mergeValue`, inherited value first.
 */
const mergeRecords =
	<T>(mergeValue: MergeValue<T>): MergeValue<Readonly<Record<string, T>>> =>
	(inherited, own) => {
		const result: Record<string, T> = { ...inherited };

		for (const [key, ownValue] of entries(own)) {
			// Read as an own key, so names like `toString` are not inherited
			const inheritedValue = getOwn(result, key);

			// An `undefined` value on either side adds nothing to merge
			if (inheritedValue === undefined) {
				result[key] = ownValue;
			} else if (ownValue !== undefined) {
				result[key] = mergeValue(inheritedValue, ownValue);
			}
		}

		return result;
	};

const toSlotRecord = (value: RawVariantValue): RawSlotRecord => {
	if (isPlainObject(value)) {
		return value;
	}

	return { base: value };
};

/**
 * Merges one variant value's classes: two class values are joined, otherwise
 * both become per-slot records, a class value standing for `base`.
 */
const mergeVariantValue = (
	inherited: RawVariantValue,
	own: RawVariantValue
): RawVariantValue => {
	if (!isPlainObject(inherited) && !isPlainObject(own)) {
		return cn(inherited, own);
	}

	return mergeRecords<ConfigClassValue>(cn)(
		toSlotRecord(inherited),
		toSlotRecord(own)
	);
};

// A boolean shorthand stands for its `true` value.
const toVariantRecord = (variant: RawVariant): RawVariantRecord => {
	if (isPlainObject(variant)) {
		return variant;
	}

	return { true: variant };
};

const mergeVariant = (inherited: RawVariant, own: RawVariant): RawVariant =>
	mergeRecords(mergeVariantValue)(
		toVariantRecord(inherited),
		toVariantRecord(own)
	);

const joinUnique = (
	inherited: readonly string[],
	own: readonly string[]
): readonly string[] => [...new Set([...inherited, ...own])];

const keepOwn = <T>(_inherited: T, own: T) => own;

const mergePresetValues = <T extends object>(inherited: T, own: T) => ({
	...inherited,
	...own
});

const getSlotNames = (slots: RawConfig['slots']) => [
	'base',
	...keys(slots ?? {})
];

/**
 * The union of the inherited and own required variants. A variant the own
 * config gives a default stops being required, as it now has a value.
 */
const mergeRequiredVariants = (
	inherited: RawConfig,
	own: RawConfig,
	variants: RawConfig['variants']
) => {
	if (
		inherited.requiredVariants === undefined &&
		own.requiredVariants === undefined
	) {
		return undefined;
	}

	const ownDefaults = own.defaultVariants ?? {};
	const inheritedNames = resolveNames(
		inherited.requiredVariants,
		keys(inherited.variants ?? {})
	).filter((name) => !hasOwn(ownDefaults, name));

	return joinUnique(
		inheritedNames,
		resolveNames(own.requiredVariants, keys(variants ?? {}))
	);
};

const mergeMultiSlots = (
	inherited: RawConfig,
	own: RawConfig,
	slots: RawConfig['slots']
) => {
	if (inherited.multiSlots === undefined && own.multiSlots === undefined) {
		return undefined;
	}

	return joinUnique(
		resolveNames(inherited.multiSlots, getSlotNames(inherited.slots)),
		resolveNames(own.multiSlots, getSlotNames(slots))
	);
};

/**
 * Builds `own` on top of `inherited`: classes are appended after the
 * inherited ones, records are merged and lists joined, and the own
 * behaviour options win when set.
 */
const mergeConfigs = (inherited: RawConfig, own: RawConfig): RawConfig => {
	const variants = mergeOptional(
		inherited.variants,
		own.variants,
		mergeRecords(mergeVariant)
	);
	const slots = mergeOptional(
		inherited.slots,
		own.slots,
		mergeRecords<ConfigClassValue>(cn)
	);

	return {
		base: mergeOptional(inherited.base, own.base, cn),
		slots,
		groups: mergeOptional(
			inherited.groups,
			own.groups,
			mergeRecords(joinUnique)
		),
		multiSlots: mergeMultiSlots(inherited, own, slots),
		variants,
		presets: mergeOptional(
			inherited.presets,
			own.presets,
			mergeRecords(mergePresetValues)
		),
		compoundSlots: mergeOptional(
			inherited.compoundSlots,
			own.compoundSlots,
			(inheritedList, ownList) => [...inheritedList, ...ownList]
		),
		compoundVariants: mergeOptional(
			inherited.compoundVariants,
			own.compoundVariants,
			(inheritedList, ownList) => [...inheritedList, ...ownList]
		),
		defaultVariants: mergeOptional(
			inherited.defaultVariants,
			own.defaultVariants,
			mergeRecords(keepOwn)
		),
		requiredVariants: mergeRequiredVariants(inherited, own, variants),
		cacheSize: own.cacheSize ?? inherited.cacheSize,
		introspection: own.introspection ?? inherited.introspection,
		postProcess: own.postProcess ?? inherited.postProcess
	};
};

/**
 * Merges the configs of the components a config extends, left to right,
 * then the config itself on top, into one config that extends nothing.
 */
export const resolveExtend = (
	config: RawConfig,
	extend: ExtendInput
): RawConfig => {
	let merged: RawConfig = {};

	for (const parent of toParentList(extend)) {
		merged = mergeConfigs(merged, getParentConfig(parent));
	}

	return mergeConfigs(merged, config);
};