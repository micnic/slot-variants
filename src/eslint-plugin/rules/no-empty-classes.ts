import type { Rule } from 'eslint';
import { isLastArgument } from '../analyzer/call-matching.ts';
import { docsUrl } from '../analyzer/config-keys.ts';
import {
	checkConfigForEmptyClasses,
	visitForEmptyClasses
} from '../analyzer/empty-classes.ts';
import { type EmptyFix, makeListFix } from '../analyzer/list-fix.ts';
import { getFactoryDefaults } from '../analyzer/styled-values.ts';
import { forEachStaticItem } from '../analyzer/token-extraction.ts';
import { createTrackedCallListeners } from '../analyzer/tracked-calls.ts';

/**
 * Flags empty class values — empty strings, empty arrays, and empty objects —
 * in `sv()` and `cn()` calls, plus zero-argument `sv()` / `cn()` calls (which
 * always produce an empty class string). Inside an `sv()` config, an empty
 * string is still allowed at a direct `slots[key]` or `variants` value
 * position, since declaring a slot or a variant value with no classes of its
 * own is a meaningful use case. Also flags an empty array (`[]`) as a
 * `compoundVariants`/`compoundSlots` matcher value — a matcher must list at
 * least one value, so `sv()` throws for the config — and an empty `slots`
 * list of a `compoundSlots` entry, which `sv()` rejects the same way.
 *
 * The config containers that carry no class values of their own —
 * `defaultVariants`, `requiredVariants`, `multiSlots`, `presets`, `groups` —
 * are reported when empty too: each one reads as configuration while changing
 * nothing about the output.
 *
 * An empty config value that overrides one a spread before it or the call's
 * `createSV()` defaults may set is left alone, as removing it would bring that
 * one back.
 */
export const noEmptyClasses: Rule.RuleModule = {
	meta: {
		type: 'problem',
		docs: {
			description:
				'Disallow empty class values (empty strings, arrays, or objects), zero-argument calls, and empty compound matcher arrays in sv() and cn()',
			recommended: true,
			url: docsUrl('no-empty-classes')
		},
		fixable: 'code',
		schema: [],
		messages: {
			emptyString: 'Empty class string is not allowed.',
			emptyArray: 'Empty class array is not allowed.',
			emptyObject: 'Empty class object is not allowed.',
			emptyCall: 'Empty sv()/cn() call is not allowed.',
			emptyConfig:
				'Empty "{{key}}" has no effect — remove it or fill it in.',
			emptyMatcher:
				'Empty array matcher for "{{key}}" makes sv() throw — a compound matcher must list at least one value.',
			emptySlotTargets:
				'Empty "slots" makes sv() throw — a compound slot must name at least one slot.'
		}
	},
	create(context) {
		return createTrackedCallListeners(context, (node, call, ctx) => {
			if (node.arguments.length === 0) {
				// `createSV()` with no defaults is a valid factory call.
				if (!call.isFactoryConfig) {
					context.report({ node, messageId: 'emptyCall' });
				}

				return;
			}

			forEachStaticItem(call.args, (arg) => {
				let fix: EmptyFix | undefined;

				if (!call.keepsLastArg || !isLastArgument(node, arg)) {
					fix = makeListFix(context, arg, node.arguments);
				}

				visitForEmptyClasses(context, arg, false, fix, true);
			});

			if (call.config) {
				checkConfigForEmptyClasses(
					context,
					call.config,
					getFactoryDefaults(node, call, ctx)
				);
			}
		});
	}
};