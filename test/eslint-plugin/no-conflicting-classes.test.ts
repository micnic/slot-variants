import t from 'tap';
import { dup, IMPORT, IMPORT_NS, rule, tester, tsTester } from './helpers.ts';
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
	t.doesNotThrow(() => {
		tester.run('no-conflicting-classes', rule, {
			valid: NO_CONFLICTING_NS_VALID,
			invalid: NO_CONFLICTING_NS_INVALID
		});
	}, 'rule tester passes');
	t.end();
});

t.test('no-conflicting-classes (exclusiveGroups validation)', (t) => {
	t.doesNotThrow(() => {
		tester.run('no-conflicting-classes', rule, {
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
			tester.run('no-conflicting-classes', rule, {
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
		/slot-variants\/no-conflicting-classes: "exclusiveGroups" lists "b" in more than one group \(groups 0 and 1\)/,
		'a token listed in two custom groups throws'
	);

	t.end();
});
// Callees behind type-only wrappers, and namespace members read through a
// `const` alias or destructured, still name their export.
t.test('no-conflicting-classes (wrapped and destructured callees)', (t) => {
	const config = "({ base: 'w-1 w-1', variants: {} });";

	t.doesNotThrow(() => {
		tsTester.run('no-conflicting-classes', rule, {
			valid: [
				// Destructured off anything but the namespace import.
				`${IMPORT_NS}const { sv } = other;\nsv${config}`,
				`${IMPORT_NS}let { sv } = SV;\nsv${config}`,
				`${IMPORT_NS}const { sv } = SV;\nfunction f(sv) { sv${config} }`
			],
			invalid: [
				`${IMPORT}(sv as any)${config}`,
				`${IMPORT}sv!${config}`,
				`${IMPORT_NS}(SV.sv as any)${config}`,
				`${IMPORT_NS}const s = SV.sv;\ns${config}`,
				`${IMPORT_NS}const NS = SV;\nNS.sv${config}`,
				`${IMPORT_NS}const { sv } = SV;\nsv${config}`,
				`${IMPORT_NS}const { sv: build } = SV as any;\nbuild${config}`
			].map((code) => ({ code, errors: [dup('w-1'), dup('w-1')] }))
		});
	}, 'rule tester passes');
	t.end();
});