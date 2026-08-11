import type { SourceCode } from 'eslint';
import type { Node } from 'estree';

// Token identity follows the value the browser sees, so a class string with an
// escape has to be split on its cooked value: `'w-1 w-2'` is two classes
// even though its source holds no whitespace to split on, and `'w-1'` is
// the same class as `w-1`. Escapes are the only thing that can make the two
// disagree, so a source without a backslash tokenizes exactly as written (the
// caller's fast path) and keeps per-token report offsets. With one, mapping each
// token back through the escapes would be needed to place it, so the whole
// literal is highlighted instead — the trade-off `reportRedundantSpaces` already
// makes. A fix is unaffected: `canHoistAsLiteral` refuses any rewrite whose text
// would contain a backslash, so an escape-bearing literal is reported unfixed
// either way.
export const hasEscape = (rawText: string): boolean => rawText.includes('\\');

// The literal's inner text exactly as written — not its cooked value. Shared
// by token extraction and the shared-tokens/no-redundant-spaces fixers, which
// all need to diff or rewrite the raw source rather than the cooked value.
export const getInnerText = (sourceCode: SourceCode, node: Node): string =>
	sourceCode.getText(node).slice(1, -1);

// A string/template literal's opening delimiter, read from its source text.
export const getQuoteChar = (sourceCode: SourceCode, node: Node): string => {
	const raw = sourceCode.getText(node);

	/* c8 ignore next -- a string-literal/template node always has at least one delimiter char */
	return raw[0] ?? '';
};

// Class tokens shouldn't contain the surrounding quote, backslashes, or `${` —
// re-emitting at the same delimiter is safe without escaping.
/* c8 ignore next 7 -- realistic class tokens don't contain backslashes, quotes, or `${` */
export const canHoistAsLiteral = (
	canonical: string,
	quote: string
): boolean => {
	if (canonical.includes('\\') || canonical.includes(quote)) {
		return false;
	}

	return quote !== '`' || !canonical.includes('${');
};

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