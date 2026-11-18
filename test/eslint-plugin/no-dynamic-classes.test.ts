import t from 'tap';
import { RuleTester } from 'eslint';
import { parser as tsParser } from 'typescript-eslint';
import { rules } from '../../src/eslint-plugin.ts';
import { IMPORT_CN, tester } from './helpers.ts';
import {
	NO_DYNAMIC_CLASSES_INVALID,
	NO_DYNAMIC_CLASSES_VALID
} from './no-dynamic-classes.cases.ts';

t.test('no-dynamic-classes', (t) => {
	const dynamicRule = rules['no-dynamic-classes'];

	t.doesNotThrow(() => {
		tester.run('no-dynamic-classes', dynamicRule, {
			valid: NO_DYNAMIC_CLASSES_VALID,
			invalid: NO_DYNAMIC_CLASSES_INVALID
		});
	}, 'rule tester passes');
	t.end();
});
// An ambient `declare const` destructures a type, not a value, so the name it
// binds holds no slot of any call.
t.test('no-dynamic-classes reports an ambient destructured name', (t) => {
	const tsTester = new RuleTester({ languageOptions: { parser: tsParser } });

	t.doesNotThrow(() => {
		tsTester.run('no-dynamic-classes', rules['no-dynamic-classes'], {
			valid: [],
			invalid: [
				{
					code:
						IMPORT_CN +
						"declare const { header }: { header: string };\ncn(header, 'p-4');",
					filename: 'test.ts',
					errors: [{ messageId: 'dynamic' }]
				}
			]
		});
	}, 'rule tester passes');
	t.end();
});