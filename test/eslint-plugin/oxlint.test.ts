import t from 'tap';
import { RuleTester as OxlintRuleTester } from 'oxlint/plugins-dev';
import { rules } from '../../src/eslint-plugin.ts';
import { CROSS_FILE_INVALID, CROSS_FILE_VALID } from './cross-file.cases.ts';
import {
	NO_CONFLICTING_DUP_INVALID,
	NO_CONFLICTING_DUP_VALID,
	NO_CONFLICTING_NS_INVALID,
	NO_CONFLICTING_NS_VALID
} from './no-conflicting-classes.cases.ts';
import {
	NO_DYNAMIC_CLASSES_INVALID,
	NO_DYNAMIC_CLASSES_VALID
} from './no-dynamic-classes.cases.ts';
import {
	NO_EMPTY_CLASSES_INVALID,
	NO_EMPTY_CLASSES_VALID
} from './no-empty-classes.cases.ts';
import {
	NO_REDUNDANT_SPACES_INVALID,
	NO_REDUNDANT_SPACES_VALID
} from './no-redundant-spaces.cases.ts';
import { RESTYLE_INVALID, RESTYLE_VALID } from './no-restyle.cases.ts';
import {
	NO_SHARED_TOKENS_INVALID,
	NO_SHARED_TOKENS_VALID
} from './no-shared-tokens.cases.ts';
import {
	REQUIRE_TOP_LEVEL_CONFIG_INVALID,
	REQUIRE_TOP_LEVEL_CONFIG_VALID
} from './require-top-level-config.cases.ts';
import {
	SV_CONFIG_STYLE_BASE_INVALID,
	SV_CONFIG_STYLE_BASE_VALID,
	SV_CONFIG_STYLE_ORDER_INVALID,
	SV_CONFIG_STYLE_ORDER_VALID
} from './sv-config-style.cases.ts';

// oxlint runs ESLint-style rules through its `jsPlugins` API, so every
// plain-script and JSX suite runs again under oxlint's `RuleTester`, cross-file
// `no-restyle` included. Vue and Svelte need custom parsers oxlint cannot
// load, so those suites stay ESLint-only.
type OxlintRule = Parameters<OxlintRuleTester['run']>[1];

const isOxlintRule = (value: object): value is OxlintRule =>
	'create' in value && typeof value.create === 'function';

const oxlintTester = new OxlintRuleTester({ eslintCompat: true });

const oxlintJsxTester = new OxlintRuleTester({
	eslintCompat: true,
	languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } }
});

const OXLINT_SUITES = [
	[
		'no-redundant-spaces',
		NO_REDUNDANT_SPACES_VALID,
		NO_REDUNDANT_SPACES_INVALID
	],
	[
		'no-dynamic-classes',
		NO_DYNAMIC_CLASSES_VALID,
		NO_DYNAMIC_CLASSES_INVALID
	],
	['no-empty-classes', NO_EMPTY_CLASSES_VALID, NO_EMPTY_CLASSES_INVALID],
	[
		'no-conflicting-classes',
		NO_CONFLICTING_DUP_VALID,
		NO_CONFLICTING_DUP_INVALID
	],
	[
		'no-conflicting-classes',
		NO_CONFLICTING_NS_VALID,
		NO_CONFLICTING_NS_INVALID
	],
	['no-shared-tokens', NO_SHARED_TOKENS_VALID, NO_SHARED_TOKENS_INVALID],
	[
		'require-top-level-config',
		REQUIRE_TOP_LEVEL_CONFIG_VALID,
		REQUIRE_TOP_LEVEL_CONFIG_INVALID
	],
	[
		'sv-config-style',
		SV_CONFIG_STYLE_ORDER_VALID,
		SV_CONFIG_STYLE_ORDER_INVALID
	],
	[
		'sv-config-style',
		SV_CONFIG_STYLE_BASE_VALID,
		SV_CONFIG_STYLE_BASE_INVALID
	]
] as const;

t.test('oxlint compatibility', (t) => {
	for (const [name, valid, invalid] of OXLINT_SUITES) {
		const oxlintRule = rules[name];

		if (!isOxlintRule(oxlintRule)) {
			t.fail(`${name}: not an oxlint rule`);
			continue;
		}

		t.doesNotThrow(() => {
			oxlintTester.run(name, oxlintRule, { valid, invalid });
		}, `${name}: oxlint rule tester passes`);
	}

	const restyleRule = rules['no-restyle'];

	if (isOxlintRule(restyleRule)) {
		t.doesNotThrow(() => {
			oxlintJsxTester.run('no-restyle', restyleRule, {
				valid: [...RESTYLE_VALID, ...CROSS_FILE_VALID],
				invalid: [...RESTYLE_INVALID, ...CROSS_FILE_INVALID]
			});
		}, 'no-restyle: oxlint rule tester passes');
	} else {
		t.fail('no-restyle: not an oxlint rule');
	}

	t.end();
});