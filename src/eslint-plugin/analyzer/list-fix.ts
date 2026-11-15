import type { AST, Rule, SourceCode } from 'eslint';
import type { Node } from 'estree';

export type ListItems = ReadonlyArray<Node | null>;

// Built by `makeListFix` for a call/array list element, or supplied directly
// for a config property.
export type EmptyFix = (fixer: Rule.RuleFixer) => Rule.Fix | null;

// `charAt` returns '' past either end of the string, so neither of the walks
// below needs a bounds check.
const isSpaceOrTab = (char: string): boolean => char === ' ' || char === '\t';

// The end of the run of horizontal whitespace starting at `from`. A newline
// stops it: a line break belongs to the line that follows, so it's removed with
// the element ahead of it rather than trailed behind.
const skipSpacesAndTabs = (text: string, from: number): number => {
	let index = from;

	while (isSpaceOrTab(text.charAt(index))) {
		index += 1;
	}

	return index;
};

// The start of the run of horizontal whitespace ending at `to`.
const skipSpacesAndTabsBack = (text: string, to: number): number => {
	let index = to;

	while (isSpaceOrTab(text.charAt(index - 1))) {
		index -= 1;
	}

	return index;
};

// The offset of the line break introducing the element at `start`, when the
// element sits on its own line and so owns the indentation before it. Null when
// it shares a line with whatever precedes it.
const startOfOwnLine = (text: string, start: number): number | null => {
	const index = skipSpacesAndTabsBack(text, start);

	if (text.charAt(index - 1) === '\n') {
		return index - 1;
	}

	return null;
};

// Whether `index` is where a line ends, at a `\n` or the `\r` of a `\r\n`.
const isLineEnd = (text: string, index: number): boolean => {
	const char = text.charAt(index);

	return char === '\n' || char === '\r';
};

// Whether any comment lies within `[start, end]`, so removing that range would
// silently delete it.
const hasCommentInRange = (
	sourceCode: SourceCode,
	[start, end]: AST.Range
): boolean =>
	sourceCode.getAllComments().some((comment) => {
		const [commentStart, commentEnd] = sourceCode.getRange(comment);

		return commentStart >= start && commentEnd <= end;
	});

// Removes `range` unless a comment would go with it.
export const removeRangeKeepingComments = (
	fixer: Rule.RuleFixer,
	sourceCode: SourceCode,
	range: AST.Range
): Rule.Fix | null => {
	if (hasCommentInRange(sourceCode, range)) {
		return null;
	}

	return fixer.removeRange(range);
};
// The items a list holds, skipping the holes of a sparse array.
export const countListItems = (list: ListItems): number => {
	let count = 0;

	for (const item of list) {
		if (item) {
			count += 1;
		}
	}

	return count;
};

// Removes `node` along with one adjacent comma so the surrounding call/array
// literal stays syntactically valid, and with the separating whitespace
// on that same side so no double space or dangling indent is left behind.
// Returns null when removal would empty the list — that's reported
// separately, so we leave it for the developer — or would delete a comment.
export const removeFromList = (
	fixer: Rule.RuleFixer,
	sourceCode: SourceCode,
	node: Node,
	list: ListItems
): Rule.Fix | null => {
	if (countListItems(list) <= 1) {
		return null;
	}

	const source = sourceCode.getText();
	const [start, end] = sourceCode.getRange(node);
	const after = sourceCode.getTokenAfter(node);

	if (after && after.value === ',') {
		const ownLine = startOfOwnLine(source, start);

		// An own-line element takes the line break and indentation that
		// introduce it, so the elements after it keep theirs.
		if (ownLine !== null) {
			return removeRangeKeepingComments(fixer, sourceCode, [
				ownLine,
				after.range[1]
			]);
		}

		const spacesEnd = skipSpacesAndTabs(source, after.range[1]);

		// The last element of its line takes the whitespace before it
		// instead of after it, so the line doesn't end in a trailing space.
		if (isLineEnd(source, spacesEnd)) {
			return removeRangeKeepingComments(fixer, sourceCode, [
				skipSpacesAndTabsBack(source, start),
				after.range[1]
			]);
		}

		return removeRangeKeepingComments(fixer, sourceCode, [
			start,
			spacesEnd
		]);
	}

	const before = sourceCode.getTokenBefore(node);

	/* c8 ignore next 3 -- a trailing element always has a comma before it */
	if (!before || before.value !== ',') {
		return null;
	}

	// The last element: its own comma is the one before it, and the whitespace
	// after that comma separates the two.
	return removeRangeKeepingComments(fixer, sourceCode, [
		before.range[0],
		end
	]);
};

export const makeListFix =
	(context: Rule.RuleContext, node: Node, list: ListItems): EmptyFix =>
	(fixer) =>
		removeFromList(fixer, context.sourceCode, node, list);