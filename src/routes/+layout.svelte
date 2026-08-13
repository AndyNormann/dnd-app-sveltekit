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
		/* warm dark parchment — a D&D-flavored dark theme (medium dark, not pure black) */
		--parchment: #241d15;
		--parchment-deep: #1a140d;
		--parchment-light: #2d261c;
		--ink: #e7dcc3;
		--ink-soft: #a79a81;
		--accent: #c05248;
		--accent-soft: #d17a70;
		--gold: #c8a13d;
		--rule: #3d3426;
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
