import t from 'tap';
import { rules } from '../../src/eslint-plugin.ts';
import { tester } from './helpers.ts';
import {
	NO_REDUNDANT_SPACES_INVALID,
	NO_REDUNDANT_SPACES_VALID
} from './no-redundant-spaces.cases.ts';

t.test('no-redundant-spaces', (t) => {
	const spacesRule = rules['no-redundant-spaces'];

	t.doesNotThrow(() => {
		tester.run('no-redundant-spaces', spacesRule, {
			valid: NO_REDUNDANT_SPACES_VALID,
			invalid: NO_REDUNDANT_SPACES_INVALID
		});
	}, 'rule tester passes');
	t.end();
});