import type { Identifier, Literal, Property } from 'estree';

// GitHub anchors a `slot-variants/<rule>` README heading as
// `slot-variants<rule>`, dropping the backticks and the slash.
export const docsUrl = (rule: string): string =>
	`https://github.com/micnic/slot-variants#slot-variants${rule}`;

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

// An export name is an identifier, or a string literal for the `export { x as
// "a-b" }` form.
export const getExportName = (node: Identifier | Literal): string => {
	if (node.type === 'Identifier') {
		return node.name;
	}

	return String(node.value);
};

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
	/* c8 ignore next 2 -- non-computed keys are an Identifier or Literal */
	return null;
};