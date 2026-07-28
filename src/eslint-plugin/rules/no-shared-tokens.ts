import type { Rule } from 'eslint';
import {
	analyzeSharedTokens,
	createTrackedCallListeners,
	DOCS_URL
} from '../analyzer.ts';

/**
 * Flags class name tokens that appear in every value of an exhaustively-covered
 * variant — the token is constant in the rendered output and belongs in `base`
 * (or the corresponding `slots[slot]` entry) rather than being repeated across
 * each variant value. Coverage is treated as exhaustive when the variant has a
 * `defaultVariants` entry, is listed in `requiredVariants`, or every variant is
 * required via `requiredVariants: true`.
 *
 * Auto-fixable when the fix is unambiguous: the `base`/`slots[slot]` target and
 * every variant value's contribution to that slot must each be a plain,
 * directly-authored string or template literal — an array, a value nested
 * inside further structure, or one read through a hoisted `const` binding
 * leaves the finding reported without a fix, rather than partially rewritten.
 * A config with no `base` property yet is still fixable: the property is
 * created, borrowing the variant values' own quote style and the layout of the
 * config's first property. A value left with no tokens at all is not, since
 * that would trade this finding for an empty class string.
 *
 * Also flags a `compoundVariants`/`compoundSlots` entry whose matcher covers
 * exactly one variant key — it isn't combining variants, so it isn't really a
 * compound: its class belongs directly on that variant's value instead. Skipped
 * when the matcher's variant is boolean shorthand (a single-branch variant has
 * no "other" value to hold the class) or when the entry's matcher shape can't
 * be counted reliably (a spread or computed key might hide a second matcher).
 * `compoundVariants` is auto-fixed when its class and the target variant
 * value(s) are all plain string/template literals; `compoundSlots` is always
 * reported without a fix, since its class targets a specific slot rather than
 * the whole variant value.
 */
export const noSharedTokens: Rule.RuleModule = {
	meta: {
		type: 'problem',
		docs: {
			description:
				'Disallow class tokens that appear in every value of an exhaustively-covered variant — lift them out of the variant',
			recommended: true,
			url: DOCS_URL
		},
		fixable: 'code',
		schema: [],
		messages: {
			shared: 'Class "{{token}}" appears in every value of variant "{{variant}}" for slot "{{slot}}" — lift it out of the variant.',
			singleKeyCompound:
				'This {{kind}} entry only matches variant "{{key}}" ({{value}}) — move its class onto that variant\'s value instead of using {{kind}}.'
		}
	},
	create(context) {
		return createTrackedCallListeners(context, (_node, call) => {
			if (!call.config) {
				return;
			}

			analyzeSharedTokens(context, call.config);
		});
	}
};