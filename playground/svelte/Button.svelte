<script>
	import { sv } from 'slot-variants';

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

	let { tone, size, class: className, children } = $props();

	const classes = $derived(button({ tone, size, class: className }));
</script>

<button class={classes} type="button">
	{@render children()}
</button>