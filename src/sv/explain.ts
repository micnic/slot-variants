import { cn } from '../cn.ts';
import { isSlotObjectValue } from './compile.ts';
import {
	applyPostProcess,
	assertResolvedVariants,
	buildRaw,
	matchCompounds,
	mergeClassPropIntoResult,
	mergeSlotObjectIntoResult,
	readVariantState,
	resolvePresetValues,
	resolveVariants,
	type RunPlan
} from './run.ts';
import {
	type CacheValue,
	type CompiledConfig,
	type ExplainedCompound,
	type ExplainedSlot,
	type ExplainedVariant,
	type ResolvedVariantState,
	type RuntimeClassValue,
	type RuntimeProps,
	type RuntimeVariantValue,
	type VariantData,
	type VariantSource
} from './types.ts';

// The parts of a slot's explanation read from the run plan alone.
type SlotSources = {
	key: string;
	base: string;
	variants: Record<string, string>;
	compounds: ExplainedCompound[];
};

type RuntimeExplanation = {
	variants: Record<string, ExplainedVariant<RuntimeVariantValue>>;
	slots: Record<string, ExplainedSlot<string>>;
};

const whitespace = /\s+/;

/**
 * Tells where a resolved variant value came from, following the same order
 * as its resolution: the prop, then the preset, then the default.
 */
const getValueOrigin = (
	variant: VariantData,
	value: RuntimeVariantValue | undefined,
	props: RuntimeProps,
	presetValues: ResolvedVariantState | undefined
): VariantSource => {
	if (value === undefined) {
		return 'unset';
	}

	if (readVariantState(props, variant) !== undefined) {
		return 'prop';
	}

	if (
		presetValues !== undefined &&
		readVariantState(presetValues, variant) !== undefined
	) {
		return 'preset';
	}

	return 'default';
};

// Compound variants come first in the compiled compounds, then compound slots.
const getExplainedCompound = (
	config: CompiledConfig,
	compound: number,
	className: string
): ExplainedCompound => {
	const variantCount = config.originalCompoundVariants.length;

	if (compound < variantCount) {
		return { kind: 'compoundVariants', index: compound, class: className };
	}

	return {
		kind: 'compoundSlots',
		index: compound - variantCount,
		class: className
	};
};

/**
 * Lists, per slot, the classes the call's `class`/`className` adds to it.
 */
const getClassBySlot = (
	config: CompiledConfig,
	classProp: RuntimeClassValue | undefined
): Record<string, string> => {
	if (!classProp) {
		return {};
	}

	if (isSlotObjectValue(classProp, config.targetKeys)) {
		return mergeSlotObjectIntoResult({}, classProp, config.groups);
	}

	return { base: cn(classProp) };
};

const toSlotRecord = (value: CacheValue): Record<string, string> => {
	if (typeof value === 'string') {
		return { base: value };
	}

	return value;
};

/**
 * Lists the classes of `raw` missing from `result`, each once.
 */
const getDroppedClasses = (raw: string, result: string) => {
	const kept = new Set(result.split(whitespace));
	const dropped = new Set<string>();

	for (const className of raw.split(whitespace)) {
		if (className !== '' && !kept.has(className)) {
			dropped.add(className);
		}
	}

	return [...dropped];
};

/**
 * Builds a function that resolves props like a call and reports where each
 * class of the result came from, without reading or filling the cache.
 */
export const createExplain =
	(config: CompiledConfig, plan: RunPlan) =>
	(props: RuntimeProps = {}): RuntimeExplanation => {
		const resolved = resolveVariants(config, plan, props);

		assertResolvedVariants(plan, resolved);

		const presetValues = resolvePresetValues(config.presets, props.preset);
		const variants: RuntimeExplanation['variants'] = {};

		for (const { variant, value } of resolved) {
			variants[variant.data.key] = {
				value,
				from: getValueOrigin(variant.data, value, props, presetValues)
			};
		}

		const sources: SlotSources[] = plan.slots.map(({ key, base }) => ({
			key,
			base: base.slice(1),
			variants: {},
			compounds: []
		}));

		for (const { variant, id } of resolved) {
			for (const { slot, fragments } of variant.tables) {
				const fragment = fragments[id];
				const source = sources[slot];

				if (fragment && source) {
					source.variants[variant.data.key] = fragment.slice(1);
				}
			}
		}

		const matched = matchCompounds(plan, resolved);

		plan.compounds.forEach((fragments, compound) => {
			if (!matched[compound]) {
				return;
			}

			for (const { slot, fragment } of fragments) {
				sources[slot]?.compounds.push(
					getExplainedCompound(config, compound, fragment.slice(1))
				);
			}
		});

		const classProp = props.class ?? props.className;
		const raw = buildRaw(plan, resolved);
		let withClass = raw;

		if (classProp) {
			withClass = mergeClassPropIntoResult(config, raw, classProp);
		}

		const rawBySlot = toSlotRecord(withClass);
		const resultBySlot = toSlotRecord(
			applyPostProcess(config.postProcess, withClass)
		);
		const classBySlot = getClassBySlot(config, classProp);
		const slots: RuntimeExplanation['slots'] = {};

		for (const {
			key,
			base,
			variants: slotVariants,
			compounds
		} of sources) {
			const slotRaw = cn(rawBySlot[key]);
			const slotResult = cn(resultBySlot[key]);

			slots[key] = {
				base,
				variants: slotVariants,
				compounds,
				class: cn(classBySlot[key]),
				raw: slotRaw,
				result: slotResult,
				dropped: getDroppedClasses(slotRaw, slotResult)
			};
		}

		return { variants, slots };
	};