import { cn, type ClassValue } from '../cn.ts';
import {
	type CacheReturn,
	type CompiledCompound,
	type CompiledConfig,
	type CompiledGroups,
	type CompoundMatcher,
	type CompoundSlotFragment,
	type ConfigClassValue,
	type MaybeSlots,
	type NormalizedVariantValue,
	type NormalizedVariantValues,
	type NormalizedVariants,
	type RawConfig,
	type ResolvedVariantState,
	type RuntimeDefaultVariant,
	type RuntimeGroups,
	type RuntimeVariantValue,
	type SlotClasses,
	type SlotEntry,
	type SlotValue,
	type Slots,
	type VariantCache,
	type VariantData,
	type Variants
} from './types.ts';

type RuntimeVariantConfigValue = ConfigClassValue | NormalizedVariantValues;

type CacheState = {
	cache: VariantCache;
	cacheReturn: CacheReturn;
};

type ApplySlotClasses = (slotClasses: SlotClasses) => void;

type VariantLayout = {
	variantData: readonly VariantData[];
	combinationCount: number;
	maxEntries: number;
};

type NameList = boolean | readonly string[] | undefined;

type CompoundEntry = Record<string, unknown> & {
	preset?: string | undefined;
};

const { isArray } = Array;
const { entries, hasOwn, keys } = Object;

const defaultCacheSize = 256;

const createCache = (cacheSize: number) => {
	const cache: VariantCache = new Map();

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
	} satisfies CacheState;
};

/**
 * Checks for the prop keys that every variant function reads besides its
 * variants.
 */
export const isReservedProp = (key: string) =>
	key === 'class' || key === 'className' || key === 'preset';

// The keys a compound entry reads besides its matchers, which a variant
// therefore can't be named.
const isReservedKey = (key: string) => key === 'slots' || isReservedProp(key);

// A variant value is known by its string form, the same way runtime props are
// looked up.
const hasVariantValue = (
	variantValues: NormalizedVariantValues,
	value: RuntimeVariantValue
) => hasOwn(variantValues, `${value}`);

// A compound matcher value's lookup key, once it is known to name one of the
// variant's values.
const toExpectedValue = (
	variant: string,
	value: unknown,
	variantValues: NormalizedVariantValues
) => {
	if (
		(typeof value !== 'string' &&
			typeof value !== 'number' &&
			typeof value !== 'boolean') ||
		!hasVariantValue(variantValues, value)
	) {
		throw new Error(
			`Compound matcher for variant "${variant}" has invalid value "${value}"`
		);
	}

	return `${value}`;
};

const resolveCompoundMatcherExpected = (
	variant: string,
	value: unknown,
	variantValues: NormalizedVariantValues
): CompoundMatcher => {
	if (!isArray(value)) {
		return new Set([toExpectedValue(variant, value, variantValues)]);
	}

	if (value.length === 0) {
		throw new Error(
			`Compound matcher for variant "${variant}" must list at least one value`
		);
	}

	const expected = new Set<string>();

	for (const item of value) {
		expected.add(toExpectedValue(variant, item, variantValues));
	}

	return expected;
};

/**
 * A record's own value for `key`. Config records and props are plain objects,
 * so a lookup alone would read `Object.prototype` members (`toString`).
 */
export const getOwn = <T>(record: Record<string, T>, key: string) => {
	if (!hasOwn(record, key)) {
		return undefined;
	}

	return record[key];
};

// A record's own value for `key`, or the given error when there is none.
export const getOwnOrThrow = <T>(
	record: Record<string, T>,
	key: string,
	errorMessage: string
): T => {
	const value = getOwn(record, key);

	if (value === undefined) {
		throw new Error(errorMessage);
	}

	return value;
};

const seedPresetMatchers = (
	matchers: Map<string, CompoundMatcher>,
	presets: Record<string, ResolvedVariantState>,
	preset: string | undefined
) => {
	if (preset === undefined) {
		return;
	}

	const presetValues = getOwnOrThrow(
		presets,
		preset,
		`Compound matcher references unknown preset "${preset}"`
	);

	for (const [variant, value] of entries(presetValues)) {
		if (value !== undefined) {
			matchers.set(variant, new Set([`${value}`]));
		}
	}
};

const compileCompoundMatchers = (
	compound: CompoundEntry,
	normalizedVariants: NormalizedVariants,
	presets: Record<string, ResolvedVariantState>
): ReadonlyMap<string, CompoundMatcher> => {
	const matchers = new Map<string, CompoundMatcher>();

	seedPresetMatchers(matchers, presets, compound.preset);

	for (const [compoundKey, value] of entries(compound)) {
		// A matcher left `undefined` is the same as an omitted one.
		if (isReservedKey(compoundKey) || value === undefined) {
			continue;
		}

		const variantValues = getOwnOrThrow(
			normalizedVariants,
			compoundKey,
			`Compound matcher references unknown variant "${compoundKey}"`
		);

		matchers.set(
			compoundKey,
			resolveCompoundMatcherExpected(compoundKey, value, variantValues)
		);
	}

	return matchers;
};

/**
 * Narrows a value to its object members, excluding `null` and arrays.
 */
export const isPlainObject = <T>(
	value: T
): value is Exclude<Extract<T, object>, readonly unknown[]> =>
	value !== null && typeof value === 'object' && !isArray(value);

const isBooleanVariantRecord = (variantValue: NormalizedVariantValues) =>
	keys(variantValue).every((key) => key === 'true' || key === 'false');

const withoutUndefinedValues = (variantValues: NormalizedVariantValues) => {
	const result: NormalizedVariantValues = {};

	for (const [valueKey, value] of entries(variantValues)) {
		result[valueKey] = value ?? '';
	}

	return result;
};

const normalizeVariantValue = (variantValue: RuntimeVariantConfigValue) => {
	if (!isPlainObject(variantValue)) {
		return {
			false: '',
			true: variantValue ?? ''
		} satisfies NormalizedVariantValues;
	}

	if (isBooleanVariantRecord(variantValue)) {
		return {
			true: '',
			false: '',
			...withoutUndefinedValues(variantValue)
		} satisfies NormalizedVariantValues;
	}

	const result = withoutUndefinedValues(variantValue);

	// A record mixing a boolean key with named ones takes both booleans; the
	// one it doesn't name follows the written keys and applies nothing.
	if (hasOwn(result, 'true') || hasOwn(result, 'false')) {
		return {
			...result,
			true: result.true ?? '',
			false: result.false ?? ''
		} satisfies NormalizedVariantValues;
	}

	return result;
};

export const coerceVariantKeyValue = (value: string) => {
	if (value === 'true') {
		return true;
	}

	if (value === 'false') {
		return false;
	}

	const numericValue = Number(value);

	if (!Number.isFinite(numericValue) || `${numericValue}` !== value) {
		return value;
	}

	return numericValue;
};

/**
 * Tells whether `sv()`'s last argument is its config: a plain object that
 * defines `slots` or `variants`. Anything else is a class value.
 */
export const isConfig = (value: ClassValue | RawConfig): value is RawConfig =>
	isPlainObject(value) &&
	(value.slots !== undefined || value.variants !== undefined);

const createNormalizedVariants = <S extends MaybeSlots>(
	variants: Variants<S, undefined>
) => {
	const result: NormalizedVariants = {};

	for (const [variantKey, variantValue] of entries(variants)) {
		if (isReservedKey(variantKey)) {
			throw new Error(`Variant name "${variantKey}" is reserved`);
		}

		result[variantKey] = normalizeVariantValue(variantValue);
	}

	return result;
};

/**
 * Numbers each variant's values, so a combination of resolved values maps to a
 * single cache key: the sum of every value id times its variant's stride, with
 * each variant spanning its value count plus one for the unset state.
 *
 * Also counts the distinct combinations a call can produce, which is the most
 * entries the cache can ever hold. That count drops the unset state only for a
 * required variant, which can never be left unset. A default doesn't drop it:
 * passing `null` skips the default, and a function default may return
 * `undefined`.
 */
const createVariantData = (
	normalizedVariants: NormalizedVariants,
	defaultVariants: Record<string, RuntimeDefaultVariant>,
	requiredVariants: readonly string[]
): VariantLayout => {
	const required = new Set(requiredVariants);

	let stride = 1;
	let maxEntries = 1;

	const variantData = entries(normalizedVariants).map(
		([variantKey, variantValues]) => {
			const valueKeys = keys(variantValues);
			const variant: VariantData = {
				key: variantKey,
				valueIds: new Map(
					valueKeys.map((valueKey, id) => [valueKey, id])
				),
				unsetId: valueKeys.length,
				stride,
				values: variantValues,
				defaultValue: getOwn(defaultVariants, variantKey),
				inherited: variantKey in Object.prototype
			};

			stride *= valueKeys.length + 1;

			if (required.has(variantKey)) {
				maxEntries *= valueKeys.length;
			} else {
				maxEntries *= valueKeys.length + 1;
			}

			return variant;
		}
	);

	// Strides only grow, so the final one is the largest key plus one.
	return { variantData, combinationCount: stride, maxEntries };
};

/**
 * The names a name list stands for: `true` names every one of `all`, `false`
 * or unset none.
 */
export const resolveNames = (names: NameList, all: readonly string[]) => {
	if (names === true) {
		return all;
	}

	if (isArray(names)) {
		return names;
	}

	return [];
};

/**
 * The slots a target key names: the slot itself, or every slot of its group.
 */
export const getTargetSlots = (
	groups: CompiledGroups,
	targetKey: string
): readonly string[] => {
	const groupSlots = groups.get(targetKey);

	if (groupSlots === undefined) {
		return [targetKey];
	}

	return groupSlots;
};

const expandSlotTargets = (
	targets: readonly string[],
	groups: CompiledGroups,
	slotKeys: ReadonlySet<string>,
	label: 'Compound slot' | 'Multi slot'
): ReadonlySet<string> => {
	const result = new Set<string>();

	for (const target of targets) {
		if (!groups.has(target) && !slotKeys.has(target)) {
			throw new Error(`${label} references unknown slot "${target}"`);
		}

		for (const slotKey of getTargetSlots(groups, target)) {
			result.add(slotKey);
		}
	}

	return result;
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

		// A default left `undefined` is the same as no default.
		if (getOwn(defaultVariants, variant) !== undefined) {
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
		const variantValues = getOwnOrThrow(
			normalizedVariants,
			variant,
			`Default variant "${variant}" is not defined in variants`
		);

		if (
			value !== undefined &&
			typeof value !== 'function' &&
			!hasVariantValue(variantValues, value)
		) {
			throw new Error(
				`Default variant "${variant}" has invalid value "${value}"`
			);
		}
	}
};

const assertValidPresets = (
	presets: Record<string, ResolvedVariantState>,
	normalizedVariants: NormalizedVariants
) => {
	for (const [presetName, presetValues] of entries(presets)) {
		if (hasOwn(normalizedVariants, presetName)) {
			throw new Error(
				`Preset "${presetName}" cannot have the same name as a variant`
			);
		}

		for (const [variant, value] of entries(presetValues)) {
			const variantValues = getOwnOrThrow(
				normalizedVariants,
				variant,
				`Preset "${presetName}" references unknown variant "${variant}"`
			);

			if (value !== undefined && !hasVariantValue(variantValues, value)) {
				throw new Error(
					`Preset "${presetName}" has invalid value "${value}" for variant "${variant}"`
				);
			}
		}
	}
};

const resolveGroups = (
	groups: RuntimeGroups,
	slotKeys: ReadonlySet<string>
): CompiledGroups => {
	const result = new Map<string, readonly string[]>();

	for (const [groupName, groupSlots] of entries(groups)) {
		if (slotKeys.has(groupName)) {
			throw new Error(
				`Group "${groupName}" cannot have the same name as a slot`
			);
		}

		if (groupSlots.length === 0) {
			throw new Error(
				`Group "${groupName}" must define at least one slot`
			);
		}

		for (const slot of groupSlots) {
			if (!slotKeys.has(slot)) {
				throw new Error(
					`Group "${groupName}" references unknown slot "${slot}"`
				);
			}
		}

		result.set(groupName, groupSlots);
	}

	return result;
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

export const isSlotObjectValue = <T>(
	value: SlotValue<Slots, undefined, T>,
	targetKeys: ReadonlySet<string>
): value is Partial<Record<string, T>> =>
	isPlainObject(value) && keys(value).every((key) => targetKeys.has(key));

const pushSlotObjectValue = (
	slotClasses: SlotClasses,
	value: Record<string, ConfigClassValue>,
	groups: CompiledGroups
) => {
	for (const [targetKey, targetValue] of entries(value)) {
		for (const slotKey of getTargetSlots(groups, targetKey)) {
			slotClasses[slotKey]?.push(targetValue);
		}
	}
};

/**
 * Applies a config value to the slots it targets: per slot for a slot object,
 * or to `base` otherwise.
 */
export const applyValueToSlotClasses =
	(
		value: NormalizedVariantValue,
		targetKeys: ReadonlySet<string>,
		groups: CompiledGroups
	): ApplySlotClasses =>
	(slotClasses) => {
		if (isSlotObjectValue(value, targetKeys)) {
			pushSlotObjectValue(slotClasses, value, groups);
			return;
		}

		slotClasses.base?.push(value);
	};

/**
 * Prefixes a non-empty class name with the space that joins it to the rest.
 */
export const toFragment = (className: string) => {
	if (className === '') {
		return '';
	}

	return ` ${className}`;
};

/**
 * Lists, per slot, the fragment each config value adds to it on its own. Each
 * fragment can be concatenated with the others to rebuild that slot's `cn()`
 * output.
 */
export const getSlotFragmentTables = (
	slotEntries: readonly SlotEntry[],
	applies: readonly ApplySlotClasses[]
): string[][] => {
	const valueClasses = applies.map((apply) => {
		const slotClasses: SlotClasses = {};

		for (const [key] of slotEntries) {
			slotClasses[key] = [];
		}

		apply(slotClasses);

		return slotClasses;
	});

	return slotEntries.map(([key]) =>
		valueClasses.map((slotClasses) => toFragment(cn(slotClasses[key])))
	);
};

/**
 * Lists the fragment a compound entry adds to each slot it changes.
 */
const getCompoundFragments = (
	slotEntries: readonly SlotEntry[],
	apply: ApplySlotClasses
) => {
	const fragments: CompoundSlotFragment[] = [];
	const tables = getSlotFragmentTables(slotEntries, [apply]);

	tables.forEach((table, slot) => {
		// A one-value table: joining reads its only fragment
		const fragment = table.join('');

		if (fragment !== '') {
			fragments.push({ slot, fragment });
		}
	});

	return fragments;
};

export const compileConfig = (config: RawConfig): CompiledConfig => {
	const {
		base: configBase,
		variants = {},
		slots = {},
		groups = {},
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

	const base = cn(configBase, baseSlot);
	const normalizedSlots: Slots = { base, ...otherSlots };

	const slotEntries = entries(normalizedSlots);
	const slotKeys: ReadonlySet<string> = new Set(keys(normalizedSlots));
	const resolvedGroups = resolveGroups(groups, slotKeys);

	const targetKeys: ReadonlySet<string> = new Set([
		...slotKeys,
		...resolvedGroups.keys()
	]);

	const normalizedVariants = createNormalizedVariants(variants);
	const resolvedRequiredVariants = resolveNames(
		requiredVariants,
		keys(normalizedVariants)
	);
	const { variantData, combinationCount, maxEntries } = createVariantData(
		normalizedVariants,
		defaultVariants,
		resolvedRequiredVariants
	);

	const resolvedMultiSlots = expandSlotTargets(
		resolveNames(multiSlots, [...slotKeys]),
		resolvedGroups,
		slotKeys,
		'Multi slot'
	);

	assertValidRequiredVariantConfig(
		resolvedRequiredVariants,
		normalizedVariants,
		defaultVariants
	);

	assertKnownDefaultVariants(defaultVariants, normalizedVariants);
	assertValidPresets(presets, normalizedVariants);

	const compileCompound = (
		compound: CompoundEntry,
		apply: ApplySlotClasses
	): CompiledCompound => ({
		matchers: compileCompoundMatchers(
			compound,
			normalizedVariants,
			presets
		),
		fragments: getCompoundFragments(slotEntries, apply)
	});

	const compiledCompoundVariants = compoundVariants.map((compound) =>
		compileCompound(
			compound,
			applyValueToSlotClasses(
				requireCompoundClassValue(compound, 'variant'),
				targetKeys,
				resolvedGroups
			)
		)
	);

	const compiledCompoundSlots = compoundSlots.map((compound) => {
		if (!isArray(compound.slots) || compound.slots.length === 0) {
			throw new Error('Compound slot must define at least one slot');
		}

		const classValue = requireCompoundClassValue(compound, 'slot');

		// Expanded inside `apply` so a bad matcher still reports before a bad
		// slot.
		return compileCompound(compound, (slotClasses) => {
			const targetSlots = expandSlotTargets(
				compound.slots,
				resolvedGroups,
				slotKeys,
				'Compound slot'
			);

			for (const slotKey of targetSlots) {
				slotClasses[slotKey]?.push(classValue);
			}
		});
	});

	return {
		base,
		slots,
		slotEntries,
		slotKeys,
		targetKeys,
		originalGroups: groups,
		groups: resolvedGroups,
		originalVariants: variants,
		normalizedVariants,
		variantData,
		defaultVariants,
		requiredVariants: resolvedRequiredVariants,
		multiSlots: resolvedMultiSlots,
		presets,
		originalCompoundVariants: compoundVariants,
		originalCompoundSlots: compoundSlots,
		compounds: [...compiledCompoundVariants, ...compiledCompoundSlots],
		...createCache(cacheSize),
		// Every combination needs a safe integer key to be cached.
		cacheable: cacheSize > 0 && combinationCount <= Number.MAX_SAFE_INTEGER,
		maxEntries,
		introspection,
		postProcess
	};
};