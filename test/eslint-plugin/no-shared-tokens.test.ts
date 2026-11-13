import t from 'tap';
import { rules } from '../../src/eslint-plugin.ts';
import { tester } from './helpers.ts';
import {
	NO_SHARED_TOKENS_INVALID,
	NO_SHARED_TOKENS_VALID
} from './no-shared-tokens.cases.ts';

t.test('no-shared-tokens', (t) => {
	const sharedRule = rules['no-shared-tokens'];

	t.doesNotThrow(() => {
		tester.run('no-shared-tokens', sharedRule, {
			valid: NO_SHARED_TOKENS_VALID,
			invalid: NO_SHARED_TOKENS_INVALID
		});
	}, 'rule tester passes');
	t.end();
});