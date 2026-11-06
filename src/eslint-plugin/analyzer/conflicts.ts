import type { Rule } from 'eslint';
import type { Expression, Node, SpreadElement } from 'estree';
import { getOrCreate } from '../map-utils.ts';
import {
	type ConflictOptions,
	getConflictKey,
	overlapNeighbors
} from '../tailwind-categories.ts';
import { resolveContainer } from './const-bindings.ts';
import { getConfigSlotNames, getProperties } from './properties.ts';
import { readGroups } from './styled-values.ts';
import { collectCnEntries, collectConfigEntries } from './token-extraction.ts';
import {
	areExclusiveMatchers,
	arePairwiseExclusive,
	type Entry,
	type EntryListFilter,
	getEntriesMatchers,
	indexEntriesBySlotAndToken,
	reportDuplicateTokens,
	reportEntryList,
	type VariantMatchers
} from './token-model.ts';

type ConflictGroup = {
	tokens: Set<string>;
	entries: Entry[];
	variantPrefix: string;
	overlap: string | null;
	exclusive: boolean;
	matchers: VariantMatchers[] | null;
};

// What reporting reads from a group, merged overlap components included.
type ReportedGroup = Pick<ConflictGroup, 'tokens' | 'entries' | 'exclusive'>;

type GroupMembers = Pick<ConflictGroup, 'tokens' | 'entries'>;

// Overlap node -> that node's own group, for every node in one component.
type OverlapComponent = Map<string, ConflictGroup>;

// Adds `source`'s tokens and entries to `target`.
const absorbGroup = (target: GroupMembers, source: GroupMembers) => {
	for (const token of source.tokens) {
		target.tokens.add(token);
	}

	target.entries.push(...source.entries);
};

// Derives `matchers` and `exclusive` from the group's entries in one walk.
const updateGroupExclusivity = (group: ConflictGroup) => {
	const matchers = getEntriesMatchers(group.entries);

	group.matchers = matchers;
	group.exclusive = arePairwiseExclusive(matchers);
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
		updateGroupExclusivity(group);
	}

	return groups;
};

// The real-edge counterpart to arePairwiseExclusive: true when every
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
	startGroup: ConflictGroup,
	byNode: ReadonlyMap<string, ConflictGroup>,
	visited: Set<string>
): OverlapComponent => {
	const component: OverlapComponent = new Map([[start, startGroup]]);

	visited.add(start);

	// A Map iterates entries added during iteration, so it doubles as the
	// BFS queue.
	for (const node of component.keys()) {
		for (const neighbor of overlapNeighbors(node)) {
			const neighborGroup = byNode.get(neighbor);

			if (visited.has(neighbor) || neighborGroup === undefined) {
				continue;
			}

			visited.add(neighbor);
			component.set(neighbor, neighborGroup);
		}
	}

	return component;
};

// A component is exclusive only when every node's own group is exclusive and
// every real covers edge between two present nodes in it is exclusive too —
// nodes that merely share a bridge node without being adjacent to each other
// are never compared.
const isOverlapComponentExclusive = (component: OverlapComponent): boolean => {
	for (const [node, group] of component) {
		// `exclusive` true guarantees non-null `matchers`; the second test
		// only narrows the type.
		if (!group.exclusive || group.matchers === null) {
			return false;
		}

		// Every present neighbor of a component node is in the component.
		for (const neighbor of overlapNeighbors(node)) {
			const neighborGroup = component.get(neighbor);

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
	component: OverlapComponent
): ReportedGroup => {
	const merged: ReportedGroup = {
		tokens: new Set<string>(),
		entries: [],
		exclusive: isOverlapComponentExclusive(component)
	};

	for (const group of component.values()) {
		absorbGroup(merged, group);
	}

	return merged;
};

// Merges conflict groups related through a shorthand/longhand overlap. Groups
// are bucketed per variant prefix and overlap node (distinct conflict keys of
// one node collapse here — `mt-4` vs `mt-[calc(100%-1px)]` differ only in dash
// count), then each connected component of present nodes is reported as a
// single group. Longhand siblings without their shorthand stay separate.
const mergeOverlappingGroups = (
	groups: Map<string, ConflictGroup>
): ReportedGroup[] => {
	const result: ReportedGroup[] = [];
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

		// `groups` is discarded after this merge, so the first group seen for a
		// node is stored as-is and later ones are absorbed into it.
		if (existing) {
			absorbGroup(existing, group);
			updateGroupExclusivity(existing);
		} else {
			byNode.set(group.overlap, group);
		}
	}

	for (const byNode of overlap.values()) {
		const visited = new Set<string>();

		for (const [node, group] of byNode) {
			if (visited.has(node)) {
				continue;
			}

			const component = collectOverlapComponent(
				node,
				group,
				byNode,
				visited
			);

			result.push(buildOverlapConflictGroup(component));
		}
	}

	return result;
};

const reportConflicts = (
	context: Rule.RuleContext,
	tokenMap: Map<string, Entry[]>,
	messageId: string,
	data: Record<string, string>,
	options: ConflictOptions,
	isReported: EntryListFilter
) => {
	const groups = groupEntriesByConflictKey(tokenMap, options);

	for (const group of mergeOverlappingGroups(groups)) {
		if (
			group.tokens.size < 2 ||
			group.exclusive ||
			!isReported(group.entries)
		) {
			continue;
		}

		const tokens = [...group.tokens].sort().join(', ');

		reportEntryList(context, group.entries, messageId, { tokens, ...data });
	}
};

const REPORT_ALL: EntryListFilter = () => true;

// The token entries of several slot buckets, as one.
const mergeTokenMaps = (
	tokenMaps: ReadonlyArray<ReadonlyMap<string, Entry[]> | undefined>
): Map<string, Entry[]> => {
	const merged = new Map<string, Entry[]>();

	for (const tokenMap of tokenMaps) {
		for (const [token, entries] of tokenMap ?? []) {
			getOrCreate(merged, token, () => []).push(...entries);
		}
	}

	return merged;
};

export const analyzeConfigForRule = (
	context: Rule.RuleContext,
	configNode: Node,
	baseArgs: ReadonlyArray<Expression | SpreadElement>,
	options: ConflictOptions
) => {
	const { sourceCode } = context;
	const config = getProperties(configNode);
	const slotNames = getConfigSlotNames(config, sourceCode);
	const bySlot = indexEntriesBySlotAndToken(
		collectConfigEntries(config, slotNames, baseArgs, sourceCode)
	);
	const { groupSlots, slotGroups } = readGroups(
		getProperties(resolveContainer(config.get('groups'), sourceCode)),
		sourceCode
	);
	const report = (
		tokenMap: Map<string, Entry[]>,
		slot: string,
		isReported: EntryListFilter
	) => {
		reportDuplicateTokens(
			context,
			tokenMap,
			'duplicate',
			{ slot },
			isReported
		);
		reportConflicts(
			context,
			tokenMap,
			'conflict',
			{ slot },
			options,
			isReported
		);
	};
	// A finding inside one group's own classes is the group's to report, not
	// each of its member slots'.
	const isConfinedToGroup: EntryListFilter = (entries) => {
		const buckets = new Set(entries.map((entry) => entry.slot));

		return (
			buckets.size === 1 &&
			[...buckets].every((bucket) => groupSlots.has(bucket))
		);
	};
	const slots = new Set<string>();

	for (const [bucket, tokenMap] of bySlot) {
		if (groupSlots.has(bucket)) {
			report(tokenMap, bucket, REPORT_ALL);
		} else {
			slots.add(bucket);
		}
	}

	for (const members of groupSlots.values()) {
		for (const member of members) {
			slots.add(member);
		}
	}

	// A slot's classes are its own plus those of every group naming it.
	for (const slot of slots) {
		const buckets = [slot, ...(slotGroups.get(slot) ?? [])];

		report(
			mergeTokenMaps(buckets.map((bucket) => bySlot.get(bucket))),
			slot,
			(entries) => !isConfinedToGroup(entries)
		);
	}
};

export const analyzeCnForRule = (
	context: Rule.RuleContext,
	args: ReadonlyArray<Expression | SpreadElement>,
	options: ConflictOptions
) => {
	const tokenMap = indexEntriesBySlotAndToken(
		collectCnEntries(args, context.sourceCode)
	).get('base');

	if (tokenMap) {
		reportDuplicateTokens(context, tokenMap, 'duplicateCn', {}, REPORT_ALL);
		reportConflicts(
			context,
			tokenMap,
			'conflictCn',
			{},
			options,
			REPORT_ALL
		);
	}
};