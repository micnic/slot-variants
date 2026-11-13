import t from 'tap';
import { sv, type VariantValue } from '../../src/index.ts';

// sv() - groups

t.test('group applies variant classes to every slot it names', (t) => {
	const card = sv('border', {
		slots: {
			header: 'font-bold',
			body: 'py-4',
			footer: 'text-xs'
		},
		groups: {
			content: ['header', 'body']
		},
		variants: {
			size: {
				sm: { content: 'text-sm' },
				lg: { content: 'text-lg', footer: 'text-sm' }
			}
		}
	});

	t.strictSame(
		card({ size: 'sm' }),
		{
			base: 'border',
			header: 'font-bold text-sm',
			body: 'py-4 text-sm',
			footer: 'text-xs'
		},
		'group value reaches both of its slots'
	);

	t.strictSame(
		card({ size: 'lg' }),
		{
			base: 'border',
			header: 'font-bold text-lg',
			body: 'py-4 text-lg',
			footer: 'text-xs text-sm'
		},
		'group and slot keys coexist in one value'
	);

	t.end();
});

t.test('group can name the base slot', (t) => {
	const card = sv('border', {
		slots: {
			header: 'font-bold'
		},
		groups: {
			outer: ['base', 'header']
		},
		variants: {
			bordered: { true: { outer: 'border-2' } }
		}
	});

	t.strictSame(
		card({ bordered: true }),
		{ base: 'border border-2', header: 'font-bold border-2' },
		'base is a valid group member'
	);

	t.end();
});

t.test('group and slot classes apply in written key order', (t) => {
	const slotFirst = sv({
		slots: {
			header: 'a',
			body: 'b'
		},
		groups: {
			content: ['header', 'body']
		},
		variants: {
			size: {
				lg: { header: 'slot', content: 'group' }
			}
		}
	});

	t.strictSame(
		slotFirst({ size: 'lg' }),
		{ base: '', header: 'a slot group', body: 'b group' },
		'the slot key written first lands first'
	);

	const groupFirst = sv({
		slots: {
			header: 'a',
			body: 'b'
		},
		groups: {
			content: ['header', 'body']
		},
		variants: {
			size: {
				lg: { content: 'group', header: 'slot' }
			}
		}
	});

	t.strictSame(
		groupFirst({ size: 'lg' }),
		{ base: '', header: 'a group slot', body: 'b group' },
		'the group key written first lands first'
	);

	t.end();
});

t.test('compoundVariants class object accepts a group name', (t) => {
	const card = sv({
		slots: {
			header: 'h',
			body: 'b',
			footer: 'f'
		},
		groups: {
			content: ['header', 'body']
		},
		variants: {
			size: { sm: '', lg: '' },
			tone: { loud: '', quiet: '' }
		},
		compoundVariants: [
			{
				size: 'lg',
				tone: 'loud',
				class: { content: 'font-bold' }
			}
		]
	});

	t.strictSame(
		card({ size: 'lg', tone: 'loud' }),
		{ base: '', header: 'h font-bold', body: 'b font-bold', footer: 'f' },
		'compound variant class expands the group'
	);

	t.strictSame(
		card({ size: 'sm', tone: 'loud' }),
		{ base: '', header: 'h', body: 'b', footer: 'f' },
		'unmatched compound variant applies nothing'
	);

	t.end();
});

t.test('compoundSlots accepts group names mixed with slot names', (t) => {
	const card = sv({
		slots: {
			header: 'h',
			body: 'b',
			footer: 'f'
		},
		groups: {
			content: ['header', 'body']
		},
		variants: {
			size: { lg: '' }
		},
		compoundSlots: [
			{
				slots: ['content', 'footer'],
				size: 'lg',
				class: 'px-6'
			},
			{
				slots: ['content', 'header'],
				size: 'lg',
				class: 'gap-2'
			}
		]
	});

	t.strictSame(
		card({ size: 'lg' }),
		{
			base: '',
			header: 'h px-6 gap-2',
			body: 'b px-6 gap-2',
			footer: 'f px-6'
		},
		'a slot reached twice through one entry gets the class once'
	);

	t.end();
});

t.test('runtime class prop accepts a group name', (t) => {
	const card = sv({
		slots: {
			header: 'h',
			body: 'b',
			footer: 'f'
		},
		groups: {
			content: ['header', 'body']
		}
	});

	t.strictSame(
		card({ class: { content: 'px-2' } }),
		{ base: '', header: 'h px-2', body: 'b px-2', footer: 'f' },
		'group class prop reaches both slots'
	);

	t.strictSame(
		card({ className: { content: 'px-2', header: 'px-4' } }),
		{ base: '', header: 'h px-2 px-4', body: 'b px-2', footer: 'f' },
		'the group key written first lands first'
	);

	t.strictSame(
		card({ className: { header: 'px-4', content: 'px-2' } }),
		{ base: '', header: 'h px-4 px-2', body: 'b px-2', footer: 'f' },
		'the slot key written first lands first'
	);

	t.end();
});

t.test('group class prop works without slots', (t) => {
	const button = sv('btn', {
		groups: {
			everything: ['base']
		}
	});

	t.equal(
		button({ class: { everything: 'px-2' } }),
		'btn px-2',
		'group reaching base merges into the string result'
	);

	t.equal(
		button({ class: { everything: 'px-2', base: 'px-4' } }),
		'btn px-2 px-4',
		'the group key written first lands first'
	);

	t.equal(
		button({ class: { base: 'px-4', everything: 'px-2' } }),
		'btn px-4 px-2',
		'the base key written first lands first'
	);

	t.end();
});

t.test('groups without slots name targets in variant values', (t) => {
	const button = sv('btn', {
		groups: {
			everything: ['base']
		},
		variants: {
			size: {
				sm: {
					everything: 'text-sm'
				},
				lg: 'text-lg'
			}
		}
	});

	const result: string = button({ size: 'sm' });

	t.equal(result, 'btn text-sm', 'group value applies');
	t.equal(button({ size: 'lg' }), 'btn text-lg', 'plain value applies');

	t.end();
});

t.test('empty slots keep a base-keyed variant a value', (t) => {
	const button = sv('btn', {
		slots: {},
		variants: {
			kind: {
				base: 'kind-base'
			}
		}
	});

	type KindProp = VariantValue<typeof button, 'kind'>;

	const kind: KindProp = 'base';

	t.equal(kind, 'base', 'the prop takes the base value');

	t.end();
});

t.test('multiSlots accepts a group name', (t) => {
	const card = sv({
		slots: {
			header: 'h',
			body: 'b',
			footer: 'f'
		},
		groups: {
			content: ['header', 'body']
		},
		multiSlots: ['content'],
		variants: {
			size: { lg: { content: 'text-lg' } }
		}
	});

	const { header, body, footer } = card();

	t.equal(typeof footer, 'string', 'slot outside the group stays a string');
	t.equal(header({ size: 'lg' }), 'h text-lg', 'group member is a function');
	t.equal(
		body({ size: 'lg' }),
		'b text-lg',
		'every group member is a function'
	);

	t.end();
});

t.test('multiSlots group function merges an outer group class', (t) => {
	const card = sv({
		slots: {
			header: 'h',
			body: 'b'
		},
		groups: {
			content: ['header', 'body']
		},
		multiSlots: ['content']
	});

	const { header } = card({ class: { content: 'px-2' } });

	t.equal(
		header({ class: 'px-4' }),
		'h px-2 px-4',
		'inner class merges after the outer group class'
	);

	t.end();
});

t.test(
	'multiSlots slot function applies its class after every outer one',
	(t) => {
		const card = sv({
			slots: {
				header: 'h',
				body: 'b'
			},
			groups: {
				content: ['header', 'body']
			},
			multiSlots: ['header']
		});

		const slotFirst = card({ class: { header: 'px-1', content: 'px-2' } });

		t.equal(
			slotFirst.header(),
			'h px-1 px-2',
			'outer classes apply in the order they are written'
		);
		t.equal(
			slotFirst.header({ class: 'px-4' }),
			'h px-1 px-2 px-4',
			'inner class follows an outer group class written after the slot'
		);

		const groupFirst = card({ class: { content: 'px-2', header: 'px-1' } });

		t.equal(
			groupFirst.header({ class: 'px-4' }),
			'h px-2 px-1 px-4',
			'inner class follows an outer slot class written after the group'
		);

		const slotsOnly = card({ class: { header: 'px-1', body: 'py-1' } });

		t.equal(
			slotsOnly.header({ class: 'px-4' }),
			'h px-1 px-4',
			'inner class follows an outer class naming slots only'
		);

		t.end();
	}
);

t.test('introspection exposes groups', (t) => {
	const card = sv({
		slots: {
			header: 'h',
			body: 'b'
		},
		groups: {
			content: ['header', 'body']
		},
		introspection: true
	});

	t.strictSame(card.groups, { content: ['header', 'body'] }, 'groups config');
	t.strictSame(card.groupKeys, ['content'], 'group names');
	t.strictSame(
		card.slotKeys,
		['base', 'header', 'body'],
		'groups are not slots'
	);

	t.end();
});

t.test('group named after a slot throws', (t) => {
	t.throws(
		() =>
			sv({
				slots: { header: 'h' },
				groups: { header: ['header'] }
			}),
		{ message: 'Group "header" cannot have the same name as a slot' }
	);

	t.throws(
		() =>
			sv({
				slots: { header: 'h' },
				groups: { base: ['header'] }
			}),
		{ message: 'Group "base" cannot have the same name as a slot' }
	);

	t.end();
});

t.test('empty group throws', (t) => {
	t.throws(
		() =>
			sv({
				slots: { header: 'h' },
				groups: { content: [] }
			}),
		{ message: 'Group "content" must define at least one slot' }
	);

	t.end();
});

t.test('group with unknown slot throws', (t) => {
	t.throws(
		() =>
			sv({
				slots: { header: 'h' },
				// @ts-expect-error unknown slot name not assignable
				groups: { content: ['header', 'footer'] }
			}),
		{ message: 'Group "content" references unknown slot "footer"' }
	);

	t.end();
});

t.test('group cannot reference another group', (t) => {
	t.throws(
		() =>
			sv({
				slots: { header: 'h', body: 'b', footer: 'f' },
				groups: {
					content: ['header', 'body'],
					// @ts-expect-error group name is not a slot name
					all: ['content', 'footer']
				}
			}),
		{ message: 'Group "all" references unknown slot "content"' }
	);

	t.end();
});

t.test('compoundSlots with unknown target throws', (t) => {
	t.throws(
		() =>
			sv({
				slots: { header: 'h' },
				groups: { content: ['header'] },
				// @ts-expect-error unknown target name not assignable
				compoundSlots: [{ slots: ['missing'], class: 'px-4' }]
			}),
		{ message: 'Compound slot references unknown slot "missing"' }
	);

	t.end();
});

t.test('multiSlots with unknown target throws', (t) => {
	t.throws(
		() =>
			sv({
				slots: { header: 'h' },
				groups: { content: ['header'] },
				// @ts-expect-error unknown target name not assignable
				multiSlots: ['missing']
			}),
		{ message: 'Multi slot references unknown slot "missing"' }
	);

	t.end();
});

// --- groups type tests ---

const _groupsFn = sv({
	slots: {
		header: 'h',
		body: 'b',
		footer: 'f'
	},
	groups: {
		content: ['header', 'body']
	},
	multiSlots: ['content'],
	variants: {
		size: { sm: { content: 'text-sm' }, lg: { content: 'text-lg' } }
	},
	introspection: true
});

type GroupsReturn = ReturnType<typeof _groupsFn>;

// A group name never becomes a key of the result
type AssertNoGroupKey = 'content' extends keyof GroupsReturn ? true : false;
const _assertNoGroupKey: AssertNoGroupKey = false;

// Every slot of a multiSlots group becomes a function
type AssertGroupHeaderIsFn = GroupsReturn['header'] extends (
	...args: never[]
) => unknown
	? true
	: false;
const _assertGroupHeaderIsFn: AssertGroupHeaderIsFn = true;

type AssertGroupBodyIsFn = GroupsReturn['body'] extends (
	...args: never[]
) => unknown
	? true
	: false;
const _assertGroupBodyIsFn: AssertGroupBodyIsFn = true;

type AssertGroupFooterIsString = GroupsReturn['footer'] extends string
	? true
	: false;
const _assertGroupFooterIsString: AssertGroupFooterIsString = true;

// A variant whose values are keyed only by group names stays a value union
type GroupSizeProp = VariantValue<typeof _groupsFn, 'size'>;
type AssertGroupSizeProp = GroupSizeProp extends 'sm' | 'lg' ? true : false;
const _assertGroupSizeProp: AssertGroupSizeProp = true;

// A group object under a `true` key is a boolean variant
const _groupShorthandFn = sv({
	slots: { header: 'h', body: 'b' },
	groups: { content: ['header', 'body'] },
	variants: {
		bordered: { true: { content: 'border' } }
	}
});

type AssertGroupShorthand =
	VariantValue<typeof _groupShorthandFn, 'bordered'> extends boolean
		? true
		: false;
const _assertGroupShorthand: AssertGroupShorthand = true;

// The group name is accepted by the class prop
_groupsFn({ class: { content: 'px-2' } });

void _groupsFn;
void _assertNoGroupKey;
void _assertGroupHeaderIsFn;
void _assertGroupBodyIsFn;
void _assertGroupFooterIsString;
void _assertGroupSizeProp;
void _groupShorthandFn;
void _assertGroupShorthand;