import t from 'tap';
import { Linter } from 'eslint';
import plugin, { rules } from '../../src/eslint-plugin.ts';
import { IMPORT, tester } from './helpers.ts';
import {
	SV_CONFIG_STYLE_BASE_INVALID,
	SV_CONFIG_STYLE_BASE_VALID,
	SV_CONFIG_STYLE_ORDER_INVALID,
	SV_CONFIG_STYLE_ORDER_VALID
} from './sv-config-style.cases.ts';

t.test('sv-config-style (key order)', (t) => {
	const styleRule = rules['sv-config-style'];

	t.doesNotThrow(() => {
		tester.run('sv-config-style', styleRule, {
			valid: SV_CONFIG_STYLE_ORDER_VALID,
			invalid: SV_CONFIG_STYLE_ORDER_INVALID
		});
	}, 'rule tester passes');
	t.end();
});

t.test('sv-config-style (base style)', (t) => {
	const styleRule = rules['sv-config-style'];

	t.doesNotThrow(() => {
		tester.run('sv-config-style', styleRule, {
			valid: SV_CONFIG_STYLE_BASE_VALID,
			invalid: SV_CONFIG_STYLE_BASE_INVALID
		});
	}, 'rule tester passes');
	t.end();
});

// ESLint discards a fix whose output fails to parse, which would hide a broken
// fix from the rule tester, so the raw fixes are inspected instead.
t.test('sv-config-style offers no base fix around parentheses', (t) => {
	const linter = new Linter();
	const config: Linter.Config[] = [
		{
			plugins: { 'slot-variants': plugin },
			rules: { 'slot-variants/sv-config-style': 'error' }
		}
	];
	const messages = linter.verify(
		`${IMPORT}sv(('flex'), { variants: {} });`,
		config,
		{ filename: 'test.js' }
	);

	t.same(
		messages.map(({ messageId, fix }) => ({ messageId, fix })),
		[{ messageId: 'wrongBaseStyle', fix: undefined }],
		'parenthesized leading argument'
	);

	t.end();
});