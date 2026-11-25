import type { Rule } from 'eslint';
import { getOrCreate } from '../map-utils.ts';

// The conditions a token renders under, as key -> required-value-set matchers:
// a variant value is one matcher (a singleton set), a compound entry one per
// matcher property (a set when the matcher is an array, e.g. `variant: [a,
// b]`), a cn-style conditional a synthetic `cond:`/`ternary@` matcher; nested
// conditionals accumulate.
export type VariantMatchers = ReadonlyMap<string, ReadonlySet<string>>;

// The matchers a token renders under; none when it renders whatever the
// variant values are.
export type Source = VariantMatchers;

export type Entry = {
	source: Source;
	slot: string;
	token: string;
	start: number;
	end: number;
};

export type TokenEntriesBySlot = Map<string, Map<string, Entry[]>>;

export type EntryListFixer = (fixer: Rule.RuleFixer) => Rule.Fix[] | null;

/** How a finding can be resolved: an autofix, suggestions, or neither. */
export type EntryRemedy = Pick<Rule.ReportDescriptorOptions, 'fix' | 'suggest'>;

export const baseSource: Source = new Map();

export const EMPTY_SLOT_NAMES: ReadonlySet<string> = new Set();

export const variantSource = (key: string, value: string): Source =>
	new Map([[key, new Set([value])]]);

// Accumulates onto an existing source so nested conditionals keep their outer
// conditions.
export const withMatcher = (
	source: Source,
	key: string,
	value: string
): Source => new Map(source).set(key, new Set([value]));

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

// An entry without matchers (base/compound) can co-occur with anything, so
// it's never exclusive.
export const areEntriesExclusive = (a: Entry, b: Entry): boolean =>
	areExclusiveMatchers(a.source, b.source);

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