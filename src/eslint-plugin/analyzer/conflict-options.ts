import type { Rule } from 'eslint';
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

export const readConflictOptions = (
	option: ConflictRuleOption | undefined
): ConflictOptions => ({
	exclusiveGroups: buildExclusiveGroupMap(option?.exclusiveGroups),
	prefix: normalizePrefix(option?.prefix)
});