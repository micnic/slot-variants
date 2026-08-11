import type { Rule, SourceCode } from 'eslint';
import type { Node } from 'estree';

export type ListItems = ReadonlyArray<Node | null>;

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

// The offset of the line break introducing the element at `start`, when the
// element sits on its own line and so owns the indentation before it. Null when
// it shares a line with whatever precedes it.
const startOfOwnLine = (text: string, start: number): number | null => {
	let index = start;

	while (isSpaceOrTab(text.charAt(index - 1))) {
		index -= 1;
	}

	if (text.charAt(index - 1) === '\n') {
		return index - 1;
	}

	return null;
};

// Removes `node` along with one adjacent comma so the surrounding call/array
// literal stays syntactically valid, and with the separating whitespace on that
// same side so no double space or dangling indent is left behind. Returns null
// when removal would empty the list — that's reported separately, so we leave it
// for the developer.
export const removeFromList = (
	fixer: Rule.RuleFixer,
	sourceCode: SourceCode,
	node: Node,
	list: ListItems
): Rule.Fix | null => {
	let nonNullCount = 0;

	for (const item of list) {
		if (item) {
			nonNullCount += 1;
		}
	}

	if (nonNullCount <= 1) {
		return null;
	}

	const source = sourceCode.getText();
	const [start, end] = sourceCode.getRange(node);
	const after = sourceCode.getTokenAfter(node);

	if (after && after.value === ',') {
		const ownLine = startOfOwnLine(source, start);

		// An own-line element takes the line break and indentation that introduce
		// it, so the elements after it keep theirs.
		if (ownLine !== null) {
			return fixer.removeRange([ownLine, after.range[1]]);
		}

		return fixer.removeRange([
			start,
			skipSpacesAndTabs(source, after.range[1])
		]);
	}

	const before = sourceCode.getTokenBefore(node);

	/* c8 ignore next 3 -- a non-trailing list element always has a comma after; trailing always has one before */
	if (!before || before.value !== ',') {
		return null;
	}

	// The last element: its own comma is the one before it, and the whitespace
	// after that comma separates the two.
	return fixer.removeRange([before.range[0], end]);
};

// Built by `makeListFix` for a call/array list element, or supplied directly
// for a config property.
export type EmptyFix = (fixer: Rule.RuleFixer) => Rule.Fix | null;

export const makeListFix = (
	context: Rule.RuleContext,
	node: Node,
	list: ListItems
): EmptyFix => {
	return (fixer) => removeFromList(fixer, context.sourceCode, node, list);
};