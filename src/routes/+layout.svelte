<script lang="ts">
	import '@fontsource/cinzel/600.css';
	import '@fontsource/cinzel/700.css';
	import '@fontsource/literata/400.css';
	import '@fontsource/literata/500.css';
	import '@fontsource/literata/600.css';
	import '@fontsource/literata/700.css';
	import '@fontsource/literata/400-italic.css';
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
		--font-body: 'Literata', 'Georgia', serif;
		--font-ui: system-ui, -apple-system, 'Segoe UI', sans-serif;
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
		/* a real warm gold as the secondary hue: active/highlight/underline borders,
		   while accent stays indigo for interactive/links — gives the palette hierarchy */
		--gold: #c8a13d;
		--section-hl: rgba(111, 143, 245, 0.08); /* indigo wash that ties to the accent */
		--danger: #e25d54; /* a real warning/error red (success stays green) */
		/* dark-tuned elevation shadows (the old light-ink rgba(43,35,23) was invisible on the near-black base) */
		--shadow: 0 1px 3px rgba(0, 0, 0, 0.5);
		--shadow-md: 0 4px 14px rgba(0, 0, 0, 0.45);
		--shadow-lg: 0 6px 24px rgba(0, 0, 0, 0.55);
		--shadow-glow: 0 0 18px rgba(0, 0, 0, 0.35);
		/* coherent radius scale + player-token ring cue */
		--radius-sm: 5px;
		--radius-md: 8px;
		--radius-lg: 12px;
		--token-ring: rgba(111, 143, 245, 0.9);
	}
	:global(body) {
		margin: 0;
		background: var(--parchment);
		color: var(--ink);
		font-family: var(--font-body);
	}
	:global(a) {
		color: var(--accent);
	}
	/* Browser-default white form controls punch out of the dark theme. */
	:global(input),
	:global(select),
	:global(textarea) {
		background: var(--parchment-deep);
		color: var(--ink);
		font-family: var(--font-ui);
	}
	/* UI controls share one face; Cinzel is reserved for titles only. */
	:global(button) {
		font-family: var(--font-ui);
	}
	/* Keyboard focus must always be visible, on every custom-styled control.
	   Gold contrasts against both the dark bg and the indigo accent fills. */
	:global(:focus-visible) {
		outline: 2px solid var(--gold);
		outline-offset: 2px;
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
