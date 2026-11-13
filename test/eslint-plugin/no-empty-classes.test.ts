import t from 'tap';
import { rules } from '../../src/eslint-plugin.ts';
import { tester } from './helpers.ts';
import {
	NO_EMPTY_CLASSES_INVALID,
	NO_EMPTY_CLASSES_VALID
} from './no-empty-classes.cases.ts';

t.test('no-empty-classes', (t) => {
	const emptyRule = rules['no-empty-classes'];

	t.doesNotThrow(() => {
		tester.run('no-empty-classes', emptyRule, {
			valid: NO_EMPTY_CLASSES_VALID,
			invalid: NO_EMPTY_CLASSES_INVALID
		});
	}, 'rule tester passes');
	t.end();
});