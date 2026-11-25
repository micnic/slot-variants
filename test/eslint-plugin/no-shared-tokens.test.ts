import t from 'tap';
import { rules } from '../../src/eslint-plugin.ts';
import { IMPORT, tester, tsTester } from './helpers.ts';
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

// A compound entry with a TS wrapper is removed whole, wrapper included.
t.test('no-shared-tokens removes a wrapped compound entry whole', (t) => {
	const variants =
		"variants: { size: { sm: 'a', lg: 'b' }, on: { true: 'o' } }";
	const lift = "{ size: { sm: 'a x', lg: 'b' }, on: { true: 'o' } }";
	const kept = "{ size: 'lg', on: true, class: 'y' }";

	t.doesNotThrow(() => {
		tsTester.run('no-shared-tokens', rules['no-shared-tokens'], {
			valid: [],
			invalid: [
				{
					code: `${IMPORT}sv({ ${variants}, compoundVariants: [{ size: 'sm', class: 'x' } as B, ${kept}] });`,
					filename: 'test.ts',
					output: `${IMPORT}sv({ variants: ${lift}, compoundVariants: [${kept}] });`,
					errors: [{ messageId: 'singleKeyCompound' }]
				},
				{
					code: `${IMPORT}sv({ ${variants}, compoundVariants: [${kept}, { size: 'sm', class: 'x' } satisfies B] });`,
					filename: 'test.ts',
					output: `${IMPORT}sv({ variants: ${lift}, compoundVariants: [${kept}] });`,
					errors: [{ messageId: 'singleKeyCompound' }]
				}
			]
		});
	}, 'rule tester passes');
	t.end();
});

// A compound list wrapped in `as const` isn't the config property's value
// itself, so emptying it leaves no property the fix knows how to remove.
t.test('no-shared-tokens leaves a wrapped compound list unfixed', (t) => {
	t.doesNotThrow(() => {
		tsTester.run('no-shared-tokens', rules['no-shared-tokens'], {
			valid: [],
			invalid: [
				{
					code:
						IMPORT +
						"sv({ variants: { size: { sm: 'p-1', lg: 'p-2' } }, compoundVariants: [{ size: 'sm', class: 'gap-2' }] as const });",
					filename: 'test.ts',
					output: null,
					errors: [{ messageId: 'singleKeyCompound' }]
				}
			]
		});
	}, 'rule tester passes');
	t.end();
});