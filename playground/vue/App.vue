<script setup>
import Button from './Button.vue';
import Card from './Card.vue';
</script>

<template>
	<main class="mx-auto max-w-lg space-y-6 p-8">
		<Card title="Deploy">
			Ship the current branch to production.
			<template #footer>
				<Button size="sm">Cancel</Button>
				<Button class="ml-1" tone="primary" size="sm">Confirm</Button>
			</template>
		</Card>
		<Card class="mt-4" tone="danger" title="Danger zone">
			Deleting a project cannot be undone.
		</Card>
		<Button tone="danger" size="lg">Delete project</Button>
	</main>
</template>