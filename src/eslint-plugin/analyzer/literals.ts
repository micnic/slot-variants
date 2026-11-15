import type { Rule, SourceCode } from 'eslint';
import type { Node } from 'estree';

/** A literal to re-emit with new text at its own delimiter. */
export type LiteralRewrite = { node: Node; nextText: string; quote: string };

// HTML splits a class attribute on ASCII whitespace only — space, tab, line
// feed, form feed and carriage return. Any other space, like a non-breaking
// one, is part of a class name, unlike in JavaScript's `\s`.
const CLASS_SEPARATOR = /[\t\n\f\r ]+/;

// A run of non-separator characters: one class name.
export const CLASS_TOKEN = /[^\t\n\f\r ]+/g;

// A separator at the very start or end of a text.
export const LEADING_SEPARATOR = /^[\t\n\f\r ]/;
export const TRAILING_SEPARATOR = /[\t\n\f\r ]$/;

// The literal's inner text exactly as written — not its cooked value — for
// token extraction and the shared-tokens fixer, which diff or rewrite the raw
// source rather than the cooked value.
export const getInnerText = (sourceCode: SourceCode, node: Node): string =>
	sourceCode.getText(node).slice(1, -1);

// The whitespace-separated tokens of a class string, in source order. The
// shared-tokens fixers pass a literal's raw inner text (`getInnerText`), never
// its cooked value: their token identity is the raw source substring, so
// diffing against the cooked value would miscompare whenever a token contains
// an escape sequence.
export const splitClassTokens = (text: string): string[] =>
	text.split(CLASS_SEPARATOR).filter(Boolean);

// Whether the text can be written at the delimiter as is: it must not hold a
// backslash, the delimiter itself, or — in a template — `${`, any of which
// would need escaping (an arbitrary value like `content-['x']` can).
const canHoistAsLiteral = (canonical: string, quote: string): boolean => {
	if (canonical.includes('\\') || canonical.includes(quote)) {
		return false;
	}

	return quote !== '`' || !canonical.includes('${');
};

// Plans re-emitting a string/template literal as `nextTokens` joined by single
// spaces, at the literal's own delimiter. Null when the new text can't be
// written there without escaping (see `canHoistAsLiteral`), so callers drop
// the fix rather than apply part of it. `node` must be a plain,
// directly-authored literal.
export const planLiteralRewrite = (
	sourceCode: SourceCode,
	node: Node,
	nextTokens: readonly string[]
): LiteralRewrite | null => {
	// A string/template literal opens with its delimiter
	const quote = sourceCode.getText(node).charAt(0);
	const nextText = nextTokens.join(' ');

	if (!canHoistAsLiteral(nextText, quote)) {
		return null;
	}

	return { node, nextText, quote };
};

export const replaceLiteral = (
	fixer: Rule.RuleFixer,
	{ node, nextText, quote }: LiteralRewrite
): Rule.Fix => fixer.replaceText(node, `${quote}${nextText}${quote}`);

export const getStaticStringText = (node: Node): string | null => {
	if (node.type === 'Literal') {
		if (typeof node.value === 'string') {
			return node.value;
		}

		return null;
	}

	if (node.type !== 'TemplateLiteral' || node.expressions.length > 0) {
		return null;
	}

	const [quasi] = node.quasis;

	/* c8 ignore next 3 -- a TemplateLiteral always has at least one quasi */
	if (!quasi) {
		return null;
	}

	/* c8 ignore next -- cooked is always defined on untagged templates */
	return quasi.value.cooked ?? quasi.value.raw;
};

// A static literal's class tokens as written in source (see
// `splitClassTokens`), or null when the node isn't a static string.
export const getRawLiteralTokens = (
	sourceCode: SourceCode,
	node: Node
): string[] | null => {
	if (getStaticStringText(node) === null) {
		return null;
	}

	return splitClassTokens(getInnerText(sourceCode, node));
};