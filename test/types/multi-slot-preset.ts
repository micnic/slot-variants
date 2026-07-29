import { sv } from '../../src/index.ts';

const withPresets = sv({
	slots: {
		header: 'font-bold',
		body: 'p-4'
	},
	variants: {
		tone: {
			neutral: { header: 'text-gray-900' },
			danger: { header: 'text-red-600' }
		}
	},
	presets: {
		alert: { tone: 'danger' }
	},
	multiSlots: ['header']
});

const slotFn = withPresets({}).header;

// A multi-slot function accepts a preset name alongside variant props
const presetHeader: string = slotFn({ preset: 'alert' });
const variantHeader: string = slotFn({ tone: 'neutral' });

// @ts-expect-error unknown preset names are rejected
slotFn({ preset: 'missing' });

const withoutPresets = sv({
	slots: {
		header: 'font-bold'
	},
	variants: {
		tone: {
			neutral: { header: 'text-gray-900' }
		}
	},
	multiSlots: ['header']
});

// @ts-expect-error `preset` is not available when no presets are configured
withoutPresets({}).header({ preset: 'alert' });

void presetHeader;
void variantHeader;