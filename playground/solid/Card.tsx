import { createMemo, Show, type JSX } from 'solid-js';
import { sv, type VariantProps } from 'slot-variants';

const card = sv('overflow-hidden rounded-xl border bg-white', {
	slots: {
		header: 'flex items-center justify-between px-5 pt-5 font-semibold',
		body: 'px-5 py-4 text-sm',
		footer: 'flex justify-end gap-2 border-t px-5 py-3'
	},
	variants: {
		tone: {
			neutral: {
				base: 'border-gray-200',
				header: 'text-gray-900',
				body: 'text-gray-600',
				footer: 'border-gray-100'
			},
			danger: {
				base: 'border-red-200',
				header: 'text-red-900',
				body: 'text-red-700',
				footer: 'border-red-100'
			}
		}
	},
	defaultVariants: {
		tone: 'neutral'
	}
});

type CardProps = VariantProps<typeof card> & {
	class?: string;
	title: string;
	footer?: JSX.Element;
	children?: JSX.Element;
};

export function Card(props: CardProps) {
	const classes = createMemo(() =>
		card({ tone: props.tone, class: props.class })
	);

	return (
		<section class={classes().base}>
			<div class={classes().header}>{props.title}</div>
			<div class={classes().body}>{props.children}</div>
			<Show when={props.footer}>
				<div class={classes().footer}>{props.footer}</div>
			</Show>
		</section>
	);
}