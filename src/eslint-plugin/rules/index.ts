import { noConflictingClasses } from './no-conflicting-classes.ts';
import { noDynamicClasses } from './no-dynamic-classes.ts';
import { noEmptyClasses } from './no-empty-classes.ts';
import { noRedundantSpaces } from './no-redundant-spaces.ts';
import { noSharedTokens } from './no-shared-tokens.ts';
import { requireTopLevelConfig } from './require-top-level-config.ts';
import { svConfigStyle } from './sv-config-style.ts';

export const rules = {
	'no-conflicting-classes': noConflictingClasses,
	'no-dynamic-classes': noDynamicClasses,
	'no-empty-classes': noEmptyClasses,
	'no-redundant-spaces': noRedundantSpaces,
	'no-shared-tokens': noSharedTokens,
	'require-top-level-config': requireTopLevelConfig,
	'sv-config-style': svConfigStyle
};