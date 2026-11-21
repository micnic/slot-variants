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
	getCallStyles,
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
	areConflicting,
	areEntriesExclusive,
	type Entry,
	indexEntriesBySlotAndToken,
	type PickReported,
	pickColliding,
	reportDuplicateTokens,
	reportEntryList
} from './token-model.ts';

type ConflictGroup = {
	tokens: Set<string>;
	entries: Entry[];
	variantPrefix: string;
	overlap: string | null;
};

type GroupMembers = Pick<ConflictGroup, 'tokens' | 'entries'>;

// Overlap node -> that node's own group, for every node in one component.
type OverlapComponent = Map<string, ConflictGroup>;

// What reporting reads from a group: a merged overlap component keeps its
// nodes' own groups, as its exclusivity is checked edge by edge.
type ReportedGroup = GroupMembers & { component: OverlapComponent | null };

// Adds `source`'s tokens and entries to `target`.
const absorbGroup = (target: GroupMembers, source: GroupMembers) => {
	for (const token of source.tokens) {
		target.tokens.add(token);
	}

	target.entries.push(...source.entries);
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
			overlap: info.overlap
		}));

		group.tokens.add(token);
		group.entries.push(...list);
	}

	return groups;
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

// The entries of a component that collide: with another token of their own
// node, or with any entry of a node a real covers edge joins theirs to — nodes
// that merely share a bridge node without being adjacent to each other (`px`
// and `pb` through `p`) are never compared.
const pickCollidingInComponent = (component: OverlapComponent): Entry[] => {
	const colliding: Entry[] = [];

	for (const [node, group] of component) {
		// Every present neighbor of a component node is in the component.
		const neighbors = overlapNeighbors(node).flatMap(
			(neighbor) => component.get(neighbor)?.entries ?? []
		);

		colliding.push(
			...group.entries.filter(
				(entry) =>
					group.entries.some((other) =>
						areConflicting(entry, other)
					) ||
					neighbors.some(
						(other) => !areEntriesExclusive(entry, other)
					)
			)
		);
	}

	return colliding;
};

// The entries of a group that render with another token of it.
const pickCollidingInGroup = (group: ReportedGroup): Entry[] => {
	if (group.component === null) {
		return pickColliding(group.entries, group.entries, areConflicting);
	}

	return pickCollidingInComponent(group.component);
};

const buildOverlapConflictGroup = (
	component: OverlapComponent
): ReportedGroup => {
	const merged: ReportedGroup = {
		tokens: new Set<string>(),
		entries: [],
		component
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
			result.push({ ...group, component: null });
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
	pickReported: PickReported
) => {
	const groups = groupEntriesByConflictKey(tokenMap, options);

	for (const group of mergeOverlappingGroups(groups)) {
		if (group.tokens.size < 2) {
			continue;
		}

		// Only the entries rendering with another token are reported, and
		// named: one exclusive with all of them never conflicts.
		const colliding = pickCollidingInGroup(group);

		if (colliding.length === 0) {
			continue;
		}

		const tokens = [...new Set(colliding.map(({ token }) => token))]
			.sort()
			.join(', ');

		reportEntryList(context, pickReported(colliding), messageId, {
			tokens,
			...data
		});
	}
};

const REPORT_ALL: PickReported = (entries) => entries;

const REPORT_NONE: ReadonlyArray<Entry> = [];

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

/**
 * Checks the classes a config's call applies, its inherited ones included:
 * those of the components it extends and its `createSV()` factory's `base`.
 * Only the config's own classes are reported, so a finding among inherited
 * ones alone is left to the config that writes them.
 */
export const analyzeConfigForRule = (
	context: Rule.RuleContext,
	node: CallExpression,
	configNode: ObjectExpression,
	baseArgs: ReadonlyArray<Expression | SpreadElement>,
	options: ConflictOptions,
	ctx: StyledContext
) => {
	const config = getConfigProperties(configNode, context.sourceCode);
	const { styles, inherited } = getCallStyles(
		node,
		configNode,
		baseArgs,
		ctx
	);
	const { bySlot, slotNames, groupSlots } = styles;
	const report = (
		tokenMap: Map<string, Entry[]>,
		slot: string,
		pickReported: PickReported
	) => {
		reportDuplicateTokens(
			context,
			tokenMap,
			'duplicate',
			{ slot },
			pickReported
		);
		reportConflicts(
			context,
			tokenMap,
			'conflict',
			{ slot },
			options,
			pickReported
		);
	};
	const pickOwn: PickReported = (entries) =>
		entries.filter((entry) => !inherited.has(entry));
	// A finding inside one group's own classes is the group's to report, not
	// each of its member slots'.
	const pickOutsideGroups: PickReported = (entries) => {
		const [first] = entries;

		if (
			first !== undefined &&
			groupSlots.has(first.slot) &&
			entries.every((entry) => entry.slot === first.slot)
		) {
			return REPORT_NONE;
		}

		return pickOwn(entries);
	};
	const slots = new Set<string>();

	for (const [bucket, tokenMap] of bySlot) {
		if (groupSlots.has(bucket)) {
			report(tokenMap, bucket, pickOwn);
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
			pickOutsideGroups
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