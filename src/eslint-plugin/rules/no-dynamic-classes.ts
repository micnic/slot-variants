import type { Rule } from 'eslint';
import { docsUrl } from '../analyzer/config-keys.ts';
import { checkCnArguments, checkSvConfig } from '../analyzer/static-values.ts';
import { resolveStyledClasses } from '../analyzer/styled-values.ts';
import { createTrackedCallListeners } from '../analyzer/call-listeners.ts';

/**
 * Flags dynamic values in `sv()` and `cn()` calls. A class-bearing position
 * allows only values known at lint time: string literals, template literals
 * without expressions, arrays of those, and `const` bindings to any of them.
 * Config records (`slots`, `variants`, compound entries) need static keys and
 * values, and a config class value may also be `undefined`.
 *
 * In a `cn()`-style position, `cond && x`, ternaries and ternary templates are
 * allowed when every branch is static. An object there is a clsx-style record
 * whose keys are the classes, so only its keys must be static; its values are
 * runtime conditions and aren't checked. A placeholder `cn()` skips (`null`,
 * `undefined`, a boolean) is allowed there too.
 *
 * A `cn()`-style argument that resolves to another `sv()`/`cn()` call's output
 * (`cn(classes.base, 'p-4')`) is exempt: its classes are known at lint time,
 * and `no-restyle` is what checks them against what sits beside them.
 */
export const noDynamicClasses: Rule.RuleModule = {
	meta: {
		type: 'problem',
		docs: {
			description:
				'Disallow dynamic values in sv() and cn() calls — only statically inferrable class values are allowed',
			recommended: true,
			url: docsUrl('no-dynamic-classes')
		},
		schema: [],
		messages: {
			dynamic:
				'Dynamic value in sv()/cn() call. Only statically inferrable class values are allowed.'
		}
	},
	create(context) {
		return createTrackedCallListeners(context, (_node, call, ctx) => {
			checkCnArguments(
				context,
				call.args,
				(node) => resolveStyledClasses(node, ctx) !== null
			);

			if (call.config) {
				checkSvConfig(context, call.config);
			}
		});
	}
};