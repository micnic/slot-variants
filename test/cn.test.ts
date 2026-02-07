import t from 'tap';
import { cn } from '../src/index.ts';

t.test('string argument', (t) => {
	t.equal(cn('flex'), 'flex', 'single string');
	t.equal(
		cn('flex items-center justify-between p-4 text-sm'),
		'flex items-center justify-between p-4 text-sm',
		'single string with multiple classes'
	);
	t.equal(cn(''), '', 'empty string');

	t.end();
});

t.test('array argument', (t) => {
	t.equal(
		cn(['flex', 'items-center', 'gap-2']),
		'flex items-center gap-2',
		'flat array of strings'
	);
	t.equal(
		cn(['flex', ['items-center', 'gap-2']]),
		'flex items-center gap-2',
		'nested array'
	);
	t.equal(
		cn(['flex', ['items-center', ['gap-2', 'p-4']]]),
		'flex items-center gap-2 p-4',
		'deeply nested array'
	);
	t.equal(cn([]), '', 'empty array');

	t.end();
});

t.test('object argument', (t) => {
	t.equal(
		cn({ 'bg-red-500': true, 'text-white': true, 'rounded-lg': true }),
		'bg-red-500 text-white rounded-lg',
		'all truthy values'
	);
	t.equal(
		cn({ 'bg-red-500': false, 'text-white': false }),
		'',
		'all falsy values'
	);
	t.equal(
		cn({
			'bg-red-500': true,
			'text-white': false,
			'rounded-lg': true,
			'shadow-md': false,
			'p-4': true
		}),
		'bg-red-500 rounded-lg p-4',
		'mixed truthy and falsy values'
	);
	t.equal(
		cn({ 'text-sm': null, 'font-bold': undefined }),
		'',
		'null and undefined values'
	);
	t.equal(cn({ 'opacity-50': 0 }), '', 'zero is falsy');
	t.equal(cn({ 'opacity-50': 1 }), 'opacity-50', 'non-zero number is truthy');
	t.equal(cn({ 'sr-only': '' }), '', 'empty string is falsy');
	t.equal(cn({ 'sr-only': 'yes' }), 'sr-only', 'non-empty string is truthy');
	t.equal(cn({}), '', 'empty object');

	t.end();
});

t.test('boolean argument', (t) => {
	t.equal(cn(true), '', 'true is ignored');
	t.equal(cn(false), '', 'false is ignored');

	t.end();
});

t.test('number argument', (t) => {
	t.equal(cn(0), '', 'zero is ignored');
	t.equal(cn(42), '', 'positive number is ignored');
	t.equal(cn(-1), '', 'negative number is ignored');

	t.end();
});

t.test('bigint argument', (t) => {
	t.equal(cn(BigInt(0)), '', 'zero bigint is ignored');
	t.equal(cn(BigInt(99)), '', 'positive bigint is ignored');

	t.end();
});

t.test('null argument', (t) => {
	t.equal(cn(null), '', 'null is ignored');

	t.end();
});

t.test('undefined argument', (t) => {
	t.equal(cn(undefined), '', 'undefined is ignored');

	t.end();
});

t.test('combination of all argument types', (t) => {
	t.equal(
		cn(
			'flex',
			['items-center', 'gap-2'],
			{ 'bg-white': true, 'bg-black': false },
			true,
			42,
			BigInt(7),
			null,
			undefined,
			false
		),
		'flex bg-white items-center gap-2',
		'all argument types together'
	);

	t.end();
});

t.test('string and array combination', (t) => {
	t.equal(
		cn('flex', ['items-center', 'gap-2'], 'text-sm'),
		'flex text-sm items-center gap-2',
		'strings around array'
	);

	t.end();
});

t.test('string and object combination', (t) => {
	t.equal(
		cn(
			'flex items-center',
			{ 'bg-red-500': true, 'opacity-50': false },
			'p-4'
		),
		'flex items-center bg-red-500 p-4',
		'strings around object'
	);

	t.end();
});

t.test('array and object combination', (t) => {
	t.equal(
		cn(['flex', 'gap-2'], { 'text-white': true, 'font-bold': false }),
		'text-white flex gap-2',
		'array and object'
	);

	t.end();
});

t.test('nested array with objects', (t) => {
	t.equal(
		cn(['flex', { 'items-center': true, 'justify-end': false }, 'gap-2']),
		'flex items-center gap-2',
		'object inside array'
	);
	t.equal(
		cn(['flex', ['items-center', { 'bg-white': true }], 'p-4']),
		'flex p-4 items-center bg-white',
		'object inside deeply nested array'
	);

	t.end();
});

t.test('falsy values between valid classes', (t) => {
	t.equal(
		cn(
			'flex',
			null,
			'items-center',
			undefined,
			'gap-2',
			false,
			'p-4',
			0,
			'text-sm'
		),
		'flex items-center gap-2 p-4 text-sm',
		'falsy values interspersed with strings'
	);

	t.end();
});

t.test('multiple strings as separate arguments', (t) => {
	t.equal(
		cn('flex', 'items-center', 'gap-2', 'rounded-lg', 'shadow-md'),
		'flex items-center gap-2 rounded-lg shadow-md',
		'five separate string arguments'
	);

	t.end();
});

t.test('multiple objects as separate arguments', (t) => {
	t.equal(
		cn(
			{ flex: true, hidden: false },
			{ 'items-center': true },
			{ 'bg-red-500': false, 'bg-blue-500': true }
		),
		'flex items-center bg-blue-500',
		'three separate objects'
	);

	t.end();
});

t.test('multiple arrays as separate arguments', (t) => {
	t.equal(
		cn(['flex', 'gap-2'], ['items-center'], ['rounded-lg', 'shadow-md']),
		'flex gap-2 items-center rounded-lg shadow-md',
		'three separate arrays'
	);

	t.end();
});

t.test('no arguments', (t) => {
	t.equal(cn(), '', 'returns empty string');

	t.end();
});