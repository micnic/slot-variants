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

type NameList = RawConfig['requiredVariants'] | RawConfig['multiSlots'];

type RawGroups = NonNullable<RawConfig['groups']>;

// Anything a layer holds, down to its class names and option values.
type LayerValue =
	| string
	| number
	| boolean
	| null
	| undefined
	| AnyFn
	| readonly LayerValue[]
	| LayerRecord;

type LayerRecord = { readonly [key: string]: LayerValue };

const { isArray } = Array;
const { entries, fromEntries, keys } = Object;

// Each config-based `sv()` result, mapped to the layers it was built from:
// the own configs of its ancestors, in merge order, then its own.
const layersByFn = new WeakMap<AnyFn, readonly RawConfig[]>();

/**
 * Remembers the layers a variant function was built from, so that other
 * configs can extend it.
 */
export const recordLayers = (
	variantFn: AnyFn,
	layers: readonly RawConfig[]
) => {
	layersByFn.set(variantFn, layers);
};

const getLayers = (parent: AnyFn) => {
	const layers = layersByFn.get(parent);

	if (layers === undefined) {
		throw new Error('extend must be an sv() component');
	}

	return layers;
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

// The slots a slot record key reaches: the group's slots, or the slot itself.
const getTargets = (groups: RawGroups, key: string): readonly string[] =>
	getOwn(groups, key) ?? [key];

/**
 * Adds a slot record's classes to `into` per slot, in key order, a group key
 * standing for its slots.
 */
const addPerSlot = (
	into: RawSlotRecord,
	record: RawSlotRecord,
	groups: RawGroups
) => {
	for (const [key, value] of entries(record)) {
		for (const slot of getTargets(groups, key)) {
			into[slot] = cn(into[slot], value);
		}
	}
};

// A slot record's classes per slot, in key order.
const toPerSlot = (record: RawSlotRecord, groups: RawGroups): RawSlotRecord => {
	const perSlot: RawSlotRecord = {};

	addPerSlot(perSlot, record, groups);

	return perSlot;
};

/**
 * Builds the merge of one variant value's classes: two class values are
 * joined, otherwise both become per-slot records, a class value standing for
 * `base`. Records are joined key by key, which keeps their group keys, unless
 * that leaves a slot with anything but the inherited classes followed by the
 * own ones, each in their own order, in which case both are joined per slot.
 */
const mergeVariantValue =
	(groups: RawGroups): MergeValue<RawVariantValue> =>
	(inherited, own) => {
		if (!isPlainObject(inherited) && !isPlainObject(own)) {
			return cn(inherited, own);
		}

		const inheritedRecord = toSlotRecord(inherited);
		const ownRecord = toSlotRecord(own);
		const joined = mergeRecords<ConfigClassValue>(cn)(
			inheritedRecord,
			ownRecord
		);
		const perSlot = toPerSlot(inheritedRecord, groups);

		addPerSlot(perSlot, ownRecord, groups);

		const joinedPerSlot = toPerSlot(joined, groups);
		const keepsOrder = keys(perSlot).every(
			(slot) => perSlot[slot] === joinedPerSlot[slot]
		);

		if (keepsOrder) {
			return joined;
		}

		return perSlot;
	};

// A boolean shorthand stands for its `true` value.
const toVariantRecord = (variant: RawVariant): RawVariantRecord => {
	if (isPlainObject(variant)) {
		return variant;
	}

	return { true: variant };
};

const mergeVariant =
	(groups: RawGroups): MergeValue<RawVariant> =>
	(inherited, own) =>
		mergeRecords(mergeVariantValue(groups))(
			toVariantRecord(inherited),
			toVariantRecord(own)
		);

const joinUnique = (
	inherited: readonly string[],
	own: readonly string[]
): readonly string[] => [...new Set([...inherited, ...own])];

const keepOwn = <T>(_inherited: T, own: T) => own;

const concatLists = <T>(inherited: readonly T[], own: readonly T[]) => [
	...inherited,
	...own
];

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
	ownRequired: readonly string[]
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
	).filter((name) => getOwn(ownDefaults, name) === undefined);

	return joinUnique(inheritedNames, ownRequired);
};

/**
 * The inherited default variants, without the ones the own config requires,
 * as a required variant has no default.
 */
const getInheritedDefaults = (
	inherited: RawConfig,
	ownRequired: readonly string[]
): RawConfig['defaultVariants'] => {
	const { defaultVariants } = inherited;

	if (defaultVariants === undefined) {
		return undefined;
	}

	return fromEntries(
		entries(defaultVariants).filter(([key]) => !ownRequired.includes(key))
	);
};

/**
 * Moves the own base classes to the front of the own base slot when the
 * inherited config has a base slot, so they follow it: base classes are
 * otherwise placed ahead of the base slot.
 */
const placeOwnBase = (inherited: RawConfig, own: RawConfig): RawConfig => {
	if (inherited.slots?.base === undefined || own.base === undefined) {
		return own;
	}

	return {
		...own,
		base: undefined,
		slots: { ...own.slots, base: cn(own.base, own.slots?.base) }
	};
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

const mergeGroups = (
	inherited: RawConfig['groups'],
	own: RawConfig['groups']
) => mergeOptional(inherited, own, mergeRecords(joinUnique));

/**
 * Builds `own` on top of `inherited`: classes are appended after the
 * inherited ones, records are merged and lists joined, and the own
 * behaviour options win when set. `allGroups` holds the groups of every
 * layer being merged, as a group key of a variant value stands for the slots
 * the group ends up with, those a later layer adds included.
 */
const mergeConfigs = (
	inherited: RawConfig,
	config: RawConfig,
	allGroups: RawGroups
): RawConfig => {
	const own = placeOwnBase(inherited, config);
	const groups = mergeGroups(inherited.groups, own.groups);
	const variants = mergeOptional(
		inherited.variants,
		own.variants,
		mergeRecords(mergeVariant(allGroups))
	);
	const slots = mergeOptional(
		inherited.slots,
		own.slots,
		mergeRecords<ConfigClassValue>(cn)
	);
	const ownRequired = resolveNames(
		own.requiredVariants,
		keys(variants ?? {})
	);

	return {
		base: mergeOptional(inherited.base, own.base, cn),
		slots,
		groups,
		multiSlots: mergeMultiSlots(inherited, own, slots),
		variants,
		presets: mergeOptional(
			inherited.presets,
			own.presets,
			mergeRecords(mergeRecords(keepOwn))
		),
		compoundSlots: mergeOptional(
			inherited.compoundSlots,
			own.compoundSlots,
			concatLists
		),
		compoundVariants: mergeOptional(
			inherited.compoundVariants,
			own.compoundVariants,
			concatLists
		),
		defaultVariants: mergeOptional(
			getInheritedDefaults(inherited, ownRequired),
			own.defaultVariants,
			mergeRecords(keepOwn)
		),
		requiredVariants: mergeRequiredVariants(inherited, own, ownRequired),
		cacheSize: own.cacheSize ?? inherited.cacheSize,
		introspection: own.introspection ?? inherited.introspection,
		postProcess: own.postProcess ?? inherited.postProcess
	};
};

const isSameList = (
	first: readonly LayerValue[],
	second: readonly LayerValue[]
): boolean =>
	first.length === second.length &&
	first.every((item, index) => isSameValue(item, second[index]));

const isSameRecord = (first: LayerRecord, second: LayerRecord): boolean => {
	const firstKeys = keys(first);

	return (
		firstKeys.length === keys(second).length &&
		firstKeys.every((key) => isSameValue(first[key], getOwn(second, key)))
	);
};

/**
 * Whether two layer values hold the same thing: the very same value, or lists
 * and records of the same values. Functions are the same only by identity.
 */
const isSameValue = (first: LayerValue, second: LayerValue): boolean => {
	if (first === second) {
		return true;
	}

	if (typeof first === 'function' || typeof second === 'function') {
		return false;
	}

	if (isArray(first) && isArray(second)) {
		return isSameList(first, second);
	}

	if (isPlainObject(first) && isPlainObject(second)) {
		return isSameRecord(first, second);
	}

	return false;
};

/**
 * The layers of the components a config extends, left to right, each layer
 * once: an ancestor two parents share is merged where it first appears. Two
 * layers with the same config count as one, as their types can't be told
 * apart either.
 */
export const getParentLayers = (extend: ExtendInput): RawConfig[] => {
	const layers: RawConfig[] = [];

	for (const parent of toParentList(extend)) {
		for (const layer of getLayers(parent)) {
			if (!layers.some((known) => isSameValue(known, layer))) {
				layers.push(layer);
			}
		}
	}

	return layers;
};

/**
 * Merges layers in order into one config that extends nothing.
 */
export const mergeLayers = (layers: readonly RawConfig[]): RawConfig => {
	let allGroups: RawConfig['groups'];

	for (const layer of layers) {
		allGroups = mergeGroups(allGroups, layer.groups);
	}

	let merged: RawConfig = {};

	for (const layer of layers) {
		merged = mergeConfigs(merged, layer, allGroups ?? {});
	}

	return merged;
};

const resolveOwnNames = (names: NameList, all: readonly string[]) => {
	if (names === undefined) {
		return undefined;
	}

	return resolveNames(names, all);
};

// Multi slot names as the slots they cover: a group stands for its slots as
// they are now, so the slots a later config adds to it aren't covered.
const resolveMultiSlots = (names: NameList, resolved: RawConfig) => {
	if (names === undefined) {
		return undefined;
	}

	const groups = resolved.groups ?? {};

	return resolveNames(names, getSlotNames(resolved.slots)).flatMap(
		(name) => getOwn(groups, name) ?? [name]
	);
};

/**
 * A config as a layer other configs merge, without the parents it names, as
 * their layers are kept beside it: its `true` required variants and
 * its multi slots named, as they cover only what it had, and its
 * introspection resolved, left unset when nothing sets it so that a config
 * extending it falls back to an earlier parent or its own factory default.
 */
export const toLayer = (own: RawConfig, resolved: RawConfig): RawConfig => ({
	...own,
	extend: undefined,
	requiredVariants: resolveOwnNames(
		own.requiredVariants,
		keys(resolved.variants ?? {})
	),
	multiSlots: resolveMultiSlots(own.multiSlots, resolved),
	introspection: resolved.introspection
});