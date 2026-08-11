import type { Rule } from 'eslint';
import type { Expression, Node, SpreadElement } from 'estree';
import { getOrCreate } from '../map-utils.ts';
import {
	type ConflictOptions,
	getConflictKey,
	overlapNeighbors
} from '../tailwind-categories.ts';
import { getConfigSlotNames, getProperties } from './properties.ts';
import { collectConfigEntries, extractTokens } from './token-extraction.ts';
import {
	areExclusiveMatchers,
	baseSource,
	EMPTY_SLOT_NAMES,
	type Entry,
	getEntryMatchers,
	indexEntriesBySlotAndToken,
	isMutuallyExclusiveVariants,
	reportDuplicateTokens,
	reportEntryList,
	type VariantMatchers
} from './token-model.ts';

type ConflictGroup = {
	tokens: Set<string>;
	entries: Entry[];
	variantPrefix: string;
	overlap: string | null;
	// Whether this group alone (before any overlap merge) has no two entries
	// that can render together.
	exclusive: boolean;
	// Every entry's matcher list, or null if some entry has no readable
	// matcher (base/compound). Non-null whenever `exclusive` is true — kept
	// alongside it so a neighbor edge check can reuse it without re-walking
	// `entries` and re-deriving what `exclusive` already established.
	matchers: VariantMatchers[] | null;
};

// Null the moment one entry has no readable matcher — mirrors the guard
// isMutuallyExclusiveVariants applies per-entry before ever comparing pairs.
const getGroupMatchers = (
	entries: ReadonlyArray<Entry>
): VariantMatchers[] | null => {
	const matchers: VariantMatchers[] = [];

	for (const entry of entries) {
		const entryMatchers = getEntryMatchers(entry);

		if (entryMatchers === null) {
			return null;
		}

		matchers.push(entryMatchers);
	}

	return matchers;
};

const groupEntriesByConflictKey = (
	tokenMap: Map<string, Entry[]>,
	options: ConflictOptions
): Map<string, ConflictGroup> => {
	const groups = new Map<string, ConflictGroup>();

	for (const [token, list] of tokenMap) {
		const info = getConflictKey(token, options);

		if (info === null) {
			continue;
		}

		const group = getOrCreate(groups, info.key, () => ({
			tokens: new Set<string>(),
			entries: [],
			variantPrefix: info.variantPrefix,
			overlap: info.overlap,
			exclusive: true,
			matchers: null
		}));

		group.tokens.add(token);
		group.entries.push(...list);
	}

	for (const group of groups.values()) {
		group.exclusive = isMutuallyExclusiveVariants(group.entries);
		group.matchers = getGroupMatchers(group.entries);
	}

	return groups;
};

// The real-edge counterpart to isMutuallyExclusiveVariants: true when every
// matcher of `a` is exclusive with every matcher of `b`. Used to check two
// distinct covers-adjacent nodes (`p` vs `px`) against each other directly,
// instead of flattening a whole connected component into one all-pairs check
// — `px` and `pb` both bridge through `p` but aren't adjacent to each other,
// so they must never be compared against one another. `a` comes from a group
// already known to be internally exclusive (see isOverlapComponentExclusive),
// so unlike `b` it's never null.
const areGroupsExclusive = (
	a: ReadonlyArray<VariantMatchers>,
	b: ReadonlyArray<VariantMatchers> | null
): boolean => {
	if (b === null) {
		return false;
	}

	for (const matchersA of a) {
		for (const matchersB of b) {
			if (!areExclusiveMatchers(matchersA, matchersB)) {
				return false;
			}
		}
	}

	return true;
};

// Walks every node reachable from `start` through present covers edges,
// without merging anything yet — collecting the component first keeps each
// node's own entries pristine until every edge in the component has been
// checked, so `p` merging `px` doesn't poison the later `p`-vs-`pb` check.
const collectOverlapComponent = (
	start: string,
	byNode: ReadonlyMap<string, ConflictGroup>,
	visited: Set<string>
): string[] => {
	const component: string[] = [];
	const queue = [start];

	visited.add(start);

	for (const node of queue) {
		component.push(node);

		for (const neighbor of overlapNeighbors(node)) {
			if (visited.has(neighbor) || !byNode.has(neighbor)) {
				continue;
			}

			visited.add(neighbor);
			queue.push(neighbor);
		}
	}

	return component;
};

// A component is exclusive only when every node's own group is exclusive and
// every real covers edge between two present nodes in it is exclusive too —
// nodes that merely share a bridge node without being adjacent to each other
// are never compared.
const isOverlapComponentExclusive = (
	component: ReadonlyArray<string>,
	byNode: ReadonlyMap<string, ConflictGroup>
): boolean => {
	for (const node of component) {
		const group = byNode.get(node);

		/* c8 ignore next 3 -- component only ever holds nodes present in byNode */
		if (group === undefined) {
			continue;
		}

		if (!group.exclusive) {
			return false;
		}

		/* c8 ignore next 3 -- exclusive true guarantees matchers is non-null */
		if (group.matchers === null) {
			return false;
		}

		for (const neighbor of overlapNeighbors(node)) {
			const neighborGroup = byNode.get(neighbor);

			if (
				neighborGroup !== undefined &&
				!areGroupsExclusive(group.matchers, neighborGroup.matchers)
			) {
				return false;
			}
		}
	}

	return true;
};

const buildOverlapConflictGroup = (
	component: ReadonlyArray<string>,
	byNode: ReadonlyMap<string, ConflictGroup>
): ConflictGroup => {
	const tokens = new Set<string>();
	const entries: Entry[] = [];
	let variantPrefix = '';
	let overlap: string | null = null;

	for (const node of component) {
		const group = byNode.get(node);

		/* c8 ignore next 3 -- component only ever holds nodes present in byNode */
		if (group === undefined) {
			continue;
		}

		variantPrefix = group.variantPrefix;
		overlap = group.overlap;

		for (const token of group.tokens) {
			tokens.add(token);
		}

		entries.push(...group.entries);
	}

	return {
		tokens,
		entries,
		variantPrefix,
		overlap,
		exclusive: isOverlapComponentExclusive(component, byNode),
		matchers: getGroupMatchers(entries)
	};
};

// Merges conflict groups related through a shorthand/longhand overlap. Groups
// are bucketed per variant prefix and overlap node (distinct conflict keys of
// one node collapse here — `mt-4` vs `mt-[calc(100%-1px)]` differ only in dash
// count), then each connected component of present nodes is reported as a
// single group. Longhand siblings without their shorthand stay separate.
const mergeOverlappingGroups = (
	groups: Map<string, ConflictGroup>
): ConflictGroup[] => {
	const result: ConflictGroup[] = [];
	// variant prefix -> overlap node -> that node's own (pristine) group.
	const overlap = new Map<string, Map<string, ConflictGroup>>();

	for (const group of groups.values()) {
		if (group.overlap === null) {
			result.push(group);
			continue;
		}

		const byNode = getOrCreate(
			overlap,
			group.variantPrefix,
			() => new Map<string, ConflictGroup>()
		);
		const existing = byNode.get(group.overlap);

		if (existing) {
			for (const token of group.tokens) {
				existing.tokens.add(token);
			}

			existing.entries.push(...group.entries);
			existing.exclusive = isMutuallyExclusiveVariants(existing.entries);
			existing.matchers = getGroupMatchers(existing.entries);
		} else {
			byNode.set(group.overlap, {
				tokens: new Set(group.tokens),
				entries: [...group.entries],
				variantPrefix: group.variantPrefix,
				overlap: group.overlap,
				exclusive: group.exclusive,
				matchers: group.matchers
			});
		}
	}

	for (const byNode of overlap.values()) {
		const visited = new Set<string>();

		for (const node of byNode.keys()) {
			if (visited.has(node)) {
				continue;
			}

			const component = collectOverlapComponent(node, byNode, visited);

			result.push(buildOverlapConflictGroup(component, byNode));
		}
	}

	return result;
};

const reportConflicts = (
	context: Rule.RuleContext,
	tokenMap: Map<string, Entry[]>,
	messageId: string,
	data: Record<string, string>,
	options: ConflictOptions
) => {
	const groups = groupEntriesByConflictKey(tokenMap, options);

	for (const group of mergeOverlappingGroups(groups)) {
		if (group.tokens.size < 2 || group.exclusive) {
			continue;
		}

		const tokens = [...group.tokens].sort().join(', ');

		reportEntryList(context, group.entries, messageId, { tokens, ...data });
	}
};

export const analyzeConfigForRule = (
	context: Rule.RuleContext,
	configNode: Node,
	baseArgs: ReadonlyArray<Expression | SpreadElement>,
	options: ConflictOptions
) => {
	const config = getProperties(configNode);
	const slotNames = getConfigSlotNames(config);
	const bySlot = indexEntriesBySlotAndToken(
		collectConfigEntries(config, slotNames, baseArgs, context.sourceCode)
	);

	for (const [slot, tokenMap] of bySlot) {
		reportDuplicateTokens(context, tokenMap, 'duplicate', { slot });
		reportConflicts(context, tokenMap, 'conflict', { slot }, options);
	}
};

export const analyzeCnForRule = (
	context: Rule.RuleContext,
	args: ReadonlyArray<Expression | SpreadElement>,
	options: ConflictOptions
) => {
	const entries: Entry[] = [];

	for (const arg of args) {
		extractTokens(
			arg,
			'base',
			baseSource,
			EMPTY_SLOT_NAMES,
			entries,
			context.sourceCode,
			true
		);
	}

	const tokenMap = indexEntriesBySlotAndToken(entries).get('base');

	if (tokenMap) {
		reportDuplicateTokens(context, tokenMap, 'duplicateCn', {});
		reportConflicts(context, tokenMap, 'conflictCn', {}, options);
	}
};