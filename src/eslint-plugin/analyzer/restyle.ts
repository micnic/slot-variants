import type { Rule } from 'eslint';
import type {
	CallExpression,
	ConditionalExpression,
	Identifier,
	LogicalExpression,
	MemberExpression,
	Node
} from 'estree';
import {
	areConflictingKeys,
	type ConflictKeyInfo,
	type ConflictOptions,
	getConflictKey
} from '../tailwind-categories.ts';
import { isClassListMatch } from './call-matching.ts';
import { hasIsolatedQuasis } from './static-predicates.ts';
import {
	forEachOverrideTarget,
	getSlotBuckets,
	type Invocation,
	pickCallMatchers,
	readStyledClasses,
	resolveTargetSlots,
	type StyledClasses,
	type StyledContext
} from './styled-values.ts';
import {
	extractCnTokens,
	forEachStaticItem,
	pushBaseQuasiTokens
} from './token-extraction.ts';
import {
	areExclusiveMatchers,
	type Entry,
	getEntryMatchers,
	reportEntryList,
	type VariantMatchers
} from './token-model.ts';

// A node whose two sides never render together: a ternary, or an `||` / `??`.
type BranchNode = ConditionalExpression | LogicalExpression;

/**
 * The side of each branch node a part was written in: `true` for a ternary's
 * consequent or a logical's left side, `false` for the other.
 */
export type BranchPath = ReadonlyMap<BranchNode, boolean>;

// The branch path of each part, by its index; a part outside any branch node
// has no entry.
type PartPaths = {
	styled: BranchPath[];
	literals: BranchPath[];
	dynamic: BranchPath[];
};

/**
 * One class-list position, split into the parts slot-variants produces itself,
 * the literal classes written alongside them, and the values that resolve to
 * neither. `merged` holds the literals written inside a `cn()` list.
 */
export type ClassParts = {
	styled: StyledClasses[];
	literals: Entry[];
	dynamic: Array<Identifier | MemberExpression>;
	merged: Set<Entry>;
	paths: PartPaths;
};

// How many parts of each kind a position held before a branch was walked.
type PartCounts = { styled: number; literals: number; dynamic: number };

// Whether the styled part and the literal at these indexes can render
// together.
type CanPair = (styled: number, literal: number) => boolean;

type KeyedToken = { token: string; info: ConflictKeyInfo };

// A literal class with its conflict key, null when it has none.
type KeyedLiteral = { entry: Entry; info: ConflictKeyInfo | null };

// The classes a styled part applies: every token, for duplicates, and the
// ones with a conflict key, each computed once however many literals check it.
type InternalClasses = {
	tokens: ReadonlySet<string>;
	keyed: ReadonlyArray<KeyedToken>;
};

type LiteralReporter = (
	styled: ReadonlyArray<StyledClasses>,
	literals: ReadonlyArray<Entry>,
	canPair?: CanPair
) => void;

const EMPTY_PATH: BranchPath = new Map();

export const emptyParts = (): ClassParts => ({
	styled: [],
	literals: [],
	dynamic: [],
	merged: new Set(),
	paths: { styled: [], literals: [], dynamic: [] }
});

/** The branch path of the part at `index`. */
export const pathAt = (paths: readonly BranchPath[], index: number) =>
	paths[index] ?? EMPTY_PATH;

/** Whether two parts sit on different sides of one branch node. */
export const areExclusivePaths = (a: BranchPath, b: BranchPath): boolean => {
	for (const [node, side] of a) {
		const other = b.get(node);

		if (other !== undefined && other !== side) {
			return true;
		}
	}

	return false;
};

/** Whether a position's styled part and literal can render together. */
export const canPairParts =
	(parts: ClassParts): CanPair =>
	(styled, literal) =>
		!areExclusivePaths(
			pathAt(parts.paths.styled, styled),
			pathAt(parts.paths.literals, literal)
		);

const countParts = (parts: ClassParts): PartCounts => ({
	styled: parts.styled.length,
	literals: parts.literals.length,
	dynamic: parts.dynamic.length
});

// Adds a branch node's side to the paths of the parts from `from` to `to`.
const markRange = (
	paths: BranchPath[],
	from: number,
	to: number,
	node: BranchNode,
	side: boolean
) => {
	for (let index = from; index < to; index += 1) {
		paths[index] = new Map(pathAt(paths, index)).set(node, side);
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

	return call !== null && isClassListMatch(call);
};

/** Walks a class-list call's arguments as siblings of one another. */
export const collectCallParts = (
	node: CallExpression,
	ctx: StyledContext,
	parts: ClassParts
) => {
	const start = parts.literals.length;

	for (const arg of node.arguments) {
		if (arg.type !== 'SpreadElement') {
			collectParts(arg, ctx, parts);
		}
	}

	for (const entry of parts.literals.slice(start)) {
		parts.merged.add(entry);
	}
};

// Appends parts collected elsewhere, each with its branch path.
const appendWithPaths = <T>(
	items: T[],
	paths: BranchPath[],
	added: readonly T[],
	addedPaths: readonly BranchPath[]
) => {
	added.forEach((item, index) => {
		paths[items.length] = pathAt(addedPaths, index);
		items.push(item);
	});
};

/**
 * The parts a class list read through a `const` holds besides its literals,
 * which the list's own styled part stands for: the slot-variants parts and
 * the props written inside it, so a prop forwarded into it stays in sight.
 */
const collectHoistedParts = (
	node: CallExpression,
	ctx: StyledContext,
	parts: ClassParts
) => {
	const inner = emptyParts();

	collectCallParts(node, ctx, inner);
	appendWithPaths(
		parts.styled,
		parts.paths.styled,
		inner.styled,
		inner.paths.styled
	);
	appendWithPaths(
		parts.dynamic,
		parts.paths.dynamic,
		inner.dynamic,
		inner.paths.dynamic
	);
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

	const resolved = ctx.resolve(node);

	if (resolved.type === 'CallExpression' && isClassListCall(resolved, ctx)) {
		collectHoistedParts(resolved, ctx, parts);
	}

	const styled = readStyledClasses(resolved, ctx);

	if (styled !== null) {
		parts.styled.push(styled);

		return;
	}

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
		collectBranch(resolved, resolved.consequent, true, ctx, parts);
		collectBranch(resolved, resolved.alternate, false, ctx, parts);

		return;
	}

	// `a && b` renders `b` or nothing; `a || b` and `a ?? b` render one side.
	if (resolved.type === 'LogicalExpression') {
		if (resolved.operator === '&&') {
			collectParts(resolved.right, ctx, parts);
		} else {
			collectBranch(resolved, resolved.left, true, ctx, parts);
			collectBranch(resolved, resolved.right, false, ctx, parts);
		}

		return;
	}

	// A template with substitutions can still carry literal classes around
	// them; `extractTokens` only reads templates whose substitutions are
	// themselves static, so the quasis are tokenized here instead.
	if (
		resolved.type === 'TemplateLiteral' &&
		resolved.expressions.length > 0
	) {
		// Substitutions are whitespace-separated, so no token straddles one.
		if (hasIsolatedQuasis(resolved)) {
			pushBaseQuasiTokens(resolved, parts.literals, ctx.sourceCode);

			for (const expression of resolved.expressions) {
				collectParts(expression, ctx, parts);
			}
		}

		return;
	}

	extractCnTokens(resolved, parts.literals, ctx.sourceCode);
};

/**
 * Walks one side of a branch node, marking the parts it adds with its side,
 * so they are never paired with the other side's parts.
 */
const collectBranch = (
	node: BranchNode,
	branch: Node,
	side: boolean,
	ctx: StyledContext,
	parts: ClassParts
) => {
	const start = countParts(parts);

	collectParts(branch, ctx, parts);

	const { paths } = parts;

	markRange(paths.styled, start.styled, parts.styled.length, node, side);
	markRange(
		paths.literals,
		start.literals,
		parts.literals.length,
		node,
		side
	);
	markRange(paths.dynamic, start.dynamic, parts.dynamic.length, node, side);
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
	const { styles } = invocation;
	const callMatchers = pickCallMatchers(invocation);

	forEachOverrideTarget(value, styles, invocation.slot, (slotKey, node) => {
		const parts = emptyParts();

		for (const slot of resolveTargetSlots(styles, slotKey)) {
			parts.styled.push({ styles, slot, ...callMatchers });
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
const collectInternalTokens = (styled: StyledClasses): Set<string> => {
	const tokens = new Set<string>();

	for (const bucket of getSlotBuckets(styled.styles, styled.slot)) {
		const tokenMap = styled.styles.bySlot.get(bucket);

		if (tokenMap === undefined) {
			continue;
		}

		for (const [token, list] of tokenMap) {
			if (canRender(list, styled.matchers)) {
				tokens.add(token);
			}
		}
	}

	return tokens;
};

const collectInternalClasses = (
	styled: StyledClasses,
	options: ConflictOptions
): InternalClasses => {
	const tokens = collectInternalTokens(styled);
	const keyed: KeyedToken[] = [];

	for (const token of tokens) {
		const info = getConflictKey(token, options);

		if (info !== null) {
			keyed.push({ token, info });
		}
	}

	return { tokens, keyed };
};

const reportEntry = (
	context: Rule.RuleContext,
	{ entry, info }: KeyedLiteral,
	internal: InternalClasses,
	slot: string
): boolean => {
	if (internal.tokens.has(entry.token)) {
		reportEntryList(context, [entry], 'duplicate', {
			token: entry.token,
			slot
		});

		return true;
	}

	if (info === null) {
		return false;
	}

	for (const { token, info: other } of internal.keyed) {
		if (areConflictingKeys(info, other)) {
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
	literals: ReadonlyArray<KeyedLiteral>,
	reported: Set<string>,
	options: ConflictOptions
) => {
	const internal = collectInternalClasses(styled, options);

	for (const literal of literals) {
		const key = entryKey(literal.entry);

		if (reported.has(key)) {
			continue;
		}

		if (reportEntry(context, literal, internal, styled.slot)) {
			reported.add(key);
		}
	}
};

/**
 * Creates the reporter for one lint run: it reports each literal that
 * duplicates or collides with a class one of the styled parts applies, and
 * remembers what it reported, so a literal is reported once even when several
 * parts or positions would flag it.
 */
export const createLiteralReporter = (
	context: Rule.RuleContext,
	options: ConflictOptions
): LiteralReporter => {
	const reported = new Set<string>();

	return (styled, literals, canPair = () => true) => {
		// Nothing to check, or nothing to check against.
		if (literals.length === 0 || styled.length === 0) {
			return;
		}

		// Each literal's conflict key is read once for every part to use
		const keyed = literals.map((entry) => ({
			entry,
			info: getConflictKey(entry.token, options)
		}));

		styled.forEach((part, styledIndex) => {
			const pairable = keyed.filter((_literal, literalIndex) =>
				canPair(styledIndex, literalIndex)
			);

			reportAgainstStyled(context, part, pairable, reported, options);
		});
	};
};