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
		--font-display: 'Cinzel', 'Georgia', serif;
		--font-body: 'Crimson Pro', 'Georgia', serif;
	}
	/* Theme — Indigo on an Obsidian (neutral near-black) base. */
	:global(:root) {
		--parchment: #161616;
		--parchment-deep: #101010;
		--parchment-light: #222222;
		--ink: #ececec;
		--ink-soft: #a8a8a8;
		--rule: #333333;
		--board-bg: #222222;
		--board-grid: rgba(236, 236, 236, 0.09);
		--accent: #6f8ff5;
		--accent-soft: #9db4fa;
		--gold: #7d9cf7;
		--section-hl: rgba(111, 143, 245, 0.08);
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
