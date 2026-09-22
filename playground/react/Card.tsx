import type { ReactNode } from 'react';
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
	className?: string;
	title: string;
	footer?: ReactNode;
	children?: ReactNode;
};

export function Card({ tone, className, title, footer, children }: CardProps) {
	const classes = card({ tone, class: className });

	return (
		<section className={classes.base}>
			<div className={classes.header}>{title}</div>
			<div className={classes.body}>{children}</div>
			{footer ? <div className={classes.footer}>{footer}</div> : null}
		</section>
	);
}