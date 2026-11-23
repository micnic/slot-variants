import type { AST, Rule, SourceCode } from 'eslint';
import type { Node } from 'estree';

type ListItems = ReadonlyArray<Node | null>;

// Built by `makeListFix` for a call/array list element, or supplied directly
// for a config property.
export type EmptyFix = (fixer: Rule.RuleFixer) => Rule.Fix | null;

// A list element as written: its range with any parentheses wrapping it, and
// the tokens on either side of that.
type ListElement = {
	range: AST.Range;
	before: AST.Token | null;
	after: AST.Token | null;
};

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
// element sits on its own line and so owns the indentation before it: the `\r`
// of a `\r\n`, so the whole break goes with it. Null when it shares a line with
// whatever precedes it.
const startOfOwnLine = (text: string, start: number): number | null => {
	const index = skipSpacesAndTabsBack(text, start);

	if (text.charAt(index - 1) !== '\n') {
		return null;
	}

	if (text.charAt(index - 2) === '\r') {
		return index - 2;
	}

	return index - 1;
};

// Whether `index` is where a line ends, at a `\n` or the `\r` of a `\r\n`.
const isLineEnd = (text: string, index: number): boolean => {
	const char = text.charAt(index);

	return char === '\n' || char === '\r';
};

// Whether `index` is where the list closes, right after a trailing comma.
const isListEnd = (text: string, index: number): boolean => {
	const char = text.charAt(index);

	return char === ')' || char === ']';
};

const isToken = (token: AST.Token | null, value: string): token is AST.Token =>
	token !== null && token.value === value;

// `node` with the parentheses wrapping it, which go with it when it's removed.
// An element of a list with others always has a comma on one side, so a `(`
// and a `)` around it are its own.
const getListElement = (sourceCode: SourceCode, node: Node): ListElement => {
	let range = sourceCode.getRange(node);
	let before = sourceCode.getTokenBefore(node);
	let after = sourceCode.getTokenAfter(node);

	while (isToken(before, '(') && isToken(after, ')')) {
		range = [before.range[0], after.range[1]];
		before = sourceCode.getTokenBefore(before);
		after = sourceCode.getTokenAfter(after);
	}

	return { range, before, after };
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
const removeRangeKeepingComments = (
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
	const {
		range: [start, end],
		before,
		after
	} = getListElement(sourceCode, node);

	if (isToken(after, ',')) {
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

		// The last element of its line, or of the list before a trailing
		// comma, takes the whitespace on both sides of it, so no space is
		// left trailing.
		if (isLineEnd(source, spacesEnd) || isListEnd(source, spacesEnd)) {
			return removeRangeKeepingComments(fixer, sourceCode, [
				skipSpacesAndTabsBack(source, start),
				spacesEnd
			]);
		}

		return removeRangeKeepingComments(fixer, sourceCode, [
			start,
			spacesEnd
		]);
	}

	/* c8 ignore next 3 -- a trailing element always has a comma before it */
	if (!isToken(before, ',')) {
		return null;
	}

	// The last element: its own comma is the one before it, and the whitespace
	// after that comma separates the two.
	return removeRangeKeepingComments(fixer, sourceCode, [
		before.range[0],
		end
	]);
};

// Removes the only item of a list: with the comma trailing it, as nothing is
// left to separate, and with the line break and indentation introducing it
// when it sits on its own line. Null when a comment would go with it.
export const removeSoleItem = (
	fixer: Rule.RuleFixer,
	sourceCode: SourceCode,
	node: Node
): Rule.Fix | null => {
	const {
		range: [start, end],
		after
	} = getListElement(sourceCode, node);
	const ownLine = startOfOwnLine(sourceCode.getText(), start);
	let removeStart = start;
	let removeEnd = end;

	if (ownLine !== null) {
		removeStart = ownLine;
	}

	if (isToken(after, ',')) {
		[, removeEnd] = after.range;
	}

	return removeRangeKeepingComments(fixer, sourceCode, [
		removeStart,
		removeEnd
	]);
};

export const makeListFix =
	(context: Rule.RuleContext, node: Node, list: ListItems): EmptyFix =>
	(fixer) =>
		removeFromList(fixer, context.sourceCode, node, list);