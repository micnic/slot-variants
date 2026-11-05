import type { Node, ObjectExpression } from 'estree';
import { getOrCreate } from '../map-utils.ts';
import { getKeyName } from './config-keys.ts';

type KeyPredicate = (key: string) => boolean;

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
	slotNames: Set<string>
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
	config: ReadonlyMap<string, Node>
): Set<string> => {
	const slotNames = new Set(getProperties(config.get('slots')).keys());

	for (const groupName of getProperties(config.get('groups')).keys()) {
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