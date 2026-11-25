import t from 'tap';
import { rules } from '../../src/eslint-plugin.ts';
import { IMPORT, IMPORT_CN, tester, tsTester } from './helpers.ts';
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
// A type named like a `const` (`type Size = keyof typeof Size`) declares no
// other value, so the `const` is still read as its value.
t.test('no-dynamic-classes reads a const a type also names', (t) => {
	t.doesNotThrow(() => {
		tsTester.run('no-dynamic-classes', rules['no-dynamic-classes'], {
			valid: [
				{
					code:
						IMPORT +
						"const Size = { sm: 'text-sm', lg: 'text-lg' } as const;\ntype Size = keyof typeof Size;\nsv({ variants: { size: Size } });",
					filename: 'test.ts'
				},
				{
					code:
						IMPORT +
						"const tone = 'text-red-500';\ninterface tone { value: string }\nsv({ base: tone, variants: {} });",
					filename: 'test.ts'
				}
			],
			invalid: []
		});
	}, 'rule tester passes');
	t.end();
});

// An ambient `declare const` destructures a type, not a value, so the name it
// binds holds no slot of any call.
t.test('no-dynamic-classes reports an ambient destructured name', (t) => {
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