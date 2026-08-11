import type { Rule } from 'eslint';
import type { CallExpression } from 'estree';

const FUNCTION_TYPES: ReadonlySet<string> = new Set([
	'FunctionDeclaration',
	'FunctionExpression',
	'ArrowFunctionExpression'
]);

// Why a call would be evaluated more than once, or null when it runs exactly
// once at module evaluation. The two reasons double as require-top-level-config's
// messageIds, so the report needs no mapping.
export type RepeatedEvaluation = 'nested' | 'field' | null;

// An `sv()` config call compiles the variant function (and seeds its cache)
// once; anything that re-enters the call rebuilds and discards that work. A
// function body re-runs per call, and an instance field initializer per `new`.
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
		if (FUNCTION_TYPES.has(ancestor.type)) {
			reason = 'nested';
		} else if (
			ancestor.type === 'PropertyDefinition' &&
			ancestor.static === false
		) {
			reason = 'field';
		}
	}

	return reason;
};