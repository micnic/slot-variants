import type { Rule } from 'eslint';
import { noConflictingClasses } from './no-conflicting-classes.ts';
import { noDynamicClasses } from './no-dynamic-classes.ts';
import { noEmptyClasses } from './no-empty-classes.ts';
import { noRedundantSpaces } from './no-redundant-spaces.ts';
import { noRestyle } from './no-restyle.ts';
import { noSharedTokens } from './no-shared-tokens.ts';
import { requireTopLevelConfig } from './require-top-level-config.ts';
import { svConfigStyle } from './sv-config-style.ts';

// What makes two reports the same one: the message, its data and where it is.
// A node stands in by its location, since it would be serialized with its
// whole subtree, and a fix is a function, which serializing leaves out.
const getReportKey = (descriptor: Rule.ReportDescriptor): string =>
	JSON.stringify(descriptor, (key, value) => {
		if (key === 'node') {
			return value.loc;
		}

		return value;
	});

/**
 * The rule context with a `report` that drops a report identical to an earlier
 * one. A value hoisted into a `const` is analyzed again for every call reading
 * it, which would repeat its findings at the same place. The context is
 * extended rather than copied, so everything else is read from the host's own.
 */
const withReportOnce = (context: Rule.RuleContext): Rule.RuleContext => {
	const reported = new Set<string>();

	return Object.create(context, {
		report: {
			value: (descriptor: Rule.ReportDescriptor) => {
				const key = getReportKey(descriptor);

				if (reported.has(key)) {
					return;
				}

				reported.add(key);
				context.report(descriptor);
			}
		}
	});
};

const reportingOnce = (rule: Rule.RuleModule): Rule.RuleModule => ({
	...rule,
	create: (context) => rule.create(withReportOnce(context))
});

export const rules = {
	'no-conflicting-classes': reportingOnce(noConflictingClasses),
	'no-dynamic-classes': reportingOnce(noDynamicClasses),
	'no-empty-classes': reportingOnce(noEmptyClasses),
	'no-redundant-spaces': reportingOnce(noRedundantSpaces),
	'no-restyle': reportingOnce(noRestyle),
	'no-shared-tokens': reportingOnce(noSharedTokens),
	'require-top-level-config': reportingOnce(requireTopLevelConfig),
	'sv-config-style': reportingOnce(svConfigStyle)
};