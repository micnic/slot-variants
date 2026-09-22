<script setup>
import { computed } from 'vue';
import { sv } from 'slot-variants';

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

const props = defineProps({
	tone: { type: String, default: undefined },
	title: { type: String, required: true },
	class: { type: String, default: undefined }
});

const classes = computed(() => card({ tone: props.tone, class: props.class }));
</script>

<template>
	<section :class="classes.base">
		<div :class="classes.header">{{ title }}</div>
		<div :class="classes.body"><slot /></div>
		<div v-if="$slots.footer" :class="classes.footer">
			<slot name="footer" />
		</div>
	</section>
</template>