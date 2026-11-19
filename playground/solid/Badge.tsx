import type { JSX } from '@solidjs/web';
import { createMemo, merge } from 'solid-js';
import { sv, type VariantProps } from 'slot-variants';

const badge = sv('inline-flex items-center rounded-full font-medium', {
	variants: {
		variant: {
			subtle: 'bg-blue-50 text-blue-700',
			outline: 'border border-blue-200 text-blue-700'
		},
		size: {
			sm: 'px-2 text-xs',
			md: 'px-2.5 text-sm'
		}
	}
});

type BadgeProps = VariantProps<typeof badge> & {
	class?: string;
	children?: JSX.Element;
};

export function Badge(props: BadgeProps) {
	// The variant defaults live in the component, not in the config.
	const merged = merge({ variant: 'subtle', size: 'sm' } as const, props);
	const classes = createMemo(() =>
		badge({
			variant: merged.variant,
			size: merged.size,
			class: merged.class
		})
	);

	return <span class={classes()}>{merged.children}</span>;
}