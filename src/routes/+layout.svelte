<script lang="ts">
	import '@fontsource/cinzel/600.css';
	import '@fontsource/cinzel/700.css';
	import '@fontsource/crimson-pro/400.css';
	import '@fontsource/crimson-pro/600.css';
	import '@fontsource/crimson-pro/400-italic.css';
	import favicon from '$lib/assets/favicon.svg';
	import ThemeSwitcher from '$lib/components/ThemeSwitcher.svelte';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<ThemeSwitcher />
{@render children()}

<style>
	:global(:root) {
		--font-display: 'Cinzel', 'Georgia', serif;
		--font-body: 'Crimson Pro', 'Georgia', serif;
	}
	/* theme: Dark Parchment (default) — warm browns, crimson accent */
	:global(:root, :root[data-theme='parchment']) {
		--parchment: #241d15;
		--parchment-deep: #1a140d;
		--parchment-light: #2d261c;
		--ink: #e7dcc3;
		--ink-soft: #a79a81;
		--accent: #d06a63;
		--accent-soft: #e08a80;
		--gold: #c8a13d;
		--rule: #3d3426;
		--board-bg: #2d261c;
		--board-grid: rgba(255, 255, 255, 0.08);
		--section-hl: rgba(200, 161, 61, 0.055);
	}
	/* theme: Midnight — cool slate/navy, blue-white text, muted crimson accent */
	:global(:root[data-theme='midnight']) {
		--parchment: #1a2130;
		--parchment-deep: #141a26;
		--parchment-light: #222b3c;
		--ink: #dbe6f5;
		--ink-soft: #93a4bd;
		--accent: #d8736c;
		--accent-soft: #e6908a;
		--gold: #cbb56a;
		--rule: #33405c;
		--board-bg: #222b3c;
		--board-grid: rgba(219, 230, 245, 0.09);
		--section-hl: rgba(203, 181, 106, 0.06);
	}
	/* theme: Ember — dark red-brown, warm pale text, fiery accent */
	:global(:root[data-theme='crimson']) {
		--parchment: #241517;
		--parchment-deep: #1b0f10;
		--parchment-light: #2e1c1e;
		--ink: #f0ded7;
		--ink-soft: #bd9f96;
		--accent: #e8625a;
		--accent-soft: #ef8a80;
		--gold: #d4a53f;
		--rule: #4a2c2c;
		--board-bg: #2e1c1e;
		--board-grid: rgba(240, 222, 215, 0.09);
		--section-hl: rgba(212, 165, 63, 0.06);
	}
	/* theme: Forest — dark green, cool pale text, terracotta accent */
	:global(:root[data-theme='forest']) {
		--parchment: #17201a;
		--parchment-deep: #101712;
		--parchment-light: #202c24;
		--ink: #dce9dc;
		--ink-soft: #9cb89f;
		--accent: #d07a5e;
		--accent-soft: #e09a80;
		--gold: #c9ad5e;
		--rule: #2f4436;
		--board-bg: #202c24;
		--board-grid: rgba(220, 233, 220, 0.09);
		--section-hl: rgba(201, 173, 94, 0.06);
	}
	/* theme: Obsidian — neutral near-black, highest contrast */
	:global(:root[data-theme='obsidian']) {
		--parchment: #161616;
		--parchment-deep: #101010;
		--parchment-light: #222222;
		--ink: #ececec;
		--ink-soft: #a8a8a8;
		--accent: #e87d76;
		--accent-soft: #f09a93;
		--gold: #d0a849;
		--rule: #333333;
		--board-bg: #222222;
		--board-grid: rgba(236, 236, 236, 0.09);
		--section-hl: rgba(208, 168, 73, 0.06);
	}
	:global(body) {
		margin: 0;
		background: var(--parchment);
		color: var(--ink);
	}
	/* keep the top-right theme switcher clear of header controls */
	:global(header.bar),
	:global(header.top) {
		padding-right: 13rem;
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
