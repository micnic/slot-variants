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
// A child config for `extend` on top of the simple button: it adds base
// classes, a value to an inherited variant, classes to an inherited value, a
// new variant and a compound, and overrides a default. No class conflicts with
// the parent, so the output is the same with or without tailwind-merge.
export function createExtendedButtonConfig() {
	return {
		base: 'inline-flex gap-2',
		variants: {
			color: {
				primary: 'text-white',
				danger: 'bg-red-500'
			},
			size: {
				xl: 'text-xl'
			},
			rounded: {
				none: 'rounded-none',
				full: 'rounded-full'
			}
		},
		compoundVariants: [
			{ color: 'danger', rounded: 'full', class: 'ring-2' }
		],
		defaultVariants: {
			size: 'sm',
			rounded: 'none'
		}
	} as const;
}

// A child config for `extend` on top of the slots card: it adds a slot, classes
// to inherited slots and values, and a new variant. It redefines every parent
// variant, as tailwind-variants orders a child's variants before parent-only
// ones. Not `as const`: under `extend`, tailwind-variants' types reject
// readonly slot class objects.
export function createExtendedSlotsCardConfig() {
	return {
		slots: {
			header: 'flex items-center',
			icon: 'card-icon shrink-0'
		},
		variants: {
			size: {
				lg: { icon: 'size-6', footer: 'text-lg' }
			},
			variant: {
				filled: { footer: 'border-gray-300' }
			},
			elevated: {
				true: { base: 'shadow-md', footer: 'bg-white' }
			}
		}
	};
}