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

export const baseSource: Source = { kind: 'base' };

// No readable matcher — never exclusive with anything.
export const compoundSource: Source = { kind: 'compound' };

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

export type Entry = {
	source: Source;
	slot: string;
	token: string;
	start: number;
	end: number;
};

export type TokenEntriesBySlot = Map<string, Map<string, Entry[]>>;

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

// Every entry's matchers, or null the moment one entry has no readable matcher
// (base/compound), since such an entry can co-occur with anything.
export const getEntriesMatchers = (
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

// True when every pair of matchers disagrees on at least one shared key. Null
// (some entry has no readable matchers) is never exclusive.
const arePairwiseExclusive = (
	matchers: ReadonlyArray<VariantMatchers> | null
): boolean => {
	if (matchers === null) {
		return false;
	}

	for (const [index, current] of matchers.entries()) {
		// Indexed rather than sliced: this runs for every candidate pair of
		// tokens, so it shouldn't copy the rest of the list on each step.
		for (let next = index + 1; next < matchers.length; next += 1) {
			const other = matchers[next];

			if (other !== undefined && !areExclusiveMatchers(current, other)) {
				return false;
			}
		}
	}

	return true;
};

const areEntriesExclusive = (a: Entry, b: Entry): boolean => {
	const matchersA = getEntryMatchers(a);
	const matchersB = getEntryMatchers(b);

	if (matchersA === null || matchersB === null) {
		return false;
	}

	return areExclusiveMatchers(matchersA, matchersB);
};

// True when no two entries of different tokens can render together. Entries
// of one token aren't compared: a repeat is a duplicate, reported on its own,
// and doesn't make the tokens it never renders with conflict.
export const areDistinctTokensExclusive = (
	entries: ReadonlyArray<Entry>
): boolean => {
	for (const [index, current] of entries.entries()) {
		for (const other of entries.slice(index + 1)) {
			if (
				current.token !== other.token &&
				!areEntriesExclusive(current, other)
			) {
				return false;
			}
		}
	}

	return true;
};

// True when every pair of entries disagrees on at least one shared matcher
// key, so they can't co-occur.
const isMutuallyExclusiveVariants = (list: Entry[]): boolean =>
	arePairwiseExclusive(getEntriesMatchers(list));

export const EMPTY_SLOT_NAMES = new Set<string>();

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

// Whether a finding over these entries is reported by the current pass.
export type EntryListFilter = (entries: ReadonlyArray<Entry>) => boolean;

export type EntryListFixer = (fixer: Rule.RuleFixer) => Rule.Fix[] | null;

/** How a finding can be resolved: an autofix, suggestions, or neither. */
export type EntryRemedy = Pick<Rule.ReportDescriptorOptions, 'fix' | 'suggest'>;

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

// Safe for cn() too: isMutuallyExclusiveVariants short-circuits to false on
// non-variant entries, so base-only token lists are never skipped.
export const reportDuplicateTokens = (
	context: Rule.RuleContext,
	tokenMap: Map<string, Entry[]>,
	messageId: string,
	data: Record<string, string>,
	isReported: EntryListFilter
) => {
	for (const [token, list] of tokenMap.entries()) {
		if (
			list.length < 2 ||
			isMutuallyExclusiveVariants(list) ||
			!isReported(list)
		) {
			continue;
		}

		reportEntryList(context, list, messageId, { token, ...data });
	}
};