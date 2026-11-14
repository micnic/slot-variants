import type { Rule } from 'eslint';
import { noConflictingClasses } from './no-conflicting-classes.ts';
import { noDynamicClasses } from './no-dynamic-classes.ts';
import { noEmptyClasses } from './no-empty-classes.ts';
import { noRedundantSpaces } from './no-redundant-spaces.ts';
import { noRestyle } from './no-restyle.ts';
import { noSharedTokens } from './no-shared-tokens.ts';
import { requireTopLevelConfig } from './require-top-level-config.ts';
import { svConfigStyle } from './sv-config-style.ts';

// Where a report points: its node's location, since the node would serialize
// with its whole subtree, or the location given instead of one.
const getReportLocation = (descriptor: Rule.ReportDescriptor) => {
	if ('node' in descriptor) {
		return descriptor.node.loc;
	}

	return descriptor.loc;
};

// What makes two reports the same one: the message, its data and where it is.
// A fix is a function, which serializing leaves out. The node is swapped out
// up front, as a replacer would run for every nested key.
const getReportKey = (descriptor: Rule.ReportDescriptor): string =>
	JSON.stringify({ ...descriptor, node: getReportLocation(descriptor) });

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