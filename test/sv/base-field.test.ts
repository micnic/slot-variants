import t from 'tap';
import { sv } from '../../src/index.ts';

// sv() - base config field

t.test('base config field merges into final class value', (t) => {
	const button = sv('flex', {
		base: 'items-center',
		variants: {}
	});

	t.equal(button(), 'flex items-center', 'merges base and config base');

	t.end();
});

t.test('base config field with slots', (t) => {
	const button = sv('flex', {
		base: 'items-center',
		slots: {
			base: 'gap-2',
			icon: 'size-4'
		}
	});

	const result = button();

	t.equal(
		result.base,
		'flex items-center gap-2',
		'merges base, config base, and slot base'
	);
	t.equal(result.icon, 'size-4', 'other slots unaffected');

	t.end();
});

t.test('base config field with variants', (t) => {
	const button = sv('flex', {
		base: 'items-center',
		variants: {
			size: {
				sm: 'text-sm',
				lg: 'text-lg'
			}
		}
	});

	t.equal(
		button({ size: 'sm' }),
		'flex items-center text-sm',
		'merges base, config base, and variant'
	);

	t.end();
});

t.test('base config field with slots and variants', (t) => {
	const button = sv('flex', {
		base: 'items-center',
		slots: {
			base: 'gap-2',
			icon: 'size-4'
		},
		variants: {
			size: {
				sm: { base: 'text-sm', icon: 'size-3' },
				lg: { base: 'text-lg', icon: 'size-5' }
			}
		}
	});

	const result = button({ size: 'sm' });

	t.equal(
		result.base,
		'flex items-center gap-2 text-sm',
		'merges all base sources with variant'
	);
	t.equal(result.icon, 'size-4 size-3', 'slot variant applied correctly');

	t.end();
});

t.test('base config field undefined', (t) => {
	const button = sv('flex', {
		base: undefined,
		variants: {
			size: {
				sm: 'text-sm'
			}
		}
	});

	t.equal(
		button({ size: 'sm' }),
		'flex text-sm',
		'undefined base config field is ignored'
	);

	t.end();
});