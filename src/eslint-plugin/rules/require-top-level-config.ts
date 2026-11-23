import type { Rule } from 'eslint';
import { docsUrl } from '../analyzer/config-keys.ts';
import { findRepeatedEvaluation } from '../analyzer/repeated-evaluation.ts';
import { createTrackedCallListeners } from '../analyzer/call-listeners.ts';

/**
 * Flags `sv()` calls made with a config object that aren't at the module top
 * level. The config form compiles the variant function once; re-entering the
 * call recreates that work — and throws away the variant cache — every time, so
 * it must live at module scope. Five shapes do that: a function body, which
 * re-runs per call, a loop, which re-runs per iteration, an instance class
 * field initializer, which re-runs per `new`, a Svelte markup or Vue template
 * expression, which re-runs per render, and a component's instance script
 * (Svelte's `<script>`, Vue's `<script setup>`), which re-runs per component
 * instance. A `static` field or static block runs once with the class
 * definition, and an immediately invoked function's body once where it is
 * called, so they are left alone. The cn-style calling convention of `sv()`
 * (and every `cn()` call) carries no config and is left alone too.
 */
export const requireTopLevelConfig: Rule.RuleModule = {
	meta: {
		type: 'problem',
		docs: {
			description:
				'Require sv() calls with a config object to be at the module top level',
			recommended: true,
			url: docsUrl('require-top-level-config')
		},
		schema: [],
		messages: {
			nested: 'sv() with a config object must be called at the module top level, not nested inside a function — otherwise its compiled config and variant cache are rebuilt on every call.',
			loop: 'sv() with a config object must be called at the module top level, not inside a loop — otherwise its compiled config and variant cache are rebuilt on every iteration.',
			field: 'sv() with a config object must be called at the module top level, not in a class field initializer — otherwise its compiled config and variant cache are rebuilt for every instance. Move it out of the class, or make the field `static`.',
			template:
				'sv() with a config object must be called at the module top level, not in a template expression — otherwise its compiled config and variant cache are rebuilt on every render. Move it into the script.',
			instance:
				"sv() with a config object must be called at the module top level, not in a component's instance script — otherwise its compiled config and variant cache are rebuilt for every component instance. Move it to a module script: `<script module>` in Svelte, a plain `<script>` in Vue."
		}
	},
	create(context) {
		return createTrackedCallListeners(context, (node, call) => {
			// A `createSV()` factory call compiles no variant
			// function, so it's exempt — only the returned
			// function's config calls must be top level.
			if (!call.config || call.isFactoryConfig) {
				return;
			}

			const reason = findRepeatedEvaluation(context, node);

			if (reason !== null) {
				context.report({ node, messageId: reason });
			}
		});
	}
};