import pkg from '../package.json' with { type: 'json' };
import { rules } from './eslint-plugin/rules/index.ts';

export { rules } from './eslint-plugin/rules/index.ts';

/** Plugin metadata surfaced by ESLint and oxlint. */
const meta = { name: 'slot-variants', version: pkg.version };

type RecommendedConfig = {
	name: string;
	plugins: Record<string, SlotVariantsPlugin>;
	rules: Record<string, 'error'>;
};

type SlotVariantsPlugin = {
	meta: typeof meta;
	rules: typeof rules;
	configs: { recommended: RecommendedConfig };
};

// Derive the preset from rule metadata so adding a recommended rule remains a
// single edit in its rule definition.
const recommendedRules: Record<string, 'error'> = {};

for (const [name, rule] of Object.entries(rules)) {
	if (rule.meta?.docs?.recommended === true) {
		recommendedRules[`slot-variants/${name}`] = 'error';
	}
}

/** Flat-config preset enabling every recommended rule at `error`. */
const recommended: RecommendedConfig = {
	name: 'slot-variants/recommended',
	plugins: {},
	rules: recommendedRules
};

const plugin: SlotVariantsPlugin = {
	meta,
	rules,
	configs: { recommended }
};

// The preset registers the plugin it belongs to, so the reference can only be
// filled in once both objects exist.
recommended.plugins['slot-variants'] = plugin;

export default plugin;