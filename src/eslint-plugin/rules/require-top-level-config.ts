import type { Rule } from 'eslint';
import {
	createTrackedCallListeners,
	DOCS_URL,
	isInsideFunctionScope
} from '../analyzer.ts';

/**
 * Flags `sv()` calls made with a config object that aren't at the module top
 * level. The config form compiles the variant function once; nesting it inside
 * a function recreates that work — and throws away the variant cache — on every
 * call, so it must live at module scope. The cn-style calling convention of
 * `sv()` (and every `cn()` call) carries no config and is left alone.
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
			nested: 'sv() with a config object must be called at the module top level, not nested inside a function — otherwise its compiled config and variant cache are rebuilt on every call.'
		}
	},
	create(context) {
		return createTrackedCallListeners(context, (node, call) => {
			// A `createSV()` factory call compiles no variant function, so it's
			// exempt — only the returned function's config calls must be top level.
			if (!call.config || call.isFactoryConfig === true) {
				return;
			}

			if (isInsideFunctionScope(context.sourceCode.getScope(node))) {
				context.report({ node, messageId: 'nested' });
			}
		});
	}
};