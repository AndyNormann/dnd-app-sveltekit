<script lang="ts">
	import '@fontsource/cinzel/500.css';
	import '@fontsource/cinzel/600.css';
	import '@fontsource/cinzel/700.css';
	import '@fontsource/literata/400.css';
	import '@fontsource/literata/500.css';
	import '@fontsource/literata/600.css';
	import '@fontsource/literata/700.css';
	import '@fontsource/literata/400-italic.css';
	import '@fontsource/eb-garamond/400.css';
	import '@fontsource/eb-garamond/500.css';
	import '@fontsource/eb-garamond/600.css';
	import '@fontsource/eb-garamond/700.css';
	import '@fontsource/eb-garamond/400-italic.css';
	import '@fontsource/source-serif-4/400.css';
	import '@fontsource/source-serif-4/600.css';
	import '@fontsource/source-serif-4/700.css';
	import '@fontsource/lora/400.css';
	import '@fontsource/lora/500.css';
	import '@fontsource/lora/600.css';
	import '@fontsource/lora/700.css';
	import '@fontsource/lora/400-italic.css';
	import '@fontsource/crimson-pro/400.css';
	import '@fontsource/crimson-pro/600.css';
	import '@fontsource/crimson-pro/700.css';
	import favicon from '$lib/assets/favicon.svg';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{@render children()}

<style>
	:global(:root) {
		--font-display: 'Cinzel', 'Source Serif 4', 'Georgia', serif;
		--font-body: 'Source Serif 4', 'Georgia', serif;
		--font-ui: 'Source Serif 4', 'Georgia', serif;
		--text-base: 1.35rem;
		--type-root: 17.5px;
		font-size: var(--type-root);
	}
	/* Theme — candlelit dark-parchment: the app reads as an old tome open on a
	   lantern-lit table. Brass-gold is the D&D metal (interactive + links); a
	   seal-red marks danger; moss-green marks success; hairline rules are warm
	   bronze. Warm umber surfaces + a candlelight vignette replace flat brown. */
	:global(:root) {
		--parchment: #1a130b;
		--parchment-deep: #120d07;
		--parchment-light: #241b10;
		--ink: #ecd9b4;
		--ink-soft: #bda37c;
		--rule: #3a2d18;
		--board-bg: #1f1710;
		--board-grid: rgba(236, 217, 180, 0.10);
		--accent: #d4a13c;
		--accent-soft: #e2be6b;
		--gold: #dcb25a;
		--section-hl: rgba(212, 161, 60, 0.10);
		--danger: #d96a5a;
		--success: #4fa05c;
		--success-deep: #1f5d2b;
		--ok-text: #f2e7cd;
		/* warm-tuned elevation shadows (brass-tinted falloff so panels lift off the umber) */
		--shadow: 0 1px 3px rgba(0, 0, 0, 0.55);
		--shadow-md: 0 4px 14px rgba(0, 0, 0, 0.5);
		--shadow-lg: 0 6px 24px rgba(0, 0, 0, 0.6);
		--shadow-glow: 0 0 18px rgba(0, 0, 0, 0.4);
		/* coherent radius scale + player-token ring cue */
		--radius-sm: 5px;
		--radius-md: 8px;
		--radius-lg: 12px;
		--token-ring: rgba(212, 161, 60, 0.9);
	}
		/* Typography presets — switched by the TypeSwitcher (data-type / data-size). */
	:global(:root[data-type='garamond']) {
		--font-display: 'EB Garamond', 'Georgia', serif;
		--font-body: 'EB Garamond', 'Georgia', serif;
		--font-ui: 'EB Garamond', 'Georgia', serif;
	}
	:global(:root[data-type='source']) {
		/* the default pairing: D&D display (Cinzel) over a readable book serif */
		--font-display: 'Cinzel', 'Source Serif 4', 'Georgia', serif;
		--font-body: 'Source Serif 4', 'Georgia', serif;
		--font-ui: 'Source Serif 4', 'Georgia', serif;
	}
	:global(:root[data-type='lora']) {
		--font-display: 'Lora', 'Georgia', serif;
		--font-body: 'Lora', 'Georgia', serif;
		--font-ui: 'Lora', 'Georgia', serif;
	}
	:global(:root[data-type='crimson']) {
		--font-display: 'Crimson Pro', 'Georgia', serif;
		--font-body: 'Crimson Pro', 'Georgia', serif;
		--font-ui: 'Crimson Pro', 'Georgia', serif;
	}
	:global(:root[data-type='modern']) {
		--font-display: 'Cinzel', 'Georgia', serif;
		--font-body: system-ui, -apple-system, 'Segoe UI', sans-serif;
		--font-ui: system-ui, -apple-system, 'Segoe UI', sans-serif;
	}
	:global(:root[data-type='plain']) {
		--font-display: system-ui, -apple-system, 'Segoe UI', sans-serif;
		--font-body: system-ui, -apple-system, 'Segoe UI', sans-serif;
		--font-ui: system-ui, -apple-system, 'Segoe UI', sans-serif;
	}
	:global(:root[data-size='compact']) {
		--type-root: 15px;
	}
	:global(:root[data-size='standard']) {
		--type-root: 16px;
	}
	:global(:root[data-size='large']) {
		--type-root: 17.5px;
	}
	:global(body) {
		margin: 0;
		background: var(--parchment);
		/* a candlelit vellum: warm brass glow pooling from the lantern above,
		   sinking to deep umber at the corners — the lit-tome read, not flat brown */
		background-image:
			radial-gradient(1200px 780px at 50% -8%, rgba(220, 178, 90, 0.14), transparent 60%),
			radial-gradient(1600px 1000px at 50% 108%, rgba(0, 0, 0, 0.5), transparent 58%);
		background-attachment: fixed;
		color: var(--ink);
		font-family: var(--font-body);
	}
	/* Browser surfaces belong to the theme too — selection, scrollbars, caret. */
	:global(::selection) {
		background: rgba(212, 161, 60, 0.35);
		color: var(--ink);
	}
	:global(*::-webkit-scrollbar) {
		width: 12px;
		height: 12px;
	}
	:global(*::-webkit-scrollbar-track) {
		background: var(--parchment-deep);
	}
	:global(*::-webkit-scrollbar-thumb) {
		background: var(--rule);
		border: 3px solid var(--parchment-deep);
		border-radius: 999px;
	}
	:global(*::-webkit-scrollbar-thumb:hover) {
		background: var(--gold);
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
	:global(input[type='range']) {
		accent-color: var(--accent);
		background: transparent;
	}
	:global(input[type='color']) {
		background: var(--parchment-deep);
		border: 1px solid var(--rule);
		border-radius: 4px;
		padding: 2px;
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
