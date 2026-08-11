import type { Property } from 'estree';

export const DOCS_URL = 'https://github.com/micnic/slot-variants#rules';

/**
 * Every recognized sv()/createSV() config key, in the project's canonical
 * declaration order (the order documented in the README's config table). The
 * `sv-config-style` rule enforces this order, and `CONFIG_KEYS` is derived from
 * it so the two can't drift apart.
 */
export const CONFIG_KEY_ORDER: readonly string[] = [
	'base',
	'slots',
	'groups',
	'multiSlots',
	'variants',
	'presets',
	'compoundSlots',
	'compoundVariants',
	'defaultVariants',
	'requiredVariants',
	'cacheSize',
	'introspection',
	'postProcess'
];

export const CONFIG_KEYS = new Set(CONFIG_KEY_ORDER);

export const getKeyName = (prop: Property): string | null => {
	if (prop.computed) {
		return null;
	}

	const { key } = prop;

	if (key.type === 'Identifier') {
		return key.name;
	}

	if (key.type === 'Literal') {
		return String(key.value);
	}
	/* c8 ignore next 2 -- non-computed object keys are parser-emitted as Identifier or Literal */
	return null;
};