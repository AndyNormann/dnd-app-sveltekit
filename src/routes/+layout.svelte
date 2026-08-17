<script lang="ts">
	import '@fontsource/source-serif-4/400.css';
	import '@fontsource/source-serif-4/500.css';
	import '@fontsource/source-serif-4/600.css';
	import '@fontsource/source-serif-4/700.css';
	import favicon from '$lib/assets/favicon.svg';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{@render children()}

<style>
	:global(:root) {
		/* chrome + reading are clean: system-ui for the app UI, Source Serif 4 for
		   the notes/editor prose. One warm accent. */
		--font-display: system-ui, -apple-system, 'Segoe UI', 'Helvetica Neue', sans-serif;
		--font-ui: system-ui, -apple-system, 'Segoe UI', 'Helvetica Neue', sans-serif;
		--font-body: 'Source Serif 4', 'Georgia', 'Times New Roman', serif;
		font-size: 16px;
	}
	/* Sleek, flat, light notes-app palette. Every surface is a soft warm paper; a
	   single hairline and one terracotta accent carry the hierarchy. */
	:global(:root) {
		--parchment: #f7f5ef; /* app background (warm paper) */
		--parchment-deep: #efebe1; /* sidebar / recessed tier */
		--parchment-light: #ffffff; /* raised surface */
		--ink: #26231e; /* primary text */
		--ink-soft: #6f6e67; /* secondary text */
		--rule: #e2dccf; /* hairline border */
		--board-bg: #ddd6c7; /* combat/map board — close to the grid tone, just lighter */
		--board-grid: rgba(38, 35, 30, 0.16);
		--accent: #b34d1e; /* warm terracotta — links + interactive */
		--accent-soft: #c96a3a;
		--gold: #b34d1e; /* gold UI now follows the accent */
		--section-hl: rgba(179, 77, 30, 0.08);
		--danger: #c0392b;
		--success: #2f8f4f;
		--success-deep: #1f5d2b;
		--ok-text: #1f6b34;
		/* flat cards / sheets */
		--paper: #ffffff;
		--paper-deep: #f4f1e9;
		--paper-edge: #e2dccf;
		--paper-ink: #26231e;
		--paper-ink-soft: #6f6e67;
		--paper-rule: #e2dccf;
		--paper-shadow: 0 1px 3px rgba(0, 0, 0, 0.06), 0 4px 14px rgba(0, 0, 0, 0.08);
		/* elevation shadows for light surfaces */
		--shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
		--shadow-md: 0 4px 12px rgba(0, 0, 0, 0.08);
		--shadow-lg: 0 10px 24px rgba(0, 0, 0, 0.12);
		--shadow-glow: 0 0 16px rgba(179, 77, 30, 0.18);
		/* coherent radius scale + player-token ring cue */
		--radius-sm: 6px;
		--radius-md: 10px;
		--radius-lg: 14px;
		--token-ring: #b34d1e;
	}
	:global(body) {
		margin: 0;
		background:
			radial-gradient(circle at 12% 8%, rgba(179, 77, 30, 0.045), transparent 28rem),
			linear-gradient(105deg, rgba(255, 255, 255, 0.32), transparent 38%, rgba(120, 78, 35, 0.035)),
			var(--parchment);
		color: var(--ink);
		font-family: var(--font-body);
		-webkit-font-smoothing: antialiased;
	}
	:global(body::before) {
		content: '';
		position: fixed;
		inset: 0;
		pointer-events: none;
		opacity: 0.22;
		background-image: radial-gradient(rgba(73, 45, 22, 0.11) 0.55px, transparent 0.55px);
		background-size: 7px 7px;
		mix-blend-mode: multiply;
		z-index: 100;
	}
	:global(button) {
		border: 1px solid var(--rule);
		border-radius: var(--radius-sm);
		background: var(--parchment-light);
		color: var(--ink);
		padding: 0.42rem 0.7rem;
		cursor: pointer;
		transition: background 140ms ease, border-color 140ms ease, transform 140ms ease;
	}
	:global(button:hover:not(:disabled)) {
		background: color-mix(in srgb, var(--accent) 8%, var(--parchment-light));
		border-color: color-mix(in srgb, var(--accent) 45%, var(--rule));
	}
	:global(button:active:not(:disabled)) {
		transform: translateY(1px);
	}
	:global(button:disabled) {
		cursor: not-allowed;
		opacity: 0.55;
	}
	:global(.status-pill) {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		border: 1px solid var(--rule);
		border-radius: 999px;
		padding: 0.18rem 0.55rem;
		font: 600 0.72rem/1 var(--font-ui);
		letter-spacing: 0.02em;
		background: color-mix(in srgb, var(--parchment-light) 72%, transparent);
	}
	:global(.status-pill::before) {
		content: '';
		width: 0.42rem;
		height: 0.42rem;
		border-radius: 50%;
		background: var(--ink-soft);
	}
	:global(.status-pill.ok::before) { background: var(--success); }
	:global(.status-pill.warn::before) { background: var(--gold); }
	:global(.status-pill.error::before) { background: var(--danger); }
	/* a plain flat card — the universal sheet/surface. */
	:global(.sheet) {
		position: relative;
		background: var(--paper);
		border: 1px solid var(--paper-edge);
		border-radius: var(--radius-md);
		box-shadow: var(--paper-shadow);
		color: var(--paper-ink);
	}
	:global(.sheet .sheet-ink) {
		color: var(--paper-ink);
	}
	:global(.sheet .sheet-ink-soft) {
		color: var(--paper-ink-soft);
	}
	:global(.sheet a) {
		color: var(--accent);
	}
	:global(::selection) {
		background: rgba(179, 77, 30, 0.20);
		color: var(--ink);
	}
	:global(*::-webkit-scrollbar) {
		width: 12px;
		height: 12px;
	}
	:global(*::-webkit-scrollbar-track) {
		background: transparent;
	}
	:global(*::-webkit-scrollbar-thumb) {
		background: var(--rule);
		border: 3px solid var(--parchment);
		border-radius: 999px;
	}
	:global(*::-webkit-scrollbar-thumb:hover) {
		background: var(--accent);
	}
	:global(a) {
		color: var(--accent);
	}
	:global(input),
	:global(select),
	:global(textarea) {
		background: var(--parchment-light);
		color: var(--ink);
		border: 1px solid var(--rule);
		border-radius: var(--radius-sm);
		padding: 0.45rem 0.6rem;
		font-family: var(--font-ui);
		font-size: 0.95rem;
	}
	:global(input:focus),
	:global(select:focus),
	:global(textarea:focus) {
		outline: none;
		border-color: var(--accent);
	}
	:global(input[type='range']) {
		accent-color: var(--accent);
		background: transparent;
		border: none;
		padding: 0;
	}
	:global(input[type='color']) {
		background: var(--parchment-light);
		border: 1px solid var(--rule);
		border-radius: var(--radius-sm);
		padding: 2px;
	}
	:global(button) {
		font-family: var(--font-ui);
	}
	:global(:focus-visible) {
		outline: 2px solid var(--accent);
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
