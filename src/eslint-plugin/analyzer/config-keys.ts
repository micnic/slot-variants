import type { Property } from 'estree';
import { getExportName } from './module-syntax.ts';

/**
 * Every recognized sv()/createSV() config key, in the project's canonical
 * declaration order (the order documented in the README's config table),
 * which the `sv-config-style` rule enforces.
 */
export const CONFIG_KEY_ORDER: readonly string[] = [
	'extend',
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

// GitHub anchors a `slot-variants/<rule>` README heading as
// `slot-variants<rule>`, dropping the backticks and the slash.
export const docsUrl = (rule: string): string =>
	`https://github.com/micnic/slot-variants#slot-variants${rule}`;

export const getKeyName = ({ computed, key }: Property): string | null => {
	// A non-computed key is an Identifier or a Literal
	if (computed || (key.type !== 'Identifier' && key.type !== 'Literal')) {
		return null;
	}

	return getExportName(key);
};