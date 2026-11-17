import type { Rule } from 'eslint';
import { getOrCreate } from '../map-utils.ts';
import {
	buildExclusiveGroupMap,
	type ConflictOptions,
	type ExclusiveGroupsOption,
	normalizePrefix
} from '../tailwind-categories.ts';

type JSONSchema = Exclude<
	NonNullable<Rule.RuleMetaData['schema']>,
	false | ReadonlyArray<object>
>;

/** The options `no-conflicting-classes` and `no-restyle` both accept. */
type ConflictRuleOption = {
	exclusiveGroups?: ExclusiveGroupsOption;
	prefix?: string;
};

/** Schema properties for the options in `ConflictRuleOption`. */
export const conflictOptionProperties: Record<string, JSONSchema> = {
	exclusiveGroups: {
		oneOf: [
			{ type: 'boolean' },
			{
				type: 'array',
				items: {
					type: 'array',
					items: { type: 'string' },
					minItems: 2
				}
			}
		]
	},
	prefix: { type: 'string', minLength: 1 }
};

// Stands in for a rule left without options, so it is cached like any other.
const noOption: ConflictRuleOption = {};

// ESLint hands every file linted with one config the same options object, so
// the options read from it, and the conflict keys they cache, are reused.
const readOptions = new WeakMap<ConflictRuleOption, ConflictOptions>();

export const readConflictOptions = (
	option: ConflictRuleOption = noOption
): ConflictOptions =>
	getOrCreate(readOptions, option, () => ({
		exclusiveGroups: buildExclusiveGroupMap(option.exclusiveGroups),
		prefix: normalizePrefix(option.prefix),
		conflictKeys: new Map()
	}));