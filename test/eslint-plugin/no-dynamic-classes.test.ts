import t from 'tap';
import { rules } from '../../src/eslint-plugin.ts';
import { tester } from './helpers.ts';
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