import type { Rule, SourceCode } from 'eslint';
import type { ObjectExpression, Property, SpreadElement } from 'estree';
import { createTrackedCallListeners, DOCS_URL, getKeyName } from '../analyzer.ts';

/**
 * Canonical order for sv()/createSV() config keys. Fixed, not configurable —
 * matches the project's documented field order in the README's config table.
 */
const CONFIG_KEY_ORDER: readonly string[] = [
	'base',
	'slots',
	'variants',
	'compoundSlots',
	'compoundVariants',
	'defaultVariants',
	'requiredVariants',
	'presets',
	'multiSlots',
	'cacheSize',
	'introspection',
	'postProcess'
];

const ORDER_INDEX = new Map(
	CONFIG_KEY_ORDER.map((key, index) => [key, index])
);

type KeyEntry = {
	prop: Property;
	key: string;
	index: number;
};

// Reads each property's canonical-order index. A spread, a computed key, or a
// key outside CONFIG_KEY_ORDER makes the whole object's fixer unsafe (returned
// via `fixable: false`), but known keys are still collected so their order can
// still be checked and reported.
const collectOrderedEntries = (
	properties: ReadonlyArray<Property | SpreadElement>
): { entries: KeyEntry[]; fixable: boolean } => {
	const entries: KeyEntry[] = [];
	let fixable = true;

	for (const prop of properties) {
		if (prop.type !== 'Property' || prop.computed) {
			fixable = false;
			continue;
		}

		const key = getKeyName(prop);

		/* c8 ignore next 4 -- property is guaranteed non-computed at this point, so getKeyName won't return null */
		if (key === null) {
			fixable = false;
			continue;
		}

		const index = ORDER_INDEX.get(key);

		/* c8 ignore next 4 -- every key found by getKeyName is in CONFIG_KEY_ORDER by construction */
		if (index === undefined) {
			fixable = false;
			continue;
		}

		entries.push({ prop, key, index });
	}

	return { entries, fixable };
};

// Any comment inside the config object (attached to a property, or floating
// between them) disables the reorder fixer for that call — safely reattaching
// comments to their moved property isn't attempted, matching the "under-suppress,
// never wrongly rewrite" bail-out pattern used elsewhere in this plugin.
const hasCommentsInside = (
	context: Rule.RuleContext,
	node: ObjectExpression
): boolean => context.sourceCode.getCommentsInside(node).length > 0;

const DEFAULT_SEPARATOR = ',\n\t';

// The separator (comma + whitespace) between the first two properties in
// their original source order, reused between every reordered property so
// the rewritten object keeps the file's existing formatting.
const getEntrySeparator = (sourceCode: SourceCode, entries: ReadonlyArray<KeyEntry>): string => {
	const first = entries[0];
	const second = entries[1];

	if (!first || !second) {
		return DEFAULT_SEPARATOR;
	}

	const [, firstEnd] = sourceCode.getRange(first.prop);
	const [secondStart] = sourceCode.getRange(second.prop);

	return sourceCode.getText().slice(firstEnd, secondStart);
};

const buildReorderFix = (
	sourceCode: SourceCode,
	entries: ReadonlyArray<KeyEntry>
): ((fixer: Rule.RuleFixer) => Rule.Fix | null) => {
	const sorted = [...entries].sort((a, b) => a.index - b.index);
	const separator = getEntrySeparator(sourceCode, entries);
	const text = sorted.map((entry) => sourceCode.getText(entry.prop)).join(separator);

	return (fixer) => {
		const first = entries[0];
		const last = entries[entries.length - 1];

		/* c8 ignore next 3 -- callers only build this fix for a non-empty entries array */
		if (!first || !last) {
			return null;
		}

		const [start] = sourceCode.getRange(first.prop);
		const [, end] = sourceCode.getRange(last.prop);

		return fixer.replaceTextRange([start, end], text);
	};
};

const checkKeyOrder = (context: Rule.RuleContext, configNode: ObjectExpression) => {
	const { entries, fixable } = collectOrderedEntries(configNode.properties);
	let fix: ((fixer: Rule.RuleFixer) => Rule.Fix | null) | undefined;

	if (fixable && !hasCommentsInside(context, configNode)) {
		fix = buildReorderFix(context.sourceCode, entries);
	}

	let runningMax: KeyEntry | null = null;

	for (const entry of entries) {
		if (runningMax !== null && entry.index < runningMax.index) {
			context.report({
				node: entry.prop,
				messageId: 'wrongOrder',
				data: { key: entry.key, before: runningMax.key },
				fix
			});
			continue;
		}

		runningMax = entry;
	}
};

export const svConfigStyle: Rule.RuleModule = {
	meta: {
		type: 'suggestion',
		docs: {
			description:
				'Enforce a canonical sv() config key order and a single base-class style',
			recommended: true,
			url: DOCS_URL
		},
		fixable: 'code',
		schema: [],
		messages: {
			wrongOrder:
				'Config key "{{key}}" should come before "{{before}}" (canonical order: base, slots, variants, compoundSlots, compoundVariants, defaultVariants, requiredVariants, presets, multiSlots, cacheSize, introspection, postProcess).'
		}
	},
	create(context) {
		return createTrackedCallListeners(context, (_node, call) => {
			/* c8 ignore next 3 -- call.config is only null for non-sv/createSV calls, which RuleTester doesn't emit */
			if (!call.config) {
				return;
			}

			checkKeyOrder(context, call.config);
		});
	}
};