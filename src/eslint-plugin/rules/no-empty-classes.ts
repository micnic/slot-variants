import type { Rule } from 'eslint';
import {
    checkConfigForEmptyClasses,
	createTrackedCallListeners,
	DOCS_URL,
    forEachStaticItem,
    makeListFix,
    visitForEmptyClasses
} from '../analyzer.ts';

/**
 * Flags empty class values — empty strings, empty arrays, and empty objects —
 * in `sv()` and `cn()` calls, plus zero-argument `sv()` / `cn()` calls (which
 * always produce an empty class string). Inside an `sv()` config, an empty
 * string is still allowed as a direct `slots[key]` value, since declaring a
 * slot with no default classes is a meaningful use case. Also flags an empty
 * array (`[]`) as a `compoundVariants`/`compoundSlots` matcher value — since
 * `matchesCompound` in `sv.ts` tests it with `.some()`, an empty array can
 * never match, so the whole compound entry is permanently unreachable.
 */
export const noEmptyClasses: Rule.RuleModule = {
	meta: {
		type: 'problem',
		docs: {
			description:
				'Disallow empty class values (empty strings, arrays, or objects), zero-argument calls, and empty compound matcher arrays in sv() and cn()',
			recommended: true,
			url: DOCS_URL
		},
		fixable: 'code',
		schema: [],
		messages: {
			emptyString: 'Empty class string is not allowed.',
			emptyArray: 'Empty class array is not allowed.',
			emptyObject: 'Empty class object is not allowed.',
			emptyCall: 'Empty sv()/cn() call is not allowed.',
			unreachableMatcher:
				'Empty array matcher for "{{key}}" can never match — this compound entry is unreachable.'
		}
	},
	create(context) {
		return createTrackedCallListeners(context, (node, call) => {
			if (node.arguments.length === 0) {
				// `createSV()` with no defaults is a valid factory call.
				if (call.isFactoryConfig !== true) {
					context.report({ node, messageId: 'emptyCall' });
				}

				return;
			}

			forEachStaticItem(call.args, (arg) => {
				visitForEmptyClasses(
					context,
					arg,
					false,
					makeListFix(context, arg, node.arguments),
					true
				);
			});

			if (call.config) {
				checkConfigForEmptyClasses(context, call.config);
			}
		});
	}
};