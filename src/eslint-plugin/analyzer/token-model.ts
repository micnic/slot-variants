import type { Rule } from 'eslint';
import { getOrCreate } from '../map-utils.ts';

// The conditions a token renders under, as key -> required-value-set matchers:
// a variant value is one matcher (a singleton set), a compound entry one per
// matcher property (a set when the matcher is an array, e.g. `variant: [a,
// b]`), a cn-style conditional a synthetic `cond:`/`ternary@` matcher; nested
// conditionals accumulate.
export type VariantMatchers = ReadonlyMap<string, ReadonlySet<string>>;

export type Source =
	| { kind: 'base' }
	| { kind: 'variant'; matchers: VariantMatchers }
	| { kind: 'compound' };

export type Entry = {
	source: Source;
	slot: string;
	token: string;
	start: number;
	end: number;
};

export type TokenEntriesBySlot = Map<string, Map<string, Entry[]>>;

// The entries of a finding the current pass reports, none to leave it to
// another.
export type PickReported = (
	entries: ReadonlyArray<Entry>
) => ReadonlyArray<Entry>;

export type EntryListFixer = (fixer: Rule.RuleFixer) => Rule.Fix[] | null;

/** How a finding can be resolved: an autofix, suggestions, or neither. */
export type EntryRemedy = Pick<Rule.ReportDescriptorOptions, 'fix' | 'suggest'>;

export const baseSource: Source = { kind: 'base' };

// No readable matcher — never exclusive with anything.
export const compoundSource: Source = { kind: 'compound' };

export const EMPTY_SLOT_NAMES: ReadonlySet<string> = new Set();

export const variantSource = (key: string, value: string): Source => ({
	kind: 'variant',
	matchers: new Map([[key, new Set([value])]])
});

// Accumulates onto an existing variant source so nested conditionals keep
// their outer conditions.
export const withMatcher = (
	source: Source,
	key: string,
	value: string
): Source => {
	if (source.kind !== 'variant') {
		return variantSource(key, value);
	}

	const matchers = new Map(source.matchers);

	matchers.set(key, new Set([value]));

	return { kind: 'variant', matchers };
};

export const getEntryMatchers = (entry: Entry): VariantMatchers | null => {
	if (entry.source.kind === 'variant') {
		return entry.source.matchers;
	}

	return null;
};

// Two value-sets on the same key are exclusive when they share no value —
// `["primary", "secondary"]` and `["secondary"]` overlap (both can render at
// once when the value is `"secondary"`), `["primary"]` and `["link"]` don't.
const areDisjointValueSets = (
	a: ReadonlySet<string>,
	b: ReadonlySet<string>
): boolean => {
	for (const value of a) {
		if (b.has(value)) {
			return false;
		}
	}

	return true;
};

// Exclusive when some key they both constrain requires disjoint value sets —
// no render can satisfy both.
export const areExclusiveMatchers = (
	a: VariantMatchers,
	b: VariantMatchers
): boolean => {
	for (const [key, values] of a) {
		const other = b.get(key);

		if (other !== undefined && areDisjointValueSets(values, other)) {
			return true;
		}
	}

	return false;
};

// An entry with no readable matchers (base/compound) can co-occur with
// anything, so it's never exclusive.
export const areEntriesExclusive = (a: Entry, b: Entry): boolean => {
	const matchersA = getEntryMatchers(a);
	const matchersB = getEntryMatchers(b);

	if (matchersA === null || matchersB === null) {
		return false;
	}

	return areExclusiveMatchers(matchersA, matchersB);
};

// Whether two entries of different tokens can render together. Entries of one
// token aren't: a repeat is a duplicate, reported on its own, and doesn't make
// the tokens it never renders with conflict.
export const areConflicting = (a: Entry, b: Entry): boolean =>
	a.token !== b.token && !areEntriesExclusive(a, b);

// The entries `others` holds one that renders with, as `collides` tells.
export const pickColliding = (
	entries: ReadonlyArray<Entry>,
	others: ReadonlyArray<Entry>,
	collides: (a: Entry, b: Entry) => boolean
): Entry[] =>
	entries.filter((entry) =>
		others.some((other) => other !== entry && collides(entry, other))
	);

export const indexEntriesBySlotAndToken = (
	entries: Iterable<Entry>
): TokenEntriesBySlot => {
	const bySlot = new Map<string, Map<string, Entry[]>>();

	for (const entry of entries) {
		const tokenMap = getOrCreate(
			bySlot,
			entry.slot,
			() => new Map<string, Entry[]>()
		);
		const list = getOrCreate(tokenMap, entry.token, () => []);

		list.push(entry);
	}

	return bySlot;
};

export const reportEntryList = (
	context: Rule.RuleContext,
	entries: ReadonlyArray<Entry>,
	messageId: string,
	data: Record<string, string>,
	remedy?: EntryRemedy
) => {
	const { sourceCode } = context;

	for (const entry of entries) {
		context.report({
			loc: {
				start: sourceCode.getLocFromIndex(entry.start),
				end: sourceCode.getLocFromIndex(entry.end)
			},
			messageId,
			data,
			...remedy
		});
	}
};

// Only the entries of a token that render with another of its entries are
// reported: one disagreeing with all of them on a shared matcher key can't
// co-occur with any. Safe for cn() too: non-variant entries are never
// exclusive, so base-only token lists are always reported.
export const reportDuplicateTokens = (
	context: Rule.RuleContext,
	tokenMap: Map<string, Entry[]>,
	messageId: string,
	data: Record<string, string>,
	pickReported: PickReported
) => {
	for (const [token, list] of tokenMap.entries()) {
		const repeated = pickColliding(
			list,
			list,
			(a, b) => !areEntriesExclusive(a, b)
		);

		if (repeated.length > 0) {
			reportEntryList(context, pickReported(repeated), messageId, {
				token,
				...data
			});
		}
	}
};