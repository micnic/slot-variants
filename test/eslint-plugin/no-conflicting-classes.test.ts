import t from 'tap';
import { rules } from '../../src/eslint-plugin.ts';
import { IMPORT, rule, tester } from './helpers.ts';
import {
	NO_CONFLICTING_DUP_INVALID,
	NO_CONFLICTING_DUP_VALID,
	NO_CONFLICTING_NS_INVALID,
	NO_CONFLICTING_NS_VALID
} from './no-conflicting-classes.cases.ts';

t.test('no-conflicting-classes (duplicate detection)', (t) => {
	t.doesNotThrow(() => {
		tester.run('no-conflicting-classes', rule, {
			valid: NO_CONFLICTING_DUP_VALID,
			invalid: NO_CONFLICTING_DUP_INVALID
		});
	}, 'rule tester passes');
	t.end();
});

t.test('no-conflicting-classes (namespace conflicts)', (t) => {
	const conflictRule = rules['no-conflicting-classes'];

	t.doesNotThrow(() => {
		tester.run('no-conflicting-classes', conflictRule, {
			valid: NO_CONFLICTING_NS_VALID,
			invalid: NO_CONFLICTING_NS_INVALID
		});
	}, 'rule tester passes');
	t.end();
});

t.test('no-conflicting-classes (exclusiveGroups validation)', (t) => {
	const conflictRule = rules['no-conflicting-classes'];

	t.doesNotThrow(() => {
		tester.run('no-conflicting-classes', conflictRule, {
			valid: [
				{
					code: IMPORT + "sv('flex');",
					options: [
						{
							exclusiveGroups: [
								['a', 'b'],
								['c', 'd']
							]
						}
					]
				}
			],
			invalid: []
		});
	}, 'non-overlapping custom groups pass');

	t.throws(
		() => {
			tester.run('no-conflicting-classes', conflictRule, {
				valid: [
					{
						code: IMPORT + "sv('flex');",
						options: [
							{
								exclusiveGroups: [
									['a', 'b'],
									['b', 'c']
								]
							}
						]
					}
				],
				invalid: []
			});
		},
		/"exclusiveGroups" lists "b" in more than one group \(groups 0 and 1\)/,
		'a token listed in two custom groups throws'
	);

	t.end();
});