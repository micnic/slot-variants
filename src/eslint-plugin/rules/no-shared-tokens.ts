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
			shared: 'Class "{{token}}" appears in every value of variant "{{variant}}" for slot "{{slot}}" — lift it out of the variant.'
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