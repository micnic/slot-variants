import t from 'tap';
import { rules } from '../../src/eslint-plugin.ts';
import { svelteTester, tester, vueTester } from './helpers.ts';
import {
	REQUIRE_TOP_LEVEL_CONFIG_INVALID,
	REQUIRE_TOP_LEVEL_CONFIG_SVELTE_INVALID,
	REQUIRE_TOP_LEVEL_CONFIG_SVELTE_VALID,
	REQUIRE_TOP_LEVEL_CONFIG_VALID,
	REQUIRE_TOP_LEVEL_CONFIG_VUE_INVALID,
	REQUIRE_TOP_LEVEL_CONFIG_VUE_VALID
} from './require-top-level-config.cases.ts';

t.test('require-top-level-config', (t) => {
	const topLevelRule = rules['require-top-level-config'];

	t.doesNotThrow(() => {
		tester.run('require-top-level-config', topLevelRule, {
			valid: REQUIRE_TOP_LEVEL_CONFIG_VALID,
			invalid: REQUIRE_TOP_LEVEL_CONFIG_INVALID
		});
	}, 'rule tester passes');
	t.end();
});

t.test('require-top-level-config (svelte, vue)', (t) => {
	const topLevelRule = rules['require-top-level-config'];

	t.doesNotThrow(() => {
		svelteTester.run('require-top-level-config', topLevelRule, {
			valid: REQUIRE_TOP_LEVEL_CONFIG_SVELTE_VALID,
			invalid: REQUIRE_TOP_LEVEL_CONFIG_SVELTE_INVALID
		});
	}, 'svelte rule tester passes');
	t.doesNotThrow(() => {
		vueTester.run('require-top-level-config', topLevelRule, {
			valid: REQUIRE_TOP_LEVEL_CONFIG_VUE_VALID,
			invalid: REQUIRE_TOP_LEVEL_CONFIG_VUE_INVALID
		});
	}, 'vue rule tester passes');
	t.end();
});