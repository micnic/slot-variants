import t from 'tap';
import { sv } from '../../src/index.ts';

// sv() - config only (no base argument)

t.test('sv(config) with base in config', (t) => {
	const button = sv({
		base: 'flex items-center',
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
		'applies config base and variant'
	);

	t.end();
});

t.test('sv(config) without base in config', (t) => {
	const button = sv({
		variants: {
			size: {
				sm: 'text-sm',
				lg: 'text-lg'
			}
		}
	});

	t.equal(button({ size: 'sm' }), 'text-sm', 'applies variant only');
	t.equal(button(), '', 'returns empty string with no props');

	t.end();
});

t.test('sv(config) with slots', (t) => {
	const button = sv({
		base: 'flex',
		slots: {
			base: 'gap-2',
			icon: 'size-4'
		},
		variants: {
			size: {
				sm: { base: 'text-sm', icon: 'size-3' }
			}
		}
	});

	const result = button({ size: 'sm' });

	t.equal(
		result.base,
		'flex gap-2 text-sm',
		'merges config base with slot base'
	);
	t.equal(result.icon, 'size-4 size-3', 'slot variant applied');

	t.end();
});

t.test('sv(config) with base and class prop', (t) => {
	const button = sv({
		base: 'flex',
		variants: {
			size: {
				sm: 'text-sm'
			}
		}
	});

	t.equal(
		button({ size: 'sm', class: 'extra' }),
		'flex text-sm extra',
		'config base + variant + class prop'
	);

	t.equal(
		button({ size: 'sm', class: { base: 'extra' } }),
		'flex text-sm extra',
		'config base + variant + base-keyed class prop on no-slots component'
	);

	t.end();
});