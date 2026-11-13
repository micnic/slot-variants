import t from 'tap';
import { sv } from '../../src/index.ts';

// sv() - compound slots

t.test('compound slot applies class to multiple slots unconditionally', (t) => {
	const card = sv('relative', {
		slots: {
			header: 'font-bold',
			body: 'text-base',
			footer: 'text-sm'
		},
		compoundSlots: [
			{
				slots: ['header', 'footer'],
				class: 'px-4 py-2'
			}
		]
	});

	t.same(card(), {
		base: 'relative',
		header: 'font-bold px-4 py-2',
		body: 'text-base',
		footer: 'text-sm px-4 py-2'
	});

	t.end();
});

t.test('compound slot applies class to base and named slots', (t) => {
	const card = sv('relative', {
		slots: {
			header: 'font-bold',
			body: 'text-base'
		},
		compoundSlots: [
			{
				slots: ['base', 'header', 'body'],
				class: 'border border-gray-200'
			}
		]
	});

	t.same(card(), {
		base: 'relative border border-gray-200',
		header: 'font-bold border border-gray-200',
		body: 'text-base border border-gray-200'
	});

	t.end();
});

t.test('compound slot conditional on variant match', (t) => {
	const card = sv('rounded-lg', {
		slots: {
			header: 'font-bold',
			body: 'text-base'
		},
		variants: {
			variant: {
				outlined: 'border',
				filled: 'bg-gray-100'
			}
		},
		compoundSlots: [
			{
				variant: 'outlined',
				slots: ['base', 'header'],
				class: 'border-gray-300'
			}
		]
	});

	t.same(card({ variant: 'outlined' }), {
		base: 'rounded-lg border border-gray-300',
		header: 'font-bold border-gray-300',
		body: 'text-base'
	});
	t.same(card({ variant: 'filled' }), {
		base: 'rounded-lg bg-gray-100',
		header: 'font-bold',
		body: 'text-base'
	});

	t.end();
});

t.test('compound slot with className instead of class', (t) => {
	const nav = sv('flex', {
		slots: {
			link: 'text-sm',
			icon: 'w-4 h-4'
		},
		compoundSlots: [
			{
				slots: ['link', 'icon'],
				className: 'text-blue-500 hover:text-blue-700'
			}
		]
	});

	t.same(nav(), {
		base: 'flex',
		link: 'text-sm text-blue-500 hover:text-blue-700',
		icon: 'w-4 h-4 text-blue-500 hover:text-blue-700'
	});

	t.end();
});

t.test('compound slot with array condition matching', (t) => {
	const table = sv('w-full', {
		slots: {
			cell: 'p-2',
			header: 'font-semibold'
		},
		variants: {
			size: {
				sm: 'text-sm',
				md: 'text-base',
				lg: 'text-lg'
			}
		},
		compoundSlots: [
			{
				size: ['sm', 'md'],
				slots: ['cell', 'header'],
				class: 'px-3'
			}
		]
	});

	t.same(table({ size: 'sm' }), {
		base: 'w-full text-sm',
		cell: 'p-2 px-3',
		header: 'font-semibold px-3'
	});
	t.same(table({ size: 'md' }), {
		base: 'w-full text-base',
		cell: 'p-2 px-3',
		header: 'font-semibold px-3'
	});
	t.same(table({ size: 'lg' }), {
		base: 'w-full text-lg',
		cell: 'p-2',
		header: 'font-semibold'
	});

	t.end();
});

t.test('multiple compound slots', (t) => {
	const dialog = sv('fixed inset-0', {
		slots: {
			overlay: 'bg-black/50',
			content: 'bg-white rounded-lg',
			title: 'text-lg font-bold',
			actions: 'flex gap-2'
		},
		variants: {
			size: {
				sm: 'max-w-sm',
				lg: 'max-w-lg'
			}
		},
		compoundSlots: [
			{
				slots: ['content', 'title', 'actions'],
				class: 'px-6'
			},
			{
				size: 'sm',
				slots: ['title', 'actions'],
				class: 'text-sm'
			}
		]
	});

	t.same(dialog({ size: 'sm' }), {
		base: 'fixed inset-0 max-w-sm',
		overlay: 'bg-black/50',
		content: 'bg-white rounded-lg px-6',
		title: 'text-lg font-bold px-6 text-sm',
		actions: 'flex gap-2 px-6 text-sm'
	});
	t.same(dialog({ size: 'lg' }), {
		base: 'fixed inset-0 max-w-lg',
		overlay: 'bg-black/50',
		content: 'bg-white rounded-lg px-6',
		title: 'text-lg font-bold px-6',
		actions: 'flex gap-2 px-6'
	});

	t.end();
});

t.test('compound slot with boolean shorthand variant condition', (t) => {
	const card = sv('border rounded-lg', {
		slots: {
			header: 'font-bold',
			body: 'py-4'
		},
		variants: {
			highlighted: 'ring-2'
		},
		compoundSlots: [
			{
				highlighted: true,
				slots: ['header', 'body'],
				class: 'bg-yellow-50'
			}
		]
	});

	t.same(card({ highlighted: true }), {
		base: 'border rounded-lg ring-2',
		header: 'font-bold bg-yellow-50',
		body: 'py-4 bg-yellow-50'
	});
	t.same(card({ highlighted: false }), {
		base: 'border rounded-lg',
		header: 'font-bold',
		body: 'py-4'
	});

	t.end();
});