import t from 'tap';
import { sv, type VariantProps, type VariantValue } from '../../src/index.ts';

// sv() - slots

// --- slot type tests ---

// return type should be a record with base + slot keys
const _slotFn = sv('border rounded-lg', {
	slots: {
		header: 'px-4 py-2 font-bold',
		body: 'px-4 py-4',
		footer: 'px-4 py-2 border-t'
	}
});

type SlotReturn = ReturnType<typeof _slotFn>;

type AssertSlotReturn = SlotReturn extends {
	base: string;
	header: string;
	body: string;
	footer: string;
}
	? true
	: false;
const _assertSlotReturn: AssertSlotReturn = true;

// with slots + variants, VariantProps still works the same
const _slotVariantFn = sv('border rounded-lg', {
	slots: {
		header: 'font-bold',
		body: 'py-4'
	},
	variants: {
		size: {
			sm: { base: 'p-2', header: 'text-sm' },
			lg: { base: 'p-6', header: 'text-lg' }
		}
	}
});

type SlotVariantProps = VariantProps<typeof _slotVariantFn>;

type AssertSlotVariantProps = SlotVariantProps extends {
	size?: 'sm' | 'lg' | null | undefined;
}
	? true
	: false;
const _assertSlotVariantProps: AssertSlotVariantProps = true;

// boolean variant targeting slots — slot object under a `true` key
const _slotBoolFn = sv('border', {
	slots: {
		header: 'font-bold',
		body: 'py-4'
	},
	variants: {
		highlighted: {
			true: {
				base: 'ring-2 ring-blue-500',
				header: 'bg-blue-100'
			}
		}
	}
});

type SlotBoolProps = VariantProps<typeof _slotBoolFn>;

type AssertSlotBool = SlotBoolProps extends {
	highlighted?: boolean | null | undefined;
}
	? true
	: false;
const _assertSlotBool: AssertSlotBool = true;

// values named like slots stay values
const _slotNamedValuesFn = sv({
	slots: { top: 't', bottom: 'b' },
	variants: { placement: { top: 'mt', bottom: 'mb' } }
});

type AssertSlotNamedValues =
	VariantValue<typeof _slotNamedValuesFn, 'placement'> extends
		| 'top'
		| 'bottom'
		? true
		: false;
const _assertSlotNamedValues: AssertSlotNamedValues = true;

void _slotNamedValuesFn;
void _assertSlotNamedValues;
void _slotFn;
void _assertSlotReturn;
void _slotVariantFn;
void _assertSlotVariantProps;
void _slotBoolFn;
void _assertSlotBool;

t.test('empty slots object returns string not record', (t) => {
	const box = sv('border rounded-lg', {
		slots: {}
	});

	const result = box();
	t.equal(typeof result, 'string', 'returns string for empty slots');
	t.equal(result, 'border rounded-lg', 'returns base class');

	t.end();
});

t.test('a base-only slots object is typed as a string result', (t) => {
	const empty: string = sv('border', { slots: {} })();
	const baseOnly: string = sv({ slots: { base: 'border' } })();
	const { base } = sv({ slots: { base: 'border' }, multiSlots: true })();

	t.equal(empty, 'border', 'empty slots');
	t.equal(baseOnly, 'border', 'only a base slot');
	t.equal(base(), 'border', 'a multi base slot is still a function');

	t.end();
});

t.test('slots return record with base + slot keys', (t) => {
	const card = sv('border rounded-lg shadow-md', {
		slots: {
			header: 'px-4 py-2 font-bold border-b',
			body: 'px-4 py-4',
			footer: 'px-4 py-2 border-t'
		}
	});

	const result = card();
	t.same(result, {
		base: 'border rounded-lg shadow-md',
		header: 'px-4 py-2 font-bold border-b',
		body: 'px-4 py-4',
		footer: 'px-4 py-2 border-t'
	});

	t.end();
});

t.test('slots with base slot in config', (t) => {
	const card = sv('border', {
		slots: {
			base: 'rounded-lg shadow-md',
			header: 'font-bold',
			body: 'py-4'
		}
	});

	const result = card();
	t.equal(
		result.base,
		'border rounded-lg shadow-md',
		'base merged from both'
	);
	t.equal(result.header, 'font-bold', 'header slot');
	t.equal(result.body, 'py-4', 'body slot');

	t.end();
});

t.test('slots with variant applied to specific slots', (t) => {
	const card = sv('border rounded-lg', {
		slots: {
			header: 'font-bold',
			body: 'py-4'
		},
		variants: {
			size: {
				sm: {
					base: 'p-2',
					header: 'text-sm',
					body: 'text-xs'
				},
				lg: {
					base: 'p-6',
					header: 'text-xl',
					body: 'text-base'
				}
			}
		}
	});

	const sm = card({ size: 'sm' });
	t.equal(sm.base, 'border rounded-lg p-2', 'sm base');
	t.equal(sm.header, 'font-bold text-sm', 'sm header');
	t.equal(sm.body, 'py-4 text-xs', 'sm body');

	const lg = card({ size: 'lg' });
	t.equal(lg.base, 'border rounded-lg p-6', 'lg base');
	t.equal(lg.header, 'font-bold text-xl', 'lg header');
	t.equal(lg.body, 'py-4 text-base', 'lg body');

	t.end();
});

t.test('slots with variant applied to only some slots', (t) => {
	const card = sv('border rounded-lg', {
		slots: {
			header: 'font-bold',
			body: 'py-4',
			footer: 'border-t'
		},
		variants: {
			size: {
				sm: { base: 'p-2', header: 'text-sm' },
				lg: { base: 'p-6', header: 'text-xl' }
			}
		}
	});

	const result = card({ size: 'sm' });
	t.equal(result.base, 'border rounded-lg p-2', 'base affected');
	t.equal(result.header, 'font-bold text-sm', 'header affected');
	t.equal(result.body, 'py-4', 'body unchanged');
	t.equal(result.footer, 'border-t', 'footer unchanged');

	t.end();
});

t.test('true-keyed slot object targets slots', (t) => {
	const card = sv('border rounded-lg', {
		slots: {
			header: 'font-bold',
			body: 'py-4'
		},
		variants: {
			highlighted: {
				true: {
					base: 'ring-2 ring-blue-500',
					header: 'bg-blue-100'
				}
			}
		}
	});

	const on = card({ highlighted: true });
	t.equal(
		on.base,
		'border rounded-lg ring-2 ring-blue-500',
		'highlighted base'
	);
	t.equal(on.header, 'font-bold bg-blue-100', 'highlighted header');
	t.equal(on.body, 'py-4', 'body unchanged');

	const off = card({ highlighted: false });
	t.equal(off.base, 'border rounded-lg', 'not highlighted base');
	t.equal(off.header, 'font-bold', 'not highlighted header');
	t.strictSame(
		card(),
		{ base: 'border rounded-lg', header: 'font-bold', body: 'py-4' },
		'unset applies nothing'
	);

	t.end();
});

t.test('variant values may share names with slots', (t) => {
	const tooltip = sv({
		slots: { top: 't', bottom: 'b' },
		variants: { placement: { top: 'mt', bottom: 'mb' } }
	});

	t.strictSame(
		tooltip({ placement: 'top' }),
		{ base: 'mt', top: 't', bottom: 'b' },
		'top is a value, its class lands on base'
	);
	t.throws(
		// @ts-expect-error - `placement` takes 'top' | 'bottom', not a boolean
		() => tooltip({ placement: true }),
		{ message: 'Invalid value "true" for variant "placement"' },
		'true is not a value'
	);

	t.end();
});

t.test('variant values may share names with groups', (t) => {
	const card = sv({
		slots: { header: 'h', body: 'b' },
		groups: { content: ['header', 'body'] },
		variants: { area: { content: 'c', header: 'x' } }
	});

	t.strictSame(
		card({ area: 'content' }),
		{ base: 'c', header: 'h', body: 'b' },
		'content is a value, its class lands on base'
	);

	t.end();
});

t.test('a base-keyed variant record names the value base', (t) => {
	const plain = sv({ variants: { tone: { base: 'x' } } });
	const slotted = sv({
		slots: { header: 'h' },
		variants: { tone: { base: 'x' } }
	});

	t.equal(plain({ tone: 'base' }), 'x', 'without slots');
	t.strictSame(
		slotted({ tone: 'base' }),
		{ base: 'x', header: 'h' },
		'with slots'
	);

	t.end();
});

t.test('adding a slot does not change an existing variant', (t) => {
	const before = sv({
		slots: { arrow: 'a' },
		variants: { placement: { top: 'mt', bottom: 'mb' } }
	});
	const after = sv({
		slots: { arrow: 'a', top: 't', bottom: 'b' },
		variants: { placement: { top: 'mt', bottom: 'mb' } }
	});

	t.equal(before({ placement: 'top' }).base, 'mt', 'before');
	t.equal(after({ placement: 'top' }).base, 'mt', 'after');

	t.end();
});

t.test('slot-named values work in defaults, presets and compounds', (t) => {
	const tooltip = sv({
		slots: { top: 't', bottom: 'b' },
		variants: {
			placement: { top: 'mt', bottom: 'mb' },
			size: { sm: 'text-sm', lg: 'text-lg' }
		},
		presets: { above: { placement: 'top', size: 'lg' } },
		compoundVariants: [{ placement: 'bottom', size: 'sm', class: 'tight' }],
		defaultVariants: { placement: 'bottom', size: 'sm' }
	});

	t.equal(tooltip().base, 'mb text-sm tight', 'defaults and compound');
	t.equal(tooltip({ preset: 'above' }).base, 'mt text-lg', 'preset');

	t.end();
});

t.test('true and false slot objects each apply their own slots', (t) => {
	const card = sv({
		slots: { header: 'h' },
		variants: {
			open: {
				true: { header: 'shown' },
				false: { base: 'closed', header: 'hidden' }
			}
		}
	});

	t.strictSame(card({ open: true }), { base: '', header: 'h shown' }, 'true');
	t.strictSame(
		card({ open: false }),
		{ base: 'closed', header: 'h hidden' },
		'false'
	);

	t.end();
});

t.test('slot-named values in introspection', (t) => {
	const tooltip = sv({
		slots: { top: 't', bottom: 'b' },
		variants: { placement: { top: 'mt', bottom: 'mb' } },
		introspection: true
	});

	t.strictSame(
		tooltip.getVariantValues('placement'),
		['top', 'bottom'],
		'values'
	);
	t.equal(tooltip.getMaxEntries(), 3, 'two values plus unset');

	t.end();
});

t.test('multi slot function overrides a true-keyed slot variant', (t) => {
	const card = sv({
		slots: { header: 'h' },
		multiSlots: ['header'],
		variants: { highlighted: { true: { header: 'hl' } } }
	});

	const result = card();

	t.equal(result.header(), 'h', 'inherits unset');
	t.equal(result.header({ highlighted: true }), 'h hl', 'override');

	t.end();
});

t.test(
	'slots with boolean true/false record variant with slot-object values',
	(t) => {
		const card = sv('border rounded-lg', {
			slots: {
				header: 'font-bold',
				body: 'py-4'
			},
			variants: {
				disabled: {
					true: { base: 'opacity-50', header: 'text-gray-400' },
					false: { base: 'opacity-100', header: 'text-black' }
				}
			}
		});

		const on = card({ disabled: true });
		t.equal(on.base, 'border rounded-lg opacity-50', 'disabled true base');
		t.equal(on.header, 'font-bold text-gray-400', 'disabled true header');
		t.equal(on.body, 'py-4', 'disabled true body unchanged');

		const off = card({ disabled: false });
		t.equal(
			off.base,
			'border rounded-lg opacity-100',
			'disabled false base'
		);
		t.equal(off.header, 'font-bold text-black', 'disabled false header');
		t.equal(off.body, 'py-4', 'disabled false body unchanged');

		t.end();
	}
);

t.test('slots with throws for invalid variant value', (t) => {
	const card = sv('border', {
		slots: {
			header: 'font-bold',
			body: 'py-4'
		},
		variants: {
			size: {
				sm: { base: 'p-2' },
				lg: { base: 'p-6' }
			}
		}
	});

	t.throws(
		// @ts-expect-error - intentionally passing invalid variant value
		() => card({ size: 'xl' }),
		{ message: 'Invalid value "xl" for variant "size"' },
		'throws for invalid variant value with slots'
	);

	t.end();
});