import type { SourceCode } from 'eslint';
import type { Node, ObjectExpression } from 'estree';
import { getOrCreate } from '../map-utils.ts';
import { getKeyName } from './config-keys.ts';
import { resolveContainer } from './const-bindings.ts';

type KeyPredicate = (key: string) => boolean;

export type GroupSlots = ReadonlyMap<string, ReadonlyArray<string>>;

export type SlotTargetOverlap = { slot: string; other: string };

type SlotTargetOverlaps = ReadonlyMap<string, readonly SlotTargetOverlap[]>;

type GroupEntry = [group: string, slots: ReadonlyArray<string>];

const EMPTY_PROPERTIES: ReadonlyMap<string, Node> = new Map();

const propertiesCache = new WeakMap<
	ObjectExpression,
	ReadonlyMap<string, Node>
>();

const strictPropertiesCache = new WeakMap<
	ObjectExpression,
	ReadonlyMap<string, Node> | null
>();

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

const buildStrictPropertiesMap = (
	obj: ObjectExpression
): ReadonlyMap<string, Node> | null => {
	const map = new Map<string, Node>();

	for (const prop of obj.properties) {
		if (prop.type !== 'Property') {
			return null;
		}

		const key = getKeyName(prop);

		if (key === null) {
			return null;
		}

		map.set(key, prop.value);
	}

	return map;
};

export const getStrictProperties = (
	obj: Node | undefined
): ReadonlyMap<string, Node> | null => {
	if (!obj || obj.type !== 'ObjectExpression') {
		return null;
	}

	return getOrCreate(strictPropertiesCache, obj, () =>
		buildStrictPropertiesMap(obj)
	);
};

// The strict properties of a non-empty object whose every key passes
// `isAllowed`. Null for anything else, including an object with a spread,
// computed or disallowed key.
export const getStrictPropertiesWithKeys = (
	node: Node | undefined,
	isAllowed: KeyPredicate
): ReadonlyMap<string, Node> | null => {
	const properties = getStrictProperties(node);

	if (!properties || properties.size === 0) {
		return null;
	}

	for (const key of properties.keys()) {
		if (!isAllowed(key)) {
			return null;
		}
	}

	return properties;
};

export const collectSlotKeyedProperties = (
	node: Node,
	slotNames: ReadonlySet<string>
): ReadonlyMap<string, Node> | null => {
	if (slotNames.size === 0) {
		return null;
	}

	return getStrictPropertiesWithKeys(
		node,
		(key) => key === 'base' || slotNames.has(key)
	);
};

// Every name a per-slot object may be keyed by: the declared slots plus the
// group names that stand for them, mirroring how `sv()` reads those objects.
// `base` is dropped since it is keyable without being declared.
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

	slotNames.delete('base');

	return slotNames;
};

// The class value a props or compound object carries.
// `class` wins over `className` when both are present,
// exactly as `sv()` resolves them at runtime.
export const getClassValue = (
	properties: ReadonlyMap<string, Node>
): Node | undefined => properties.get('class') ?? properties.get('className');

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