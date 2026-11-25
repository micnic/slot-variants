import type { Rule } from 'eslint';
import type { CallExpression, ObjectExpression } from 'estree';
import { type CallMatch, isLastArgument } from '../analyzer/call-matching.ts';
import { docsUrl } from '../analyzer/config-keys.ts';
import {
	analyzeSharedTokens,
	type SharedTokensCall
} from '../analyzer/shared-tokens.ts';
import {
	getCallFactory,
	mayInheritKey,
	type StyledContext
} from '../analyzer/styled-values.ts';
import { createTrackedCallListeners } from '../analyzer/call-listeners.ts';

// A call through a `createSV()`-derived function takes the factory's `base`
// unless it passes its own, so one is only created where the factory's
// defaults are known to have none; any other default may hold a `postProcess`.
// `sv()` itself, or a factory called without defaults, inherits nothing. Only
// a config written as the call's own last argument shares its base with that
// call's leading arguments; a hoisted one may be passed to other calls.
const getSharedTokensCall = (
	ctx: StyledContext,
	node: CallExpression,
	call: CallMatch,
	config: ObjectExpression
): SharedTokensCall => {
	const { defaultKeys, requiresAll } = getCallFactory(
		node.callee,
		call.imported,
		ctx
	);
	let leadingArg: SharedTokensCall['leadingArg'] = null;

	if (isLastArgument(node, config)) {
		leadingArg = call.args.at(-1) ?? null;
	}

	return {
		canCreateBase: !mayInheritKey(defaultKeys, 'base'),
		leadingArg,
		inheritsPostProcess: mayInheritKey(defaultKeys, 'postProcess'),
		inheritsRequiresAll: requiresAll
	};
};

/**
 * Flags class name tokens that appear in every value of an exhaustively-covered
 * variant — the token is constant in the rendered output and belongs in `base`
 * (or the corresponding `slots[slot]` entry) rather than being repeated across
 * each variant value. Coverage is treated as exhaustive when the variant has a
 * `defaultVariants` entry, is listed in `requiredVariants`, or every variant is
 * required via `requiredVariants: true`. A record whose only value is keyed
 * `true` or `false` is never exhaustive: the other boolean applies nothing.
 *
 * The lift is an autofix for a required variant only. Passing `null` skips a
 * default, so for a defaulted variant lifting the token would also apply it to
 * those calls — there the lift is offered as a suggestion instead. So it is
 * under a `postProcess` of the config's own or its `createSV()` factory's: one
 * merging classes keeps the last of two conflicting ones, and the lift moves
 * classes ahead of later variants' ones. The same goes for the single-key
 * compound fix below.
 *
 * A `createSV()` factory's `requiredVariants: true` counts unless the config
 * sets its own.
 *
 * Fixable when the fix is unambiguous: the `base`/`slots[slot]` target and
 * every variant value's contribution to that slot must each be a plain,
 * directly-authored string or template literal — an array, a value nested
 * inside further structure, or one read through a hoisted `const` binding
 * leaves the finding reported without a fix, rather than partially rewritten.
 * A config with no `base` property lifts into where its base classes already
 * are instead: a plain-literal `slots.base`, or else the call's last leading
 * argument when the config is written in the call. With neither, the property
 * is created, borrowing the variant values' own quote style and the layout of
 * the config's first property — except in a call through a `createSV()`-derived
 * function whose defaults may hold a `base`, which the created one would
 * replace. A config with a spread or computed key is never fixed, since it may
 * override what the fix edits. A value left with no tokens at all is not
 * fixable either, since that would trade this finding for an empty class
 * string.
 *
 * Also flags a `compoundVariants`/`compoundSlots` entry whose matcher covers
 * exactly one variant key — it isn't combining variants, so it isn't really a
 * compound: its class belongs directly on that variant's value instead. Skipped
 * when the matcher's variant is boolean shorthand (a single-branch variant has
 * no "other" value to hold the class), when the entry names a `preset` (whose
 * own variant values are matchers too), or when the entry's matcher shape can't
 * be counted reliably (a spread or computed key might hide a second matcher).
 * `compoundVariants` is auto-fixed when its class and the target variant
 * value(s) are all plain string/template literals; `compoundSlots` is always
 * reported without a fix, since its class targets a specific slot rather than
 * the whole variant value.
 */
export const noSharedTokens: Rule.RuleModule = {
	meta: {
		type: 'suggestion',
		docs: {
			description:
				'Disallow class tokens that appear in every value of an exhaustively-covered variant — lift them out of the variant',
			recommended: true,
			url: docsUrl('no-shared-tokens')
		},
		fixable: 'code',
		hasSuggestions: true,
		schema: [],
		messages: {
			shared: 'Class "{{token}}" appears in every value of variant "{{variant}}" for slot "{{slot}}" — lift it out of the variant.',
			liftSharedOrder:
				'Lift the classes every value of variant "{{variant}}" shares into slot "{{slot}}" (with a merging postProcess, they then come before the classes of the variants after it, which may change which conflicting class wins).',
			moveCompoundClass:
				'Move this entry\'s class onto variant "{{key}}"\'s value (with a merging postProcess, it then comes before the classes of the variants after it, which may change which conflicting class wins).',
			liftSharedInherited:
				'Lift the classes every value of variant "{{variant}}" shares into slot "{{slot}}" (they then also apply to the values of "{{variant}}" a parent in extend adds).',
			liftShared:
				'Lift the classes every value of variant "{{variant}}" shares into slot "{{slot}}" (they then also apply when "{{variant}}" is passed as null).',
			singleKeyCompound:
				'This {{kind}} entry only matches variant "{{key}}" ({{value}}) — move its class onto that variant\'s value instead of using {{kind}}.'
		}
	},
	create(context) {
		return createTrackedCallListeners(context, (node, call, ctx) => {
			if (!call.config) {
				return;
			}

			analyzeSharedTokens(
				context,
				call.config,
				getSharedTokensCall(ctx, node, call, call.config)
			);
		});
	}
};