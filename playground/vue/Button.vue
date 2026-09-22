<script setup>
import { computed } from 'vue';
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

const props = defineProps({
	tone: { type: String, default: undefined },
	size: { type: String, default: undefined },
	class: { type: String, default: undefined }
});

const classes = computed(() =>
	button({ tone: props.tone, size: props.size, class: props.class })
);
</script>

<template>
	<button :class="classes" type="button">
		<slot />
	</button>
</template>