import type { Rule } from 'eslint';
import {
	createTrackedCallListeners,
	DOCS_URL,
	findRepeatedEvaluation
} from '../analyzer.ts';

/**
 * Flags `sv()` calls made with a config object that aren't at the module top
 * level. The config form compiles the variant function once; re-entering the
 * call recreates that work — and throws away the variant cache — every time, so
 * it must live at module scope. Two shapes do that: a function body, which
 * re-runs per call, and an instance class field initializer, which re-runs per
 * `new`. A `static` field or static block runs once with the class definition
 * and is left alone. The cn-style calling convention of `sv()` (and every
 * `cn()` call) carries no config and is left alone too.
 */
export const requireTopLevelConfig: Rule.RuleModule = {
	meta: {
		type: 'problem',
		docs: {
			description:
				'Require sv() calls with a config object to be at the module top level',
			recommended: true,
			url: DOCS_URL
		},
		schema: [],
		messages: {
			nested: 'sv() with a config object must be called at the module top level, not nested inside a function — otherwise its compiled config and variant cache are rebuilt on every call.',
			field: 'sv() with a config object must be called at the module top level, not in a class field initializer — otherwise its compiled config and variant cache are rebuilt for every instance. Move it out of the class, or make the field `static`.'
		}
	},
	create(context) {
		return createTrackedCallListeners(context, (node, call) => {
			// A `createSV()` factory call compiles no variant function, so it's
			// exempt — only the returned function's config calls must be top level.
			if (!call.config || call.isFactoryConfig === true) {
				return;
			}

			const reason = findRepeatedEvaluation(context, node);

			if (reason !== null) {
				context.report({ node, messageId: reason });
			}
		});
	}
};