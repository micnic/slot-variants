import t from 'tap';
import { sv, type SlotClassProps } from '../../src/index.ts';

// sv() - class/className override

t.test('class prop appends to base without slots', (t) => {
	const button = sv('rounded-lg font-medium', {
		variants: {
			size: {
				sm: 'text-sm',
				lg: 'text-lg'
			}
		}
	});

	t.equal(
		button({ size: 'sm', class: 'mt-4 mx-auto' }),
		'rounded-lg font-medium text-sm mt-4 mx-auto',
		'class appended after variant classes'
	);

	t.end();
});

t.test('className prop appends to base without slots', (t) => {
	const button = sv('rounded-lg font-medium', {
		variants: {
			size: {
				sm: 'text-sm',
				lg: 'text-lg'
			}
		}
	});

	t.equal(
		button({ size: 'lg', className: 'mt-4 mx-auto' }),
		'rounded-lg font-medium text-lg mt-4 mx-auto',
		'className appended after variant classes'
	);

	t.end();
});

t.test('class prop with no variants', (t) => {
	const box = sv('flex items-center', { variants: {} });

	t.equal(
		box({ class: 'gap-4 p-2' }),
		'flex items-center gap-4 p-2',
		'class appended to base'
	);

	t.end();
});

t.test('class prop as array in non-slot mode', (t) => {
	const button = sv('rounded-lg', {
		variants: {
			size: {
				sm: 'text-sm',
				lg: 'text-lg'
			}
		}
	});

	t.equal(
		button({ size: 'sm', class: ['mt-4', 'mx-auto'] }),
		'rounded-lg text-sm mt-4 mx-auto',
		'class array appended'
	);

	t.end();
});

t.test('class prop as ClassRecord in non-slot mode', (t) => {
	const button = sv('rounded-lg', {
		variants: {
			size: {
				sm: 'text-sm',
				lg: 'text-lg'
			}
		}
	});

	t.equal(
		button({
			size: 'sm',
			class: { 'mt-4': true, 'mx-auto': true, hidden: false }
		}),
		'rounded-lg text-sm mt-4 mx-auto',
		'class record appended with truthy keys'
	);

	t.end();
});

t.test('class prop as string appends to base slot with slots', (t) => {
	const card = sv('border rounded-lg', {
		slots: {
			header: 'font-bold',
			body: 'py-4'
		}
	});

	t.same(card({ class: 'shadow-xl' }), {
		base: 'border rounded-lg shadow-xl',
		header: 'font-bold',
		body: 'py-4'
	});

	t.end();
});

t.test('class prop as slot object targets specific slots', (t) => {
	const card = sv('border rounded-lg', {
		slots: {
			header: 'font-bold',
			body: 'py-4'
		}
	});

	t.same(
		card({
			class: {
				base: 'shadow-xl',
				header: 'text-blue-700',
				body: 'min-h-24'
			}
		}),
		{
			base: 'border rounded-lg shadow-xl',
			header: 'font-bold text-blue-700',
			body: 'py-4 min-h-24'
		}
	);

	t.end();
});

t.test('class wins when both class and className are passed', (t) => {
	const button = sv('btn', { variants: { size: { sm: 'text-sm' } } });
	const card = sv({
		slots: { header: 'font-bold' },
		multiSlots: ['header']
	});

	t.equal(
		// @ts-expect-error passing both class and className is a type error
		button({ size: 'sm', class: 'mt-2', className: 'mb-2' }),
		'btn text-sm mt-2',
		'variant function uses class and ignores className'
	);
	t.equal(
		// @ts-expect-error the same holds for a slot function
		card().header({ class: 'mt-2', className: 'mb-2' }),
		'font-bold mt-2',
		'slot function uses class and ignores className'
	);

	t.end();
});

t.test('a class object naming a slot is a slot object', (t) => {
	const card = sv('border', {
		slots: { header: 'font-bold', body: 'py-4' },
		groups: { content: ['header', 'body'] }
	});

	t.same(
		card({ class: { active: true, 'p-2': false } }),
		{ base: 'border active', header: 'font-bold', body: 'py-4' },
		'an object naming no slot is a class record'
	);
	t.same(
		card({ class: ['mt-2', { header: true }] }).base,
		'border mt-2 header',
		'a record nested in a list is a class record'
	);
	t.same(
		// @ts-expect-error a key beside a slot has to name a slot or group
		card({ class: { header: 'text-blue-700', bodyy: 'min-h-24' } }),
		{ base: 'border header bodyy', header: 'font-bold', body: 'py-4' },
		'a mistyped slot is a type error'
	);
	t.same(
		// @ts-expect-error the same holds beside a group
		card({ className: { content: 'px-2', active: true } }).base,
		'border content active',
		'a class name beside a group is a type error'
	);
	t.equal(
		// @ts-expect-error with no slots, `base` still names one
		sv('btn', { variants: {} })({ class: { base: true, active: true } }),
		'btn base active',
		'a class name beside `base` is a type error'
	);

	t.end();
});

t.test('className prop as slot object targets specific slots', (t) => {
	const card = sv('border rounded-lg', {
		slots: {
			header: 'font-bold',
			body: 'py-4'
		}
	});

	t.same(
		card({
			className: {
				base: 'shadow-xl',
				body: 'bg-gray-50'
			}
		}),
		{
			base: 'border rounded-lg shadow-xl',
			header: 'font-bold',
			body: 'py-4 bg-gray-50'
		}
	);

	t.end();
});

t.test('class prop with variants and slots combined', (t) => {
	const card = sv('border rounded-lg', {
		slots: {
			header: 'font-bold',
			body: 'py-4'
		},
		variants: {
			size: {
				sm: { base: 'p-2', header: 'text-sm' },
				lg: { base: 'p-6', header: 'text-xl' }
			}
		}
	});

	t.same(
		card({
			size: 'sm',
			class: { base: 'mx-auto', header: 'underline' }
		}),
		{
			base: 'border rounded-lg p-2 mx-auto',
			header: 'font-bold text-sm underline',
			body: 'py-4'
		}
	);

	t.end();
});

t.test('class prop appended after compound variants', (t) => {
	const button = sv('rounded-lg', {
		variants: {
			size: {
				sm: 'text-sm',
				lg: 'text-lg'
			},
			intent: {
				primary: 'bg-blue-500',
				danger: 'bg-red-500'
			}
		},
		compoundVariants: [
			{
				size: 'sm',
				intent: 'primary',
				class: 'shadow-sm'
			}
		]
	});

	t.equal(
		button({ size: 'sm', intent: 'primary', class: 'mt-8' }),
		'rounded-lg text-sm bg-blue-500 shadow-sm mt-8',
		'class after compound variant classes'
	);

	t.end();
});

// =============================================================================
// SlotClassProps type
// =============================================================================

// Without slots — resolves to { base?: ClassValue }
const _scpNoSlotsFn = sv('btn', {
	variants: {
		size: { sm: 'text-sm', lg: 'text-lg' }
	}
});

type SCPNoSlots = SlotClassProps<typeof _scpNoSlotsFn>;
type AssertSCPNoSlotsHasBase = SCPNoSlots extends { base?: unknown }
	? true
	: false;
type AssertSCPNoSlotsOnlyBase = keyof SCPNoSlots extends 'base' ? true : false;
const _assertSCPNoSlotsHasBase: AssertSCPNoSlotsHasBase = true;
const _assertSCPNoSlotsOnlyBase: AssertSCPNoSlotsOnlyBase = true;

// With slots — resolves to Partial<Record<'base' | slotNames, ClassValue>>
const _scpSlotsFn = sv('border', {
	slots: {
		header: 'font-bold',
		body: 'py-4'
	},
	variants: {
		size: { sm: 'text-sm', lg: 'text-lg' }
	}
});

type SCPSlots = SlotClassProps<typeof _scpSlotsFn>;
type AssertSCPSlotsHasBase = SCPSlots extends { base?: unknown } ? true : false;
type AssertSCPSlotsHasHeader = SCPSlots extends { header?: unknown }
	? true
	: false;
type AssertSCPSlotsHasBody = SCPSlots extends { body?: unknown } ? true : false;
const _assertSCPSlotsHasBase: AssertSCPSlotsHasBase = true;
const _assertSCPSlotsHasHeader: AssertSCPSlotsHasHeader = true;
const _assertSCPSlotsHasBody: AssertSCPSlotsHasBody = true;

// All keys are optional
type AssertSCPAllOptional = Partial<SCPSlots> extends SCPSlots ? true : false;
const _assertSCPAllOptional: AssertSCPAllOptional = true;

// No extra keys beyond the slot names
type AssertSCPNoExtraKeys = keyof SCPSlots extends 'base' | 'header' | 'body'
	? true
	: false;
const _assertSCPNoExtraKeys: AssertSCPNoExtraKeys = true;

// Groups are keys too, own and inherited, so the object can be passed on to
// the component's `class` prop.
const _scpGroupsFn = sv({
	slots: { header: 'font-bold', body: 'py-4' },
	groups: { content: ['header', 'body'] },
	variants: {}
});
const _scpChildFn = sv({
	extend: _scpGroupsFn,
	groups: { top: ['base', 'header'] },
	variants: {}
});
const _scpSlotlessFn = sv({ groups: { all: ['base'] }, variants: {} });

type AssertSCPGroups = keyof SlotClassProps<typeof _scpGroupsFn> extends
	| 'base'
	| 'header'
	| 'body'
	| 'content'
	? 'content' extends keyof SlotClassProps<typeof _scpGroupsFn>
		? true
		: false
	: false;
type AssertSCPInheritedGroups = 'content' | 'top' extends keyof SlotClassProps<
	typeof _scpChildFn
>
	? true
	: false;
type AssertSCPSlotlessGroups = keyof SlotClassProps<
	typeof _scpSlotlessFn
> extends 'base' | 'all'
	? 'all' extends keyof SlotClassProps<typeof _scpSlotlessFn>
		? true
		: false
	: false;
const _assertSCPGroups: AssertSCPGroups = true;
const _assertSCPInheritedGroups: AssertSCPInheritedGroups = true;
const _assertSCPSlotlessGroups: AssertSCPSlotlessGroups = true;

const _scpClassNames: SlotClassProps<typeof _scpChildFn> = { top: 'mt-1' };

t.test('a SlotClassProps object with a group reaches its slots', (t) => {
	t.same(_scpChildFn({ class: _scpClassNames }), {
		base: 'mt-1',
		header: 'font-bold mt-1',
		body: 'py-4'
	});

	t.end();
});

void _scpGroupsFn;
void _scpSlotlessFn;
void _assertSCPGroups;
void _assertSCPInheritedGroups;
void _assertSCPSlotlessGroups;
void _scpNoSlotsFn;
void _assertSCPNoSlotsHasBase;
void _assertSCPNoSlotsOnlyBase;
void _scpSlotsFn;
void _assertSCPSlotsHasBase;
void _assertSCPSlotsHasHeader;
void _assertSCPSlotsHasBody;
void _assertSCPAllOptional;
void _assertSCPNoExtraKeys;