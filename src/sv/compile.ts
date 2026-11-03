import { cn, type ClassValue } from '../cn.ts';
import {
	type CacheReturn,
	type CompiledCompound,
	type CompiledConfig,
	type CompiledGroups,
	type CompoundMatcher,
	type CompoundSlotFragment,
	type ConfigClassValue,
	type ConfigKey,
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
	// How many distinct cache keys the variants span, unset states included.
	combinationCount: number;
};

type CompoundEntry = Record<string, unknown> & {
	preset?: string | undefined;
};

/** The value shape each config key expects, used to tell a config from a class record. */
type ConfigValueCheck =
	| 'array'
	| 'boolean'
	| 'boolean-or-array'
	| 'class'
	| 'function'
	| 'number'
	| 'object';

const { isArray } = Array;
const { entries, hasOwn, keys } = Object;

const defaultCacheSize = 256;

const configKeysRecord: Record<ConfigKey, ConfigValueCheck> = {
	base: 'class',
	variants: 'object',
	slots: 'object',
	groups: 'object',
	compoundVariants: 'array',
	compoundSlots: 'array',
	defaultVariants: 'object',
	requiredVariants: 'boolean-or-array',
	multiSlots: 'boolean-or-array',
	presets: 'object',
	cacheSize: 'number',
	postProcess: 'function',
	introspection: 'boolean'
};

const configKeyChecks: ReadonlyMap<string, ConfigValueCheck> = new Map(
	entries(configKeysRecord)
);

const isRuntimeVariantValue = (value: unknown): value is RuntimeVariantValue =>
	typeof value === 'string' ||
	typeof value === 'number' ||
	typeof value === 'boolean';

const createInvalidCompoundMatcherValueError = (
	variant: string,
	value: unknown
) =>
	new Error(
		`Compound matcher for variant "${variant}" has invalid value "${value}"`
	);

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

const isCompoundMetaKey = (compoundKey: string) =>
	compoundKey === 'slots' || isReservedProp(compoundKey);

// A variant value is known by its string form, the same way runtime props are
// looked up.
const hasVariantValue = (
	variantValues: NormalizedVariantValues,
	value: RuntimeVariantValue
) => hasOwn(variantValues, `${value}`);

const resolveCompoundMatcherExpected = (
	variant: string,
	value: unknown,
	variantValues: NormalizedVariantValues
): CompoundMatcher => {
	if (isRuntimeVariantValue(value)) {
		if (!hasVariantValue(variantValues, value)) {
			throw createInvalidCompoundMatcherValueError(variant, value);
		}

		return new Set([`${value}`]);
	}

	if (!isArray(value)) {
		throw createInvalidCompoundMatcherValueError(variant, value);
	}

	if (value.length === 0) {
		throw new Error(
			`Compound matcher for variant "${variant}" must list at least one value`
		);
	}

	const expected = new Set<string>();

	for (const item of value) {
		if (
			!isRuntimeVariantValue(item) ||
			!hasVariantValue(variantValues, item)
		) {
			throw createInvalidCompoundMatcherValueError(variant, item);
		}

		expected.add(`${item}`);
	}

	return expected;
};

const seedPresetMatchers = (
	matchers: Map<string, CompoundMatcher>,
	presets: Record<string, ResolvedVariantState>,
	preset: string | undefined
) => {
	if (preset === undefined) {
		return;
	}

	const presetValues = presets[preset];

	if (presetValues === undefined) {
		throw new Error(
			`Compound matcher references unknown preset "${preset}"`
		);
	}

	for (const [variant, value] of entries(presetValues)) {
		if (value !== undefined) {
			matchers.set(variant, new Set([`${value}`]));
		}
	}
};

const getKnownVariantValues = (
	normalizedVariants: NormalizedVariants,
	variant: string,
	errorMessage: string
) => {
	const variantValues = normalizedVariants[variant];

	if (variantValues === undefined) {
		throw new Error(errorMessage);
	}

	return variantValues;
};

const compileCompoundMatchers = (
	compound: CompoundEntry,
	normalizedVariants: NormalizedVariants,
	presets: Record<string, ResolvedVariantState>
): ReadonlyMap<string, CompoundMatcher> => {
	const matchers = new Map<string, CompoundMatcher>();

	seedPresetMatchers(matchers, presets, compound.preset);

	for (const [compoundKey, value] of entries(compound)) {
		if (isCompoundMetaKey(compoundKey)) {
			continue;
		}

		const variantValues = getKnownVariantValues(
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
const isPlainObject = <T>(
	value: T
): value is Exclude<Extract<T, object>, readonly unknown[]> =>
	value !== null && typeof value === 'object' && !isArray(value);

const hasOnlySlotKeys = (value: object, targetKeys: ReadonlySet<string>) =>
	keys(value).every((key) => targetKeys.has(key));

const isSlotObjectVariantValue = (
	variantValue: NormalizedVariantValues,
	targetKeys: ReadonlySet<string>
): variantValue is Record<string, ConfigClassValue> =>
	targetKeys.size > 1 &&
	keys(variantValue).length > 0 &&
	hasOnlySlotKeys(variantValue, targetKeys);

const isBooleanVariantRecord = (variantValue: NormalizedVariantValues) =>
	keys(variantValue).every((key) => key === 'true' || key === 'false');

const withoutUndefinedValues = (variantValues: NormalizedVariantValues) => {
	const result: NormalizedVariantValues = {};

	for (const [valueKey, value] of entries(variantValues)) {
		result[valueKey] = value ?? '';
	}

	return result;
};

const normalizeVariantValue = (
	variantValue: RuntimeVariantConfigValue,
	targetKeys: ReadonlySet<string>
) => {
	if (
		!isPlainObject(variantValue) ||
		isSlotObjectVariantValue(variantValue, targetKeys)
	) {
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

	return withoutUndefinedValues(variantValue);
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

const matchesConfigValue = (check: ConfigValueCheck, value: unknown) => {
	if (value === undefined) {
		return true;
	}

	if (check === 'class') {
		return typeof value === 'string' || isArray(value);
	}

	if (check === 'object') {
		return isPlainObject(value);
	}

	if (check === 'array') {
		return isArray(value);
	}

	if (check === 'boolean-or-array') {
		return typeof value === 'boolean' || isArray(value);
	}

	return typeof value === check;
};

export const isConfig = (value: ClassValue | RawConfig): value is RawConfig => {
	if (!isPlainObject(value)) {
		return false;
	}

	for (const [key, keyValue] of entries(value)) {
		const check = configKeyChecks.get(key);

		if (check === undefined || !matchesConfigValue(check, keyValue)) {
			return false;
		}
	}

	return true;
};

const createNormalizedVariants = <S extends MaybeSlots>(
	variants: Variants<S, undefined>,
	targetKeys: ReadonlySet<string>
) => {
	const result: NormalizedVariants = {};

	for (const [variantKey, variantValue] of entries(variants)) {
		result[variantKey] = normalizeVariantValue(variantValue, targetKeys);
	}

	return result;
};

/**
 * Numbers each variant's values, so a combination of resolved values maps to a
 * single cache key: the sum of every value id times its variant's stride, with
 * each variant spanning its value count plus one for the unset state.
 */
const createVariantData = (
	normalizedVariants: NormalizedVariants
): VariantLayout => {
	let stride = 1;

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
				values: variantValues
			};

			stride *= valueKeys.length + 1;

			return variant;
		}
	);

	// Strides only grow, so the final one is the largest key plus one.
	return { variantData, combinationCount: stride };
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
): readonly string[] => {
	const result = new Set<string>();

	for (const target of targets) {
		if (!groups.has(target) && !slotKeys.has(target)) {
			throw new Error(`${label} references unknown slot "${target}"`);
		}

		for (const slotKey of getTargetSlots(groups, target)) {
			result.add(slotKey);
		}
	}

	return [...result];
};

const resolveMultiSlots = (
	multiSlots: readonly string[] | boolean,
	groups: CompiledGroups,
	slotKeys: ReadonlySet<string>
): ReadonlySet<string> => {
	if (multiSlots === true) {
		return slotKeys;
	}

	if (multiSlots === false) {
		return new Set();
	}

	return new Set(
		expandSlotTargets(multiSlots, groups, slotKeys, 'Multi slot')
	);
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
			const variantValues = getKnownVariantValues(
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
	isPlainObject(value) && hasOnlySlotKeys(value, targetKeys);

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
 * Collects what a config value adds to each slot, on its own.
 */
export const collectSlotClasses = (
	slotEntries: readonly SlotEntry[],
	apply: ApplySlotClasses
) => {
	const slotClasses: SlotClasses = {};

	for (const [key] of slotEntries) {
		slotClasses[key] = [];
	}

	apply(slotClasses);

	return slotClasses;
};

/**
 * Turns what a config value adds to one slot into a fragment that can be
 * concatenated with the others to rebuild that slot's `cn()` output.
 */
export const getSlotFragment = (slotClasses: SlotClasses, slotKey: string) =>
	toFragment(cn(slotClasses[slotKey]));

/**
 * Lists the fragment a compound entry adds to each slot it changes.
 */
const getCompoundFragments = (
	slotEntries: readonly SlotEntry[],
	apply: ApplySlotClasses
) => {
	const slotClasses = collectSlotClasses(slotEntries, apply);
	const fragments: CompoundSlotFragment[] = [];

	slotEntries.forEach(([slotKey], slot) => {
		const fragment = getSlotFragment(slotClasses, slotKey);

		if (fragment !== '') {
			fragments.push({ slot, fragment });
		}
	});

	return fragments;
};

export const compileConfig = (
	baseArgs: ClassValue[],
	config: RawConfig
): CompiledConfig => {
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

	const normalizedSlots: Slots = {
		base: cn(...baseArgs, configBase, baseSlot),
		...otherSlots
	};

	const slotEntries = entries(normalizedSlots);
	const slotKeys: ReadonlySet<string> = new Set(keys(normalizedSlots));
	const resolvedGroups = resolveGroups(groups, slotKeys);

	const targetKeys: ReadonlySet<string> = new Set([
		...slotKeys,
		...resolvedGroups.keys()
	]);

	const normalizedVariants = createNormalizedVariants(variants, targetKeys);
	const { variantData, combinationCount } =
		createVariantData(normalizedVariants);

	const resolvedMultiSlots = resolveMultiSlots(
		multiSlots,
		resolvedGroups,
		slotKeys
	);

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
		if (compound.slots.length === 0) {
			throw new Error('Compound slot must define at least one slot');
		}

		const classValue = requireCompoundClassValue(compound, 'slot');

		// Expanded inside `apply` so a bad matcher still reports before a bad slot.
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
		compounds: [...compiledCompoundVariants, ...compiledCompoundSlots],
		...createCache(cacheSize),
		// Every combination needs a safe integer key to be cached.
		cacheable: cacheSize > 0 && combinationCount <= Number.MAX_SAFE_INTEGER,
		introspection,
		postProcess
	};
};