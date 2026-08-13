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
	/* base: Obsidian — neutral near-black, highest contrast. All 5 themes share
	   this base; only the highlight colours (blue accent + green secondary) change per set. */
	:global(:root) {
		--parchment: #161616;
		--parchment-deep: #101010;
		--parchment-light: #222222;
		--ink: #ececec;
		--ink-soft: #a8a8a8;
		--rule: #333333;
		--board-bg: #222222;
		--board-grid: rgba(236, 236, 236, 0.09);
		/* Sapphire (default) — classic blue + mint */
		--accent: #7aa8f5;
		--accent-soft: #9cc2fa;
		--gold: #7bc680;
		--section-hl: rgba(122, 168, 245, 0.07);
	}
	/* highlight set: Azure — bright royal blue + emerald green */
	:global(:root[data-theme='azure']) {
		--accent: #4d9de0;
		--accent-soft: #7ab8f0;
		--gold: #2fbf6e;
		--section-hl: rgba(77, 157, 224, 0.08);
	}
	/* highlight set: Sky — light pastel blue + soft mint */
	:global(:root[data-theme='sky']) {
		--accent: #8fb8f7;
		--accent-soft: #b3d2fb;
		--gold: #8fd08a;
		--section-hl: rgba(143, 184, 247, 0.07);
	}
	/* highlight set: Indigo — deep indigo blue + teal */
	:global(:root[data-theme='indigo']) {
		--accent: #6f8ff5;
		--accent-soft: #9db4fa;
		--gold: #3fbfaf;
		--section-hl: rgba(111, 143, 245, 0.08);
	}
	/* highlight set: Ocean — muted deep blue + leaf green */
	:global(:root[data-theme='ocean']) {
		--accent: #3f8fd6;
		--accent-soft: #6fb0e8;
		--gold: #5dbb7a;
		--section-hl: rgba(63, 143, 214, 0.08);
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
