import type { Rule } from 'eslint';
import { DOCS_URL } from '../analyzer/config-keys.ts';
import {
	dispatchSvConfigCheckers,
	svRedundantSpacesConfigValueCheckers,
	visitForRedundantSpaces
} from '../analyzer/redundant-spaces.ts';
import { forEachStaticItem } from '../analyzer/token-extraction.ts';
import { createTrackedCallListeners } from '../analyzer/tracked-calls.ts';

/**
 * Flags redundant whitespace inside class strings passed to `sv()` and `cn()`
 * calls. A class string's whitespace is canonical only as a single ASCII space
 * between non-whitespace tokens; leading, trailing, repeated, or non-space
 * whitespace runs are reported. Dynamic expressions are skipped silently.
 */
export const noRedundantSpaces: Rule.RuleModule = {
	meta: {
		type: 'problem',
		docs: {
			description:
				'Disallow redundant whitespace inside class strings passed to sv() and cn() calls',
			recommended: true,
			url: DOCS_URL
		},
		fixable: 'code',
		schema: [],
		messages: {
			redundant: 'Redundant whitespace in class string.'
		}
	},
	create(context) {
		return createTrackedCallListeners(context, (_node, call) => {
			forEachStaticItem(call.args, (arg) => {
				visitForRedundantSpaces(context, arg, true);
			});

			if (call.config) {
				dispatchSvConfigCheckers(
					context,
					call.config,
					svRedundantSpacesConfigValueCheckers
				);
			}
		});
	}
};