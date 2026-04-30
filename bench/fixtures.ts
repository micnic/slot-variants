export function createSimpleButtonConfig() {
	return {
		variants: {
			color: {
				primary: 'bg-blue-500',
				secondary: 'bg-gray-500'
			},
			size: {
				sm: 'text-sm',
				md: 'text-md',
				lg: 'text-lg'
			}
		},
		defaultVariants: {
			color: 'primary',
			size: 'md'
		}
	} as const;
}

export function createCompoundButtonConfig() {
	return {
		variants: {
			color: {
				primary: 'bg-blue-500',
				secondary: 'bg-gray-500'
			},
			size: {
				sm: 'text-sm',
				md: 'text-md',
				lg: 'text-lg'
			},
			disabled: {
				true: 'opacity-50 cursor-not-allowed',
				false: ''
			}
		},
		compoundVariants: [
			{ color: 'primary', size: 'lg', class: 'font-bold uppercase' },
			{ color: 'secondary', disabled: true, class: 'bg-gray-300' }
		],
		defaultVariants: {
			color: 'primary',
			size: 'md',
			disabled: false
		}
	} as const;
}

export function createManyVariantsConfig() {
	return {
		variants: {
			size: {
				xs: 'text-xs',
				sm: 'text-sm',
				md: 'text-md',
				lg: 'text-lg',
				xl: 'text-xl'
			},
			color: {
				primary: 'bg-blue-500',
				secondary: 'bg-gray-500',
				success: 'bg-green-500',
				danger: 'bg-red-500',
				warning: 'bg-yellow-500'
			},
			rounded: {
				none: 'rounded-none',
				sm: 'rounded-sm',
				md: 'rounded-md',
				lg: 'rounded-lg',
				full: 'rounded-full'
			},
			shadow: {
				none: 'shadow-none',
				sm: 'shadow-sm',
				md: 'shadow-md',
				lg: 'shadow-lg'
			}
		},
		defaultVariants: {
			size: 'md',
			color: 'primary',
			rounded: 'md',
			shadow: 'none'
		}
	} as const;
}

export function createSlotsCardConfig() {
	return {
		slots: {
			header: 'card-header font-bold',
			body: 'card-body p-4',
			footer: 'card-footer border-t'
		},
		variants: {
			size: {
				sm: { base: 'w-48', header: 'text-sm', body: 'text-sm' },
				md: { base: 'w-64', header: 'text-base', body: 'text-base' },
				lg: { base: 'w-96', header: 'text-lg', body: 'text-lg' }
			},
			variant: {
				outlined: { base: 'border', header: 'border-b' },
				filled: { base: 'bg-gray-100', header: 'bg-gray-200' }
			}
		},
		defaultVariants: {
			size: 'md',
			variant: 'outlined'
		}
	} as const;
}