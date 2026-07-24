import type { Rule } from 'eslint';
import {
	analyzeCnForRule,
	analyzeConfigForRule,
	createTrackedCallListeners,
	DOCS_URL
} from '../analyzer.ts';
import { buildExclusiveGroupMap } from '../tailwind-categories.ts';

/**
 * Flags class tokens that collide within the same slot output: exact-duplicate
 * tokens that will appear more than once (including across `base`, variants,
 * compounds, and within a single literal), distinct tokens that target the
 * same Tailwind-style utility namespace (e.g. `w-100` and `w-200`), and
 * shorthand/longhand overlaps where one token sets a property the other also
 * sets (`size-4`/`w-8`, `m-4`/`mt-2`, `inset-0`/`top-4`, `flex-1`/`grow-0`,
 * `truncate`/`overflow-x-auto`). Tokens with different variant prefixes
 * (`w-100` vs `hover:w-200`) don't conflict — stacked variants are compared as
 * a set, so `hover:focus:` and `focus:hover:` are the same prefix — a leading
 * or trailing `!` important marker is ignored when computing the namespace,
 * and mutually-exclusive positions are not flagged: different values of one
 * variant, compound entries whose matchers require different values, and
 * opposite branches of one condition (ternaries and logical-ANDs, with
 * complementary `cond`/`!cond` conditions matched by source text).
 *
 * A custom `exclusiveGroups` option listing the same utility in more than one
 * group throws synchronously from `create()` — there's no coherent way to
 * pick which group's conflict key the token should use.
 */
export const noConflictingClasses: Rule.RuleModule = {
	meta: {
		type: 'problem',
		docs: {
			description:
				'Disallow duplicate class tokens and tokens targeting the same utility namespace within an sv() or cn() output',
			recommended: true,
			url: DOCS_URL
		},
		schema: [
			{
				type: 'object',
				properties: {
					exclusiveGroups: {
						oneOf: [
							{ type: 'boolean' },
							{
								type: 'array',
								items: {
									type: 'array',
									items: { type: 'string' },
									minItems: 2
								}
							}
						]
					}
				},
				additionalProperties: false
			}
		],
		messages: {
			duplicate:
				'Class "{{token}}" will appear more than once in the "{{slot}}" slot output.',
			duplicateCn:
				'Class "{{token}}" will appear more than once in the call output.',
			conflict:
				'Conflicting classes "{{tokens}}" target the same utility namespace in the "{{slot}}" slot output.',
			conflictCn:
				'Conflicting classes "{{tokens}}" target the same utility namespace in the call output.'
		}
	},
	create(context) {
		const exclusiveGroups = buildExclusiveGroupMap(
			context.options[0]?.exclusiveGroups
		);

		return createTrackedCallListeners(context, (_node, call) => {
			if (call.config) {
				analyzeConfigForRule(
					context,
					call.config,
					call.args,
					exclusiveGroups
				);
			} else {
				analyzeCnForRule(context, call.args, exclusiveGroups);
			}
		});
	}
};