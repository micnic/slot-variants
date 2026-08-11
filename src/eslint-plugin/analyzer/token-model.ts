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

// True when every pair of entries disagrees on at least one shared matcher
// key, so they can't co-occur.
export const isMutuallyExclusiveVariants = (list: Entry[]): boolean => {
	const matchers: VariantMatchers[] = [];

	for (const entry of list) {
		const entryMatchers = getEntryMatchers(entry);

		if (entryMatchers === null) {
			return false;
		}

		matchers.push(entryMatchers);
	}

	for (const [index, current] of matchers.entries()) {
		for (const other of matchers.slice(index + 1)) {
			if (!areExclusiveMatchers(current, other)) {
				return false;
			}
		}
	}

	return true;
};

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

export const reportEntryList = (
	context: Rule.RuleContext,
	entries: ReadonlyArray<Entry>,
	messageId: string,
	data: Record<string, string>,
	fix?: (fixer: Rule.RuleFixer) => Rule.Fix[] | null
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
			fix
		});
	}
};

// Safe for cn() too: isMutuallyExclusiveVariants short-circuits to false on
// non-variant entries, so base-only token lists are never skipped.
export const reportDuplicateTokens = (
	context: Rule.RuleContext,
	tokenMap: Map<string, Entry[]>,
	messageId: string,
	data: Record<string, string>
) => {
	for (const [token, list] of tokenMap.entries()) {
		if (list.length < 2 || isMutuallyExclusiveVariants(list)) {
			continue;
		}

		reportEntryList(context, list, messageId, { token, ...data });
	}
};