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
	/* Theme — the War Table: a dark aged-oak / leather tabletop, warm chrome, and
	   cream parchment sheets as the reading material laid out on it. Gold trim + wax
	   seals sit ON the paper. Two token families: the table/chrome (--parchment/--ink)
	   and the paper documents (--paper/--paper-ink). */
	:global(:root) {
		/* the tabletop (dark, warm, moody) */
		--parchment: #241c13;
		--parchment-deep: #19120a;
		--parchment-light: #332818;
		--ink: #e9dcbd;
		--ink-soft: #b3a183;
		--rule: #443522;
		--board-bg: #201710;
		--board-grid: rgba(233, 220, 189, 0.10);
		--accent: #d4a13c;
		--accent-soft: #e2be6b;
		--gold: #dcb25a;
		--section-hl: rgba(212, 161, 60, 0.14);
		--danger: #e8896f;
		--success: #58b366;
		--success-deep: #1f5d2b;
		--ok-text: #f2e7cd;
		/* parchment sheets — the documents laid on the table (light, aged, readable) */
		--paper: #efe2c2;
		--paper-deep: #e3d2a9;
		--paper-edge: #d8c393;
		--paper-ink: #3a2e1b;
		--paper-ink-soft: #6f6043;
		--paper-rule: #cfbd92;
		--paper-shadow: 0 8px 24px rgba(0, 0, 0, 0.55);
		/* wood-tuned elevation shadows (deep warm falloff off the table) */
		--shadow: 0 1px 3px rgba(0, 0, 0, 0.55);
		--shadow-md: 0 4px 14px rgba(0, 0, 0, 0.5);
		--shadow-lg: 0 8px 26px rgba(0, 0, 0, 0.62);
		--shadow-glow: 0 0 20px rgba(0, 0, 0, 0.5);
		/* coherent radius scale + player-token ring cue */
		--radius-sm: 5px;
		--radius-md: 9px;
		--radius-lg: 14px;
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
		/* the war table: a warm candlelit oak surface with a soft leather grain,
		   glowing from the lantern above and sinking to deep shadow at the edges */
		background-image:
			radial-gradient(1100px 700px at 50% -6%, rgba(212, 178, 120, 0.12), transparent 58%),
			radial-gradient(1400px 900px at 50% 110%, rgba(0, 0, 0, 0.55), transparent 62%),
			var(--wood-grain);
		background-attachment: fixed;
		color: var(--ink);
		font-family: var(--font-body);
	}
	/* aged-oak wood grain for the tabletop + a finer paper grain for the sheets */
	:global(:root) {
		--wood-grain: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='w'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.02 0.35' numOctaves='2' seed='11'/%3E%3CfeColorMatrix values='0 0 0 0 0.15 0 0 0 0 0.12 0 0 0 0 0.08 0 0 0 0.5 0'/%3E%3C/filter%3E%3Crect width='180' height='180' filter='url(%23w)'/%3E%3C/svg%3E");
		--paper-grain: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)' opacity='0.06'/%3E%3C/svg%3E");
		--ink-divider: '✦';
	}
	/* scroll-ornament divider: ✦ between hairline rules */
	:global(.ornament) {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		color: var(--gold);
		font-size: 0.8rem;
		letter-spacing: 0.2em;
		text-align: center;
	}
	:global(.ornament::before),
	:global(.ornament::after) {
		content: '';
		flex: 1;
		height: 1px;
		background: linear-gradient(90deg, transparent, var(--gold), transparent);
	}
	:global(.ornament span) {
		font-family: var(--font-display);
		text-shadow: 0 0 8px rgba(220, 178, 90, 0.35);
	}
	/* a parchment sheet — the reading material laid on the table. Light, aged,
	   dog-eared corners, warm edge, deep paper-cast shadow. */
	:global(.sheet) {
		position: relative;
		color: var(--paper-ink);
		background:
			linear-gradient(165deg, rgba(255, 255, 255, 0.18), transparent 34%),
			radial-gradient(120% 90% at 100% 0%, rgba(120, 90, 40, 0.10), transparent 40%),
			var(--paper);
		background-image:
			linear-gradient(165deg, rgba(255, 255, 255, 0.16), transparent 34%),
			var(--paper-grain),
			var(--paper);
		border: 1px solid var(--paper-edge);
		border-radius: 3px;
		box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.25), inset 0 0 40px rgba(110, 80, 30, 0.10), var(--paper-shadow);
	}
	:global(.sheet .sheet-ink) {
		color: var(--paper-ink);
	}
	:global(.sheet .sheet-ink-soft) {
		color: var(--paper-ink-soft);
	}
	:global(.sheet a) {
		color: #7a5c14;
	}
	/* dog-eared corner on parchment sheets */
	:global(.sheet.dogear::after) {
		content: '';
		position: absolute;
		top: 0;
		right: 0;
		width: 18px;
		height: 18px;
		background: linear-gradient(225deg, var(--paper-deep) 0 47%, transparent 50%);
		border-bottom-left-radius: 3px;
	}
	:global(.filigree) {
		position: relative;
	}
	:global(.filigree::before),
	:global(.filigree::after) {
		content: '';
		position: absolute;
		width: 14px;
		height: 14px;
		border-color: var(--gold);
		border-style: solid;
		border-width: 0;
		opacity: 0.7;
		pointer-events: none;
	}
	:global(.filigree::before) {
		top: 6px;
		left: 6px;
		border-top-width: 2px;
		border-left-width: 2px;
		border-top-left-radius: 4px;
	}
	:global(.filigree::after) {
		bottom: 6px;
		right: 6px;
		border-bottom-width: 2px;
		border-right-width: 2px;
		border-bottom-right-radius: 4px;
	}
	/* a wax-seal-red raised action that reads as the table's confirm press */
	:global(.btn-wax) {
		font-family: var(--font-ui);
		font-weight: 700;
		letter-spacing: 0.04em;
		color: var(--parchment-light);
		background: linear-gradient(180deg, #e8795f, #8b2020);
		border: 1px solid #5f1412;
		border-radius: 6px;
		box-shadow: inset 0 1px 0 rgba(255, 220, 200, 0.4), 0 2px 6px rgba(0, 0, 0, 0.4);
		cursor: pointer;
	}
	:global(.btn-wax:hover) {
		filter: brightness(1.1);
	}
	:global(.btn-wax:active) {
		box-shadow: inset 0 2px 6px rgba(0, 0, 0, 0.5);
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
