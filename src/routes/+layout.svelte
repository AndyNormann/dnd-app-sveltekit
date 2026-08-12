<script lang="ts">
	import '@fontsource/cinzel/600.css';
	import '@fontsource/cinzel/700.css';
	import '@fontsource/crimson-pro/400.css';
	import '@fontsource/crimson-pro/600.css';
	import '@fontsource/crimson-pro/400-italic.css';
	import favicon from '$lib/assets/favicon.svg';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{@render children()}

<style>
	:global(:root) {
		--parchment: #f6efe0;
		--parchment-deep: #efe5cd;
		--parchment-light: #fbf7ec;
		--ink: #2b2317;
		--ink-soft: #5a4d3a;
		--accent: #8b2020;
		--accent-soft: #a94444;
		--gold: #b8912f;
		--rule: #d8c9a8;
		--font-display: 'Cinzel', 'Georgia', serif;
		--font-body: 'Crimson Pro', 'Georgia', serif;
	}
	:global(body) {
		margin: 0;
		background: var(--parchment);
		color: var(--ink);
	}
	:global(a) {
		color: var(--accent);
	}
	@media (prefers-reduced-motion: reduce) {
		:global(*),
		:global(*::before),
		:global(*::after) {
			animation-duration: 0.001ms !important;
			animation-iteration-count: 1 !important;
			transition-duration: 0.001ms !important;
			scroll-behavior: auto !important;
		}
	}
</style>
