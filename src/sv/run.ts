import { cn, type ClassValue } from '../cn.ts';
import {
	applyValueToSlotClasses,
	coerceVariantKeyValue,
	collectSlotClasses,
	getSlotFragment,
	getTargetSlots,
	isSlotObjectValue,
	toFragment
} from './compile.ts';
import {
	type CacheEntry,
	type CacheReturn,
	type CacheValue,
	type CompiledConfig,
	type CompiledGroups,
	type CompoundSlotFragment,
	type ResolvedVariantState,
	type RunFn,
	type RuntimeClassValue,
	type RuntimeDefaultVariant,
	type RuntimeProps,
	type RuntimeVariantMatcher,
	type RuntimeVariantState,
	type RuntimeVariantValue,
	type VariantCache,
	type VariantData,
	type VariantValueIds
} from './types.ts';

type MergeClassProp = (
	raw: CacheValue,
	classProp: RuntimeClassValue
) => CacheValue;

type ProcessCacheValue = (value: CacheValue) => CacheValue;

type FragmentTable = string[];

// What one variant adds to one slot: a fragment per value id, with a last
// empty entry for the unset state, and its index in the plan's tables.
type VariantSlotTable = {
	slot: number;
	table: number;
	fragments: FragmentTable;
};

// The value ids of one variant that a compound entry requires.
type CompoundTest = { compound: number; ids: ReadonlySet<number> };

type VariantPlan = {
	data: VariantData;
	undefinedId: number;
	tables: readonly VariantSlotTable[];
	tests: readonly CompoundTest[];
};

type SlotPlan = { key: string; base: string };

/**
 * Everything a call needs besides the props, precomputed from the config:
 * each slot's base fragment, each variant's fragment tables and compound
 * tests, and each compound entry's fragments. The generated code and the
 * interpreter both run from it.
 */
type RunPlan = {
	slots: readonly SlotPlan[];
	variants: readonly VariantPlan[];
	tables: readonly FragmentTable[];
	compounds: readonly (readonly CompoundSlotFragment[])[];
};

type CompiledRunContext = {
	cache: VariantCache;
	cacheReturn: CacheReturn;
	defaults: readonly RuntimeDefaultVariant[];
	valueIds: readonly VariantValueIds[];
	tables: readonly FragmentTable[];
	merge: MergeClassProp;
	postProcess: ProcessCacheValue;
	presets: Record<string, ResolvedVariantState>;
	resolvePreset: typeof resolvePresetValues;
	missingVariant: typeof createMissingVariantError;
	invalidValue: typeof createInvalidValueError;
};

type ResolvedVariant = {
	variant: VariantPlan;
	value: RuntimeVariantValue | undefined;
	id: number;
};

// A table lookup can't miss, and `join()` would skip a miss anyway.
type SlotParts = (string | undefined)[];

const { entries, hasOwn, keys, values } = Object;

const missingValueId = -2;
const unknownValueId = -1;

const createMissingVariantError = (variant: string): Error =>
	new Error(`Missing required variant: "${variant}"`);

const createInvalidValueError = (
	variant: string,
	value: RuntimeVariantValue | undefined
) => new Error(`Invalid value "${value}" for variant "${variant}"`);

const resolvePresetValues = (
	presets: Record<string, ResolvedVariantState>,
	presetName: string | undefined
) => {
	if (presetName === undefined) {
		return undefined;
	}

	if (!hasOwn(presets, presetName)) {
		throw new Error(`Invalid preset "${presetName}"`);
	}

	return presets[presetName];
};

const resolveVariantValue = (
	defaultVariants: Record<string, RuntimeDefaultVariant>,
	variantKey: string,
	props: RuntimeVariantState,
	presetValues: ResolvedVariantState | undefined
) => {
	const propValue = props[variantKey];

	if (propValue === null) {
		return undefined;
	}

	if (propValue !== undefined) {
		return propValue;
	}

	const presetValue = presetValues?.[variantKey];

	// Check if preset value is defined, it takes precedence over default value.
	if (presetValue !== undefined) {
		return presetValue;
	}

	const defaultValue = defaultVariants[variantKey];

	// Check for function default value, to evaluate it with the current props.
	if (typeof defaultValue === 'function') {
		return defaultValue(props);
	}

	return defaultValue;
};

const applyPostProcess = (
	postProcess: ((className: string) => string) | undefined,
	value: CacheValue
) => {
	if (postProcess === undefined) {
		return value;
	}

	if (typeof value === 'string') {
		return postProcess(value);
	}

	const result: Record<string, string> = {};

	for (const [slotKey, slotValue] of entries(value)) {
		result[slotKey] = postProcess(slotValue);
	}

	return result;
};

const mergeSlotObjectIntoResult = (
	baseResult: Record<string, string>,
	classProp: Partial<Record<string, ClassValue>>,
	groups: CompiledGroups
) => {
	const result: Record<string, string> = { ...baseResult };

	for (const [targetKey, targetValue] of entries(classProp)) {
		for (const slotKey of getTargetSlots(groups, targetKey)) {
			result[slotKey] = cn(result[slotKey], targetValue);
		}
	}

	return result;
};

const mergeClassPropIntoResult = (
	config: CompiledConfig,
	baseResult: CacheValue,
	classProp: RuntimeClassValue
) => {
	const { targetKeys, groups } = config;
	const classPropIsSlotObject = isSlotObjectValue(classProp, targetKeys);

	if (typeof baseResult === 'string') {
		if (classPropIsSlotObject) {
			const { base } = mergeSlotObjectIntoResult(
				{ base: baseResult },
				classProp,
				groups
			);

			return cn(base);
		}

		return cn(baseResult, classProp);
	}

	if (!classPropIsSlotObject) {
		return {
			...baseResult,
			base: cn(baseResult.base, classProp)
		};
	}

	return mergeSlotObjectIntoResult(baseResult, classProp, groups);
};

const mergeClassProp = (
	config: CompiledConfig,
	raw: CacheValue,
	classProp: RuntimeClassValue
) =>
	applyPostProcess(
		config.postProcess,
		mergeClassPropIntoResult(config, raw, classProp)
	);

/**
 * Lists the ids of a variant's values a compound matcher accepts. An unset
 * variant still loosely equals the value "undefined".
 */
const getCompoundIds = (
	variant: VariantData,
	expected: RuntimeVariantMatcher
): ReadonlySet<number> => {
	const expectedKeys = new Set(expected.map((value) => `${value}`));
	const ids = new Set<number>();

	for (const [valueKey, id] of variant.valueIds) {
		if (expectedKeys.has(valueKey)) {
			ids.add(id);
		}
	}

	if (expectedKeys.has('undefined')) {
		ids.add(variant.unsetId);
	}

	return ids;
};

const createVariantPlan = (
	config: CompiledConfig,
	variant: VariantData,
	required: boolean,
	planTables: FragmentTable[]
): VariantPlan => {
	const { slotEntries, targetKeys, groups, compounds } = config;

	const valueClasses = values(variant.values).map((value) =>
		collectSlotClasses(
			slotEntries,
			applyValueToSlotClasses(value, targetKeys, groups)
		)
	);

	const tables: VariantSlotTable[] = [];

	slotEntries.forEach(([slotKey], slot) => {
		const fragments = valueClasses.map((slotClasses) =>
			getSlotFragment(slotClasses, slotKey)
		);

		if (fragments.some((fragment) => fragment !== '')) {
			fragments.push('');
			tables.push({ slot, table: planTables.length, fragments });
			planTables.push(fragments);
		}
	});

	const tests: CompoundTest[] = [];

	compounds.forEach(({ matchers }, compound) => {
		const matcher = matchers.find(({ key }) => key === variant.key);

		if (matcher !== undefined) {
			tests.push({
				compound,
				ids: getCompoundIds(variant, matcher.expected)
			});
		}
	});

	let undefinedId = variant.unsetId;

	if (required) {
		undefinedId = missingValueId;
	}

	return { data: variant, undefinedId, tables, tests };
};

const createRunPlan = (config: CompiledConfig): RunPlan => {
	const { slotEntries, variantData, compounds, requiredVariants } = config;
	const required = new Set(requiredVariants);
	const tables: FragmentTable[] = [];

	return {
		slots: slotEntries.map(([key, value]) => ({
			key,
			base: toFragment(cn(value))
		})),
		variants: variantData.map((variant) =>
			createVariantPlan(
				config,
				variant,
				required.has(variant.key),
				tables
			)
		),
		tables,
		compounds: compounds.map(({ fragments }) => fragments)
	};
};

/**
 * Lists the `switch` cases whose strict match equals a `${value}` lookup.
 */
const getValueCases = (valueKey: string) => {
	const value = coerceVariantKeyValue(valueKey);
	const cases = `case ${JSON.stringify(valueKey)}:`;

	if (typeof value === 'string') {
		return cases;
	}

	return `${cases} case ${value}:`;
};

const getDefaultSource = (
	defaultValue: RuntimeDefaultVariant,
	index: number
) => {
	if (typeof defaultValue === 'string') {
		return JSON.stringify(defaultValue);
	}

	if (typeof defaultValue === 'function') {
		return `d${index}(p)`;
	}

	// Numbers and booleans print as literals of the same value
	return `${defaultValue}`;
};

/**
 * Emits the code resolving one variant to its value, as `v<index>`, and to its
 * value id, as `i<index>`. Values other than the literal cases, like arrays,
 * are matched by their string form, the same way class names are looked up.
 */
const getVariantSource = (
	config: CompiledConfig,
	{ data: variant, undefinedId }: VariantPlan,
	index: number
) => {
	const key = JSON.stringify(variant.key);
	const defaultValue = config.defaultVariants[variant.key];
	const value = `v${index}`;
	const fallbacks: string[] = [];

	if (keys(config.presets).length > 0) {
		fallbacks.push(`if (pv !== undefined) ${value} = pv[${key}];`);
	}

	if (defaultValue !== undefined) {
		fallbacks.push(
			`if (${value} === undefined) ${value} = ${getDefaultSource(defaultValue, index)};`
		);
	}

	const valueKeys = [...variant.valueIds.keys()];
	const cases = valueKeys.map(
		(valueKey, id) => `${getValueCases(valueKey)} i${index} = ${id}; break;`
	);

	cases.push(`case undefined: i${index} = ${undefinedId}; break;`);

	cases.push(
		`default: i${index} = ids${index}.get(\`\${${value}}\`) ?? ${unknownValueId};`
	);

	return [
		`let ${value} = p[${key}];`,
		`if (${value} === undefined) { ${fallbacks.join(' ')} } else if (${value} === null) { ${value} = undefined; }`,
		`let i${index};`,
		`switch (${value}) { ${cases.join(' ')} }`
	].join('\n');
};

/**
 * Emits the checks that throw for missing required variants and then for
 * unknown values, once any value id came out negative.
 */
const getValidationSource = (config: CompiledConfig) => {
	const { variantData, requiredVariants } = config;

	if (variantData.length === 0) {
		return '';
	}

	const checks: string[] = [];

	// Missing variants are reported in the order they are listed as required
	for (const variant of requiredVariants) {
		const index = variantData.findIndex(({ key }) => key === variant);

		checks.push(
			`if (i${index} === ${missingValueId}) throw missingVariant(${JSON.stringify(variant)});`
		);
	}

	variantData.forEach(({ key }, index) => {
		checks.push(
			`if (i${index} === ${unknownValueId}) throw invalidValue(${JSON.stringify(key)}, v${index});`
		);
	});

	const anyNegative = variantData.map((_variant, index) => `i${index} < 0`);

	return `if (${anyNegative.join(' || ')}) { ${checks.join(' ')} }`;
};

/**
 * Emits the condition under which a compound entry applies.
 */
const getMatcherSource = (plan: RunPlan, compound: number) => {
	const conditions: string[] = [];

	plan.variants.forEach(({ tests }, index) => {
		for (const test of tests) {
			if (test.compound === compound) {
				const ids = [...test.ids].map((id) => `i${index} === ${id}`);

				conditions.push(`(${ids.join(' || ')})`);
			}
		}
	});

	if (conditions.length === 0) {
		return 'true';
	}

	return conditions.join(' && ');
};

/**
 * Emits the code that builds the class names of one slot, as `r<slot>`.
 */
const getSlotSource = (plan: RunPlan, { base }: SlotPlan, slot: number) => {
	const lines = [`let r${slot} = ${JSON.stringify(base)};`];

	plan.variants.forEach((variant, index) => {
		for (const { slot: target, table } of variant.tables) {
			if (target === slot) {
				lines.push(`r${slot} += t${table}[i${index}];`);
			}
		}
	});

	plan.compounds.forEach((fragments, index) => {
		for (const { slot: target, fragment } of fragments) {
			if (target === slot) {
				lines.push(
					`if (c${index}) r${slot} += ${JSON.stringify(fragment)};`
				);
			}
		}
	});

	return lines.join('\n');
};

/**
 * Emits the code that builds the `raw` class names of a combination.
 */
const getBuildSource = (plan: RunPlan) => {
	const lines = plan.compounds.map(
		(_fragments, index) =>
			`const c${index} = ${getMatcherSource(plan, index)};`
	);

	plan.slots.forEach((slotPlan, slot) => {
		lines.push(getSlotSource(plan, slotPlan, slot));
	});

	if (plan.slots.length === 1) {
		lines.push('const raw = r0.slice(1);');
	} else {
		const properties = plan.slots.map(
			({ key }, slot) => `${JSON.stringify(key)}: r${slot}.slice(1)`
		);

		lines.push(`const raw = { ${properties.join(', ')} };`);
	}

	return lines.join('\n');
};

/**
 * Emits the code that returns the processed class names, or merges in the
 * `class` prop when one is passed.
 */
const getMergeSource = (raw: string, processed: string) =>
	[
		'const cp = p.class ?? p.className;',
		`if (!cp) return ${processed};`,
		`return merge(${raw}, cp);`
	].join('\n');

/**
 * Emits the code that returns the class names of the resolved combination,
 * read from the cache when the combination index can key it.
 */
const getResultSource = (config: CompiledConfig, plan: RunPlan) => {
	const build = getBuildSource(plan);

	let processed = 'raw';

	if (config.postProcess !== undefined) {
		processed = 'pp(raw)';
	}

	if (!config.cacheable) {
		return [build, getMergeSource('raw', processed)].join('\n');
	}

	const cacheKey = config.variantData.map(
		({ stride }, index) => `i${index} * ${stride}`
	);

	return [
		`const k = ${['0', ...cacheKey].join(' + ')};`,
		'let e = cache.get(k);',
		'if (e === undefined) {',
		build,
		`e = cacheReturn(k, { raw, processed: ${processed} });`,
		'}',
		getMergeSource('e.raw', 'e.processed')
	].join('\n');
};

/**
 * Emits the body of a run function specialized to the config. Variant lookups
 * are unrolled, the cache is keyed by a combination index, and each slot is
 * built by concatenating precomputed class name fragments.
 */
const getRunSource = (config: CompiledConfig, plan: RunPlan) => {
	const { variantData, defaultVariants } = config;
	const variantSources = plan.variants.map((variant, index) =>
		getVariantSource(config, variant, index)
	);

	const locals = plan.tables.map(
		(_table, index) => `const t${index} = t[${index}];`
	);

	variantData.forEach(({ key }, index) => {
		locals.push(`const ids${index} = valueIds[${index}];`);

		if (typeof defaultVariants[key] === 'function') {
			locals.push(`const d${index} = d[${index}];`);
		}
	});

	return [
		'"use strict";',
		'const { cache, cacheReturn, defaults: d, valueIds, tables: t, merge, postProcess: pp, presets, resolvePreset, missingVariant, invalidValue } = ctx;',
		...locals,
		'return (p) => {',
		'const pv = resolvePreset(presets, p.preset);',
		...variantSources,
		getValidationSource(config),
		getResultSource(config, plan),
		'};'
	].join('\n');
};

/**
 * The interpreted counterpart of `getVariantSource`, for every variant.
 */
const resolveVariants = (
	config: CompiledConfig,
	plan: RunPlan,
	props: RuntimeProps
): ResolvedVariant[] => {
	const presetValues = resolvePresetValues(config.presets, props.preset);

	return plan.variants.map((variant) => {
		const value = resolveVariantValue(
			config.defaultVariants,
			variant.data.key,
			props,
			presetValues
		);

		let id = variant.undefinedId;

		if (value !== undefined) {
			id = variant.data.valueIds.get(`${value}`) ?? unknownValueId;
		}

		return { variant, value, id };
	});
};

/**
 * The interpreted counterpart of `getValidationSource`.
 */
const assertResolvedVariants = (
	requiredVariants: readonly string[],
	resolved: readonly ResolvedVariant[]
) => {
	for (const variant of requiredVariants) {
		const match = resolved.find(
			({ variant: { data } }) => data.key === variant
		);

		if (match?.id === missingValueId) {
			throw createMissingVariantError(variant);
		}
	}

	for (const { variant, value, id } of resolved) {
		if (id === unknownValueId) {
			throw createInvalidValueError(variant.data.key, value);
		}
	}
};

/**
 * The interpreted counterpart of `getBuildSource`.
 */
const buildRaw = (
	plan: RunPlan,
	resolved: readonly ResolvedVariant[]
): CacheValue => {
	const slots = plan.slots.map(({ key, base }) => {
		const parts: SlotParts = [base];

		return { key, parts };
	});
	const matched = plan.compounds.map(() => true);

	for (const { variant, id } of resolved) {
		for (const { slot, fragments } of variant.tables) {
			slots[slot]?.parts.push(fragments[id]);
		}

		for (const { compound, ids } of variant.tests) {
			if (!ids.has(id)) {
				matched[compound] = false;
			}
		}
	}

	plan.compounds.forEach((fragments, compound) => {
		if (matched[compound]) {
			for (const { slot, fragment } of fragments) {
				slots[slot]?.parts.push(fragment);
			}
		}
	});

	const raw: Record<string, string> = {};

	for (const { key, parts } of slots) {
		const classNames = parts.join('').slice(1);

		if (slots.length === 1) {
			return classNames;
		}

		raw[key] = classNames;
	}

	return raw;
};

const buildEntry = (
	config: CompiledConfig,
	plan: RunPlan,
	resolved: readonly ResolvedVariant[]
): CacheEntry => {
	const raw = buildRaw(plan, resolved);

	return { raw, processed: applyPostProcess(config.postProcess, raw) };
};

/**
 * The interpreted counterpart of `getResultSource`'s cache lookup.
 */
const getEntry = (
	config: CompiledConfig,
	plan: RunPlan,
	resolved: readonly ResolvedVariant[]
): CacheEntry => {
	if (!config.cacheable) {
		return buildEntry(config, plan, resolved);
	}

	let cacheKey = 0;

	for (const { variant, id } of resolved) {
		cacheKey += id * variant.data.stride;
	}

	return (
		config.cache.get(cacheKey) ??
		config.cacheReturn(cacheKey, buildEntry(config, plan, resolved))
	);
};

/**
 * Runs the plan without generated code, step for step like `getRunSource`.
 */
const createInterpretedRun =
	(config: CompiledConfig, plan: RunPlan) => (props: RuntimeProps) => {
		const resolved = resolveVariants(config, plan, props);

		assertResolvedVariants(config.requiredVariants, resolved);

		const entry = getEntry(config, plan, resolved);
		const classProp = props.class ?? props.className;

		if (!classProp) {
			return entry.processed;
		}

		return mergeClassProp(config, entry.raw, classProp);
	};

/**
 * Compiles the function that resolves props to class names from source
 * generated for the config, so each call runs code specialized to it. Where
 * runtime code generation is not allowed, like under a strict CSP, the same
 * plan is interpreted on each call instead.
 */
export const createRun = (config: CompiledConfig): RunFn => {
	const plan = createRunPlan(config);
	const source = getRunSource(config, plan);

	const context: CompiledRunContext = {
		cache: config.cache,
		cacheReturn: config.cacheReturn,
		defaults: config.variantData.map(
			({ key }) => config.defaultVariants[key]
		),
		valueIds: config.variantData.map(({ valueIds }) => valueIds),
		tables: plan.tables,
		merge: (raw, classProp) => mergeClassProp(config, raw, classProp),
		postProcess: (value) => applyPostProcess(config.postProcess, value),
		presets: config.presets,
		resolvePreset: resolvePresetValues,
		missingVariant: createMissingVariantError,
		invalidValue: createInvalidValueError
	};

	try {
		return new Function('ctx', source).call(undefined, context);
	} catch {
		return createInterpretedRun(config, plan);
	}
};