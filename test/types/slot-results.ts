import { sv } from '../../src/index.ts';

const card = sv({
	slots: {
		header: 'font-bold',
		body: 'p-4'
	}
});

const slots = card();

// Slot values remain ordinary strings, but the returned map is a readonly
// public view. This is declaration-only and does not freeze the runtime value.
const header: string = slots.header;

// @ts-expect-error returned slot maps are readonly
slots.header = 'text-lg';

void header;