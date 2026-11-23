import type { SourceCode } from 'eslint';
import type { Node, ObjectExpression } from 'estree';
import { getOrCreate } from '../map-utils.ts';
import { getKeyName } from './config-keys.ts';
import { resolveContainer, resolveEnteredValue } from './const-bindings.ts';
import { isUndefinedValue } from './static-predicates.ts';

export type GroupSlots = ReadonlyMap<string, ReadonlyArray<string>>;

type SlotTargetOverlap = { slot: string; other: string };

type SlotTargetOverlaps = ReadonlyMap<string, readonly SlotTargetOverlap[]>;

type GroupEntry = [group: string, slots: ReadonlyArray<string>];

const EMPTY_PROPERTIES: ReadonlyMap<string, Node> = new Map();

const propertiesCache = new WeakMap<
	ObjectExpression,
	ReadonlyMap<string, Node>
>();

// An object's properties with those of the objects it spreads, when it has a
// spread.
const spreadPropertiesCache = new WeakMap<
	ObjectExpression,
	ReadonlyMap<string, Node>
>();

// Whether an object's every property is a plain, statically keyed one.
const strictObjects = new WeakMap<ObjectExpression, boolean>();

const buildPropertiesMap = (
	obj: ObjectExpression
): ReadonlyMap<string, Node> => {
	const map = new Map<string, Node>();

	for (const prop of obj.properties) {
		if (prop.type !== 'Property') {
			continue;
		}

		const key = getKeyName(prop);

		if (key !== null) {
			map.set(key, prop.value);
		}
	}

	return map;
};

export const getProperties = (
	obj: Node | undefined
): ReadonlyMap<string, Node> => {
	if (!obj || obj.type !== 'ObjectExpression') {
		return EMPTY_PROPERTIES;
	}

	return getOrCreate(propertiesCache, obj, () => buildPropertiesMap(obj));
};

/** Whether `obj` spreads another object into its own properties. */
export const hasSpreadProperty = (obj: ObjectExpression): boolean =>
	obj.properties.some((property) => property.type === 'SpreadElement');

// Sets each property of `obj` in `merged`, in source order, entering each
// spread that reads as an object literal through same-file `const` bindings.
// `stack` holds the objects being entered, which stops one that spreads
// itself (`const a = { ...a }`) while an object spread twice is entered both
// times, its keys winning again where it's spread last.
const mergeSpreadProperties = (
	obj: ObjectExpression,
	sourceCode: SourceCode,
	merged: Map<string, Node>,
	stack: Set<ObjectExpression>
) => {
	stack.add(obj);

	for (const prop of obj.properties) {
		if (prop.type === 'Property') {
			const key = getKeyName(prop);

			if (key !== null) {
				merged.set(key, prop.value);
			}

			continue;
		}

		const spread = resolveEnteredValue(prop.argument, sourceCode);

		if (spread.type === 'ObjectExpression' && !stack.has(spread)) {
			mergeSpreadProperties(spread, sourceCode, merged, stack);
		}
	}

	stack.delete(obj);
};

/**
 * Adds the keys spreading `node` may set to `keys`, entering the spreads it
 * holds itself. False when they can't all be read: a spread of anything but
 * an object literal, or a computed key. `stack` stops an object that spreads
 * itself (`const a = { ...a }`).
 */
export const collectSpreadKeys = (
	node: Node,
	sourceCode: SourceCode,
	keys: Set<string>,
	stack: Set<ObjectExpression> = new Set()
): boolean => {
	const obj = resolveEnteredValue(node, sourceCode);

	if (obj.type !== 'ObjectExpression' || stack.has(obj)) {
		return false;
	}

	stack.add(obj);

	for (const prop of obj.properties) {
		if (prop.type === 'SpreadElement') {
			if (!collectSpreadKeys(prop.argument, sourceCode, keys, stack)) {
				return false;
			}

			continue;
		}

		const key = getKeyName(prop);

		if (key === null) {
			return false;
		}

		keys.add(key);
	}

	stack.delete(obj);

	return true;
};

/**
 * A config's properties with those of each object it spreads merged in, a
 * later key winning as at runtime. A spread that doesn't read as an object
 * literal adds nothing.
 */
export const getConfigProperties = (
	config: ObjectExpression,
	sourceCode: SourceCode
): ReadonlyMap<string, Node> => {
	if (!hasSpreadProperty(config)) {
		return getProperties(config);
	}

	return getOrCreate(spreadPropertiesCache, config, () => {
		const merged = new Map<string, Node>();

		mergeSpreadProperties(config, sourceCode, merged, new Set());

		return merged;
	});
};

export const getStrictProperties = (
	obj: Node | undefined
): ReadonlyMap<string, Node> | null => {
	if (!obj || obj.type !== 'ObjectExpression') {
		return null;
	}

	const isStrict = getOrCreate(strictObjects, obj, () =>
		obj.properties.every(
			(prop) => prop.type === 'Property' && getKeyName(prop) !== null
		)
	);

	if (!isStrict) {
		return null;
	}

	return getProperties(obj);
};

// The strict properties of a non-empty object keyed only by `base` and the
// given slot names. Null for anything else, including an object with a
// spread, computed or other key.
export const collectSlotKeyedProperties = (
	node: Node,
	slotNames: ReadonlySet<string>
): ReadonlyMap<string, Node> | null => {
	if (slotNames.size === 0) {
		return null;
	}

	const properties = getStrictProperties(node);

	if (!properties || properties.size === 0) {
		return null;
	}

	for (const key of properties.keys()) {
		if (key !== 'base' && !slotNames.has(key)) {
			return null;
		}
	}

	return properties;
};

// Every name a per-slot object may be keyed by: the declared slots plus the
// group names that stand for them, mirroring how `sv()` reads those objects.
// `base` is in it once a `slots` object is declared, even one holding `base`
// alone, and never otherwise, as a config without slots takes no slot object.
export const getConfigSlotNames = (
	config: ReadonlyMap<string, Node>,
	sourceCode: SourceCode
): ReadonlySet<string> => {
	const slots = resolveContainer(config.get('slots'), sourceCode);
	const groups = resolveContainer(config.get('groups'), sourceCode);
	const slotNames = new Set(getProperties(slots).keys());

	for (const groupName of getProperties(groups).keys()) {
		slotNames.add(groupName);
	}

	if (slots?.type === 'ObjectExpression') {
		slotNames.add('base');
	} else {
		slotNames.delete('base');
	}

	return slotNames;
};

// Whether a value is written as `null`, `undefined` or a `void` of a literal.
const isNullishValue = (node: Node): boolean =>
	isUndefinedValue(node) || (node.type === 'Literal' && node.raw === 'null');

// The class value a props or compound object carries: `class`, unless it's
// left nullish, then `className`, exactly as `sv()` reads them at runtime.
export const getClassValue = (
	properties: ReadonlyMap<string, Node>
): Node | undefined => {
	const classValue = properties.get('class');

	if (classValue === undefined || isNullishValue(classValue)) {
		return properties.get('className');
	}

	return classValue;
};

// The slots each group key of a slot object reaches that another key of the
// same object already targets: a key naming the slot, or an earlier group. A
// slot a group lists twice is that group's own repeat, not an overlap. Keys
// that overlap nothing are left out.
export const getSlotTargetOverlaps = (
	keys: Iterable<string>,
	groupSlots: GroupSlots
): SlotTargetOverlaps => {
	const targeted = new Map<string, string>();
	const overlaps = new Map<string, SlotTargetOverlap[]>();
	const groupEntries: GroupEntry[] = [];

	for (const key of keys) {
		const slots = groupSlots.get(key);

		if (slots === undefined) {
			targeted.set(key, key);
		} else {
			groupEntries.push([key, slots]);
		}
	}

	for (const [key, slots] of groupEntries) {
		for (const slot of slots) {
			const other = targeted.get(slot);

			if (other === undefined) {
				targeted.set(slot, key);
				continue;
			}

			if (other !== key) {
				getOrCreate(overlaps, key, () => []).push({ slot, other });
			}
		}
	}

	return overlaps;
};