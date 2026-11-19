import type { Rule } from 'eslint';
import type {
	CallExpression,
	Expression,
	Node,
	ObjectExpression,
	SpreadElement
} from 'estree';
import { getOrCreate } from '../map-utils.ts';
import {
	type ConflictOptions,
	getConflictKey,
	overlapNeighbors
} from '../tailwind-categories.ts';
import {
	isWithinNode,
	resolveArray,
	resolveContainer,
	resolveStaticValue
} from './const-bindings.ts';
import { type EmptyFix, makeListFix } from './list-fix.ts';
import { getStaticStringText } from './literals.ts';
import {
	collectSlotKeyedProperties,
	getConfigProperties,
	getProperties,
	getSlotTargetOverlaps,
	type GroupSlots
} from './properties.ts';
import {
	getConfigStyles,
	getOverrideValue,
	getSlotBuckets,
	resolveInvocation,
	type StyledContext
} from './styled-values.ts';
import {
	collectCnEntries,
	forEachCompoundClass,
	forEachStaticItem
} from './token-extraction.ts';
import {
	areDistinctTokensExclusive,
	areExclusiveMatchers,
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

// Derives `matchers`, for comparing neighbor groups, and `exclusive` from the
// group's entries.
const updateGroupExclusivity = (group: ConflictGroup) => {
	group.matchers = getEntriesMatchers(group.entries);
	group.exclusive = areDistinctTokensExclusive(group.entries);
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

// The real-edge counterpart to areDistinctTokensExclusive: true when every
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
		// Null `matchers` means an entry, like a base one, renders with
		// anything a neighbor holds.
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

// Reports every group key of a static slot object that reaches a slot another
// key of the object already targets, so that slot gets both values.
const reportSlotObjectOverlaps = (
	context: Rule.RuleContext,
	raw: Node,
	slotNames: ReadonlySet<string>,
	groupSlots: GroupSlots
) => {
	const slotKeyed = collectSlotKeyedProperties(
		resolveStaticValue(raw, context.sourceCode),
		slotNames
	);

	if (slotKeyed === null) {
		return;
	}

	const overlaps = getSlotTargetOverlaps(slotKeyed.keys(), groupSlots);

	for (const [key, node] of slotKeyed) {
		for (const { slot, other } of overlaps.get(key) ?? []) {
			context.report({
				node,
				messageId: 'overlappingSlotTarget',
				data: { key, slot, other }
			});
		}
	}
};

// The slot objects a config holds: each variant value, and each
// `compoundVariants` class object.
const reportConfigOverlaps = (
	context: Rule.RuleContext,
	config: ReadonlyMap<string, Node>,
	slotNames: ReadonlySet<string>,
	groupSlots: GroupSlots
) => {
	const { sourceCode } = context;
	const variants = resolveContainer(config.get('variants'), sourceCode);

	for (const variant of getProperties(variants).values()) {
		const values = resolveStaticValue(variant, sourceCode);

		for (const value of getProperties(values).values()) {
			reportSlotObjectOverlaps(context, value, slotNames, groupSlots);
		}
	}

	forEachCompoundClass(config.get('compoundVariants'), sourceCode, (cls) => {
		reportSlotObjectOverlaps(context, cls, slotNames, groupSlots);
	});
};

/**
 * Reports overlapping keys in the static `class` / `className` slot object a
 * call of a compiled variant function passes. A multi-slot slot function's
 * class prop applies to its own slot, so it's never a slot object.
 */
export const reportClassPropOverlaps = (
	context: Rule.RuleContext,
	node: CallExpression,
	ctx: StyledContext
) => {
	// Most calls pass no class prop, which is cheaper to find out than whether
	// the callee is a variant function.
	const value = getOverrideValue(node.arguments[0], ctx);

	if (value === null) {
		return;
	}

	const invocation = resolveInvocation(node, ctx);

	if (invocation === null || invocation.slot !== null) {
		return;
	}

	const { slotNames, groupSlots } = invocation.styles;

	reportSlotObjectOverlaps(context, value, slotNames, groupSlots);
};

// Reports each repeated entry of a group's slot list, as the slot then gets the
// group's classes once per entry. The repeat is removed when the list is
// written inside this config rather than shared through a `const` declared
// elsewhere, where editing it could affect its other users.
const reportDuplicateGroupSlots = (
	context: Rule.RuleContext,
	configNode: Node,
	config: ReadonlyMap<string, Node>
) => {
	const { sourceCode } = context;
	const groups = resolveContainer(config.get('groups'), sourceCode);

	for (const [group, value] of getProperties(groups)) {
		const list = resolveArray(value, sourceCode);

		if (list === null) {
			continue;
		}

		const canEdit = isWithinNode(sourceCode, list, configNode);
		const seen = new Set<string>();

		forEachStaticItem(list.elements, (element) => {
			const slot = getStaticStringText(
				resolveStaticValue(element, sourceCode)
			);

			if (slot === null) {
				return;
			}

			if (!seen.has(slot)) {
				seen.add(slot);
				return;
			}

			let fix: EmptyFix | undefined;

			if (canEdit) {
				fix = makeListFix(context, element, list.elements);
			}

			context.report({
				node: element,
				messageId: 'duplicateGroupSlot',
				data: { group, slot },
				fix
			});
		});
	}
};

export const analyzeConfigForRule = (
	context: Rule.RuleContext,
	node: CallExpression,
	configNode: ObjectExpression,
	baseArgs: ReadonlyArray<Expression | SpreadElement>,
	options: ConflictOptions
) => {
	const config = getConfigProperties(configNode, context.sourceCode);
	const styles = getConfigStyles(
		node,
		configNode,
		baseArgs,
		context.sourceCode
	);
	const { bySlot, slotNames, groupSlots } = styles;
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
		const [first] = entries;

		return (
			first !== undefined &&
			groupSlots.has(first.slot) &&
			entries.every((entry) => entry.slot === first.slot)
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
		report(
			mergeTokenMaps(
				getSlotBuckets(styles, slot).map((bucket) => bySlot.get(bucket))
			),
			slot,
			(entries) => !isConfinedToGroup(entries)
		);
	}

	reportConfigOverlaps(context, config, slotNames, groupSlots);
	reportDuplicateGroupSlots(context, configNode, config);
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