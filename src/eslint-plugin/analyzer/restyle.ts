import type { Rule, SourceCode } from 'eslint';
import type {
	CallExpression,
	Identifier,
	MemberExpression,
	Node,
	TemplateLiteral
} from 'estree';
import {
	areConflictingKeys,
	type ConflictOptions,
	getConflictKey
} from '../tailwind-categories.ts';
import { hasIsolatedQuasis } from './static-predicates.ts';
import {
	forEachOverrideTarget,
	getSlotBuckets,
	type Invocation,
	resolveStyledClasses,
	resolveTargetSlots,
	type StyledClasses,
	type StyledContext
} from './styled-values.ts';
import {
	extractTokens,
	forEachStaticItem,
	pushTokensFromText
} from './token-extraction.ts';
import {
	areExclusiveMatchers,
	baseSource,
	EMPTY_SLOT_NAMES,
	type Entry,
	getEntryMatchers,
	reportEntryList,
	type VariantMatchers
} from './token-model.ts';

/**
 * One class-list position, split into the parts slot-variants produces itself,
 * the literal classes written alongside them, and the values that resolve to
 * neither.
 */
export type ClassParts = {
	styled: StyledClasses[];
	literals: Entry[];
	// Identifiers and property reads with no static value — where a component
	// forwards its `class` prop, that prop is one of these.
	dynamic: Array<Identifier | MemberExpression>;
	// Whether the position is a `cn()`-style merge, whose literals are classes
	// the position applies on its own rather than a plain attribute value.
	merged: boolean;
};

export const emptyParts = (): ClassParts => ({
	styled: [],
	literals: [],
	dynamic: [],
	merged: false
});

// Template quasis carry classes no string literal covers, so their text is
// tokenized directly. `hasIsolatedQuasis` has already established that every
// substitution is whitespace-separated, so no token straddles a boundary.
const pushQuasiTokens = (
	node: TemplateLiteral,
	literals: Entry[],
	sourceCode: SourceCode
) => {
	for (const quasi of node.quasis) {
		// Template delimiters are single-char on both sides of a quasi, so
		// start offset + 1 is its first inner character.
		pushTokensFromText(
			quasi.value.raw,
			sourceCode.getRange(quasi)[0] + 1,
			'base',
			baseSource,
			literals
		);
	}
};

/**
 * A config-less `sv()`/`cn()` call: a class list in its own right, whose
 * arguments are walked as siblings of one another — and of whatever surrounds
 * the call when it is written inline.
 */
export const isClassListCall = (
	node: CallExpression,
	ctx: StyledContext
): boolean => {
	const call = ctx.matchCall(node);

	return (
		call !== null && call.isFactoryConfig !== true && call.config === null
	);
};

/** Walks a class-list call's arguments as siblings of one another. */
export const collectCallParts = (
	node: CallExpression,
	ctx: StyledContext,
	parts: ClassParts
) => {
	parts.merged = true;

	for (const arg of node.arguments) {
		if (arg.type !== 'SpreadElement') {
			collectParts(arg, ctx, parts);
		}
	}
};

/**
 * Walks one class-list position, separating slot-variants-produced parts from
 * the literal classes written next to them. Values that resolve to neither are
 * recorded as dynamic and otherwise left alone, matching how the other rules
 * treat runtime class props.
 */
export const collectParts = (
	node: Node,
	ctx: StyledContext,
	parts: ClassParts
) => {
	if (node.type === 'CallExpression' && isClassListCall(node, ctx)) {
		collectCallParts(node, ctx, parts);

		return;
	}

	const styled = resolveStyledClasses(node, ctx);

	if (styled !== null) {
		parts.styled.push(styled);

		return;
	}

	const resolved = ctx.resolve(node);

	if (
		resolved.type === 'Identifier' ||
		resolved.type === 'MemberExpression'
	) {
		parts.dynamic.push(resolved);

		return;
	}

	if (resolved.type === 'ArrayExpression') {
		forEachStaticItem(resolved.elements, (element) => {
			collectParts(element, ctx, parts);
		});

		return;
	}

	if (resolved.type === 'ConditionalExpression') {
		collectParts(resolved.consequent, ctx, parts);
		collectParts(resolved.alternate, ctx, parts);

		return;
	}

	if (resolved.type === 'LogicalExpression') {
		collectParts(resolved.right, ctx, parts);

		return;
	}

	// A template with substitutions can still carry literal classes around
	// them; `extractTokens` only reads templates whose substitutions are
	// themselves static, so the quasis are tokenized here instead.
	if (
		resolved.type === 'TemplateLiteral' &&
		resolved.expressions.length > 0
	) {
		if (hasIsolatedQuasis(resolved)) {
			pushQuasiTokens(resolved, parts.literals, ctx.sourceCode);

			for (const expression of resolved.expressions) {
				collectParts(expression, ctx, parts);
			}
		}

		return;
	}

	extractTokens(
		resolved,
		'base',
		baseSource,
		EMPTY_SLOT_NAMES,
		parts.literals,
		ctx.sourceCode,
		true
	);
};

/**
 * The `class` / `className` value a call site passes, as one position per
 * slot it targets: the slot's own classes are the styled parts, and the value
 * written for that slot is walked next to them.
 */
export const forEachOverrideParts = (
	value: Node,
	invocation: Invocation,
	ctx: StyledContext,
	visit: (parts: ClassParts) => void
) => {
	const { styles, matchers } = invocation;

	forEachOverrideTarget(value, styles, invocation.slot, (slotKey, node) => {
		const parts = emptyParts();

		for (const slot of resolveTargetSlots(styles, slotKey)) {
			parts.styled.push({ styles, slot, matchers });
		}

		collectParts(node, ctx, parts);
		visit(parts);
	});
};

// An internal entry counts only when it can render under the variant values
// fixed at the call site — a `size: 'sm'` call never emits `size.lg`'s classes.
const canRender = (list: ReadonlyArray<Entry>, matchers: VariantMatchers) =>
	list.some((entry) => {
		const entryMatchers = getEntryMatchers(entry);

		if (entryMatchers === null) {
			return true;
		}

		return !areExclusiveMatchers(matchers, entryMatchers);
	});

// The slot's own bucket plus every group bucket naming it, flattened to the
// tokens that can actually reach the slot's output.
const collectInternalTokens = (styled: StyledClasses): string[] => {
	const tokens: string[] = [];

	for (const bucket of getSlotBuckets(styled.styles, styled.slot)) {
		const tokenMap = styled.styles.bySlot.get(bucket);

		if (tokenMap === undefined) {
			continue;
		}

		for (const [token, list] of tokenMap) {
			if (canRender(list, styled.matchers) && !tokens.includes(token)) {
				tokens.push(token);
			}
		}
	}

	return tokens;
};

const reportEntry = (
	context: Rule.RuleContext,
	entry: Entry,
	internal: ReadonlyArray<string>,
	slot: string,
	options: ConflictOptions
): boolean => {
	if (internal.includes(entry.token)) {
		reportEntryList(context, [entry], 'duplicate', {
			token: entry.token,
			slot
		});

		return true;
	}

	const info = getConflictKey(entry.token, options);

	if (info === null) {
		return false;
	}

	for (const token of internal) {
		const other = getConflictKey(token, options);

		if (other !== null && areConflictingKeys(info, other)) {
			reportEntryList(context, [entry], 'conflict', {
				token: entry.token,
				internal: token,
				slot
			});

			return true;
		}
	}

	return false;
};

// A literal class is reported at most once per lint run, whichever position
// reaches it first. The same class list is walked from more than one place —
// a `cn()` call is its own site and also a part of the attribute it sits in —
// and a token's source range identifies it across all of them.
const entryKey = (entry: Entry): string =>
	`${entry.start}:${entry.end}:${entry.token}`;

const reportAgainstStyled = (
	context: Rule.RuleContext,
	styled: StyledClasses,
	literals: ReadonlyArray<Entry>,
	reported: Set<string>,
	options: ConflictOptions
) => {
	const internal = collectInternalTokens(styled);

	for (const entry of literals) {
		const key = entryKey(entry);

		if (reported.has(key)) {
			continue;
		}

		if (reportEntry(context, entry, internal, styled.slot, options)) {
			reported.add(key);
		}
	}
};

/**
 * Reports each literal that duplicates or collides with a class one of the
 * styled parts applies. A literal is reported once even when several parts
 * would flag it.
 */
export const reportLiterals = (
	context: Rule.RuleContext,
	styled: ReadonlyArray<StyledClasses>,
	literals: ReadonlyArray<Entry>,
	reported: Set<string>,
	options: ConflictOptions
) => {
	for (const part of styled) {
		reportAgainstStyled(context, part, literals, reported, options);
	}
};

/** Reports a position's literals against the styled parts beside them. */
export const reportParts = (
	context: Rule.RuleContext,
	parts: ClassParts,
	reported: Set<string>,
	options: ConflictOptions
) => {
	reportLiterals(context, parts.styled, parts.literals, reported, options);
};