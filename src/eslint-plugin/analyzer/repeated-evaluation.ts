import type { Rule } from 'eslint';
import type { CallExpression, Node } from 'estree';
import { isComponentFunction } from './components.ts';

// Why a call would be evaluated more than once, or null when it runs exactly
// once at module evaluation. The reasons double as require-top-level-config's
// messageIds, so the report needs no mapping.
type RepeatedEvaluation = 'nested' | 'field' | 'template' | null;

// Every Svelte markup node is a `Svelte*` one; the script's code sits under its
// `SvelteScriptElement` instead.
const SVELTE_NODE_PREFIX = 'Svelte';
const SVELTE_SCRIPT_ELEMENT = 'SvelteScriptElement';

// Wraps every Vue template expression: `{{ }}` and directive values alike.
const VUE_EXPRESSION_CONTAINER = 'VExpressionContainer';

// A Svelte markup or Vue template node, whose expressions are evaluated again
// on every render. Its type is read as a plain string, since these nodes
// aren't ESTree's.
const isTemplateNode = (node: Node): boolean => {
	const type: string = node.type;

	if (type === VUE_EXPRESSION_CONTAINER) {
		return true;
	}

	return (
		type.startsWith(SVELTE_NODE_PREFIX) && type !== SVELTE_SCRIPT_ELEMENT
	);
};

// An `sv()` config call compiles the variant function (and seeds its cache)
// once; anything that re-enters the call rebuilds and discards that work. A
// function body re-runs per call, an instance field initializer per `new`, and
// a template expression per render.
// A `static` field and a static block both run once with the class definition,
// so they're fine on their own — but the class may itself sit inside a
// function, which is why the walk doesn't stop at them. The innermost reason
// wins, so the report names what the author can see around the call.
export const findRepeatedEvaluation = (
	context: Rule.RuleContext,
	node: CallExpression
): RepeatedEvaluation => {
	let reason: RepeatedEvaluation = null;

	for (const ancestor of context.sourceCode.getAncestors(node)) {
		if (isComponentFunction(ancestor)) {
			reason = 'nested';
		} else if (
			ancestor.type === 'PropertyDefinition' &&
			ancestor.static === false
		) {
			reason = 'field';
		} else if (isTemplateNode(ancestor)) {
			reason = 'template';
		}
	}

	return reason;
};