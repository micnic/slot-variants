import type { ReactNode } from 'react';
import { sv, type VariantProps } from 'slot-variants';

const button = sv('inline-flex items-center rounded-lg font-medium', {
	variants: {
		tone: {
			neutral: 'bg-gray-100 text-gray-900',
			primary: 'bg-blue-600 text-white',
			danger: 'bg-red-600 text-white'
		},
		size: {
			sm: 'h-8 gap-1 px-3 text-sm',
			md: 'h-10 gap-2 px-4 text-base',
			lg: 'h-12 gap-2 px-6 text-lg'
		}
	},
	compoundVariants: [
		{ tone: 'danger', size: 'lg', class: 'uppercase tracking-wide' }
	],
	defaultVariants: {
		tone: 'neutral',
		size: 'md'
	}
});

type ButtonProps = VariantProps<typeof button> & {
	className?: string;
	children?: ReactNode;
	onClick?: () => void;
};

export function Button({
	tone,
	size,
	className,
	children,
	onClick
}: ButtonProps) {
	return (
		<button
			className={button({ tone, size, class: className })}
			onClick={onClick}
			type="button"
		>
			{children}
		</button>
	);
}