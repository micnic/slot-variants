import type { Linter } from 'eslint';
import pkg from '../package.json' with { type: 'json' };
import { rules } from './eslint-plugin/rules/index.ts';

export { rules } from './eslint-plugin/rules/index.ts';

/** Plugin metadata surfaced by ESLint and oxlint. */
const meta = { name: 'slot-variants', version: pkg.version };

// Derive the preset from rule metadata so adding a recommended rule remains a
// single edit in its rule definition.
const recommendedRules: Record<string, 'error'> = {};

for (const [name, rule] of Object.entries(rules)) {
	if (rule.meta?.docs?.recommended === true) {
		recommendedRules[`slot-variants/${name}`] = 'error';
	}
}

const plugin = {
	meta,
	rules,
	configs: {} as Record<string, Linter.Config>
};

/** Flat-config preset enabling every recommended rule at `error`. */
plugin.configs.recommended = {
	name: 'slot-variants/recommended',
	plugins: { 'slot-variants': plugin },
	rules: recommendedRules
};

export default plugin;