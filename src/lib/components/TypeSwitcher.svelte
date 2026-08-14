<script lang="ts">
	// Cycles the app's typography (font pairing + base size) so the user can
	// audition combos. State persists per-browser in localStorage and is applied
	// to <html> via data-type / data-size, which +layout.svelte maps to CSS vars.
	const FONTS = [
		{ key: 'parchment', label: 'Serif' },
		{ key: 'modern', label: 'Sans' },
		{ key: 'classic', label: 'Classic' },
		{ key: 'plain', label: 'Plain' }
	];
	const SIZES = [
		{ key: 'compact', label: 'S' },
		{ key: 'standard', label: 'M' },
		{ key: 'large', label: 'L' }
	];

	let fontIdx = $state(1);
	let sizeIdx = $state(1);

	function apply() {
		const f = FONTS[fontIdx];
		const s = SIZES[sizeIdx];
		document.documentElement.dataset.type = f.key;
		document.documentElement.dataset.size = s.key;
		try {
			localStorage.setItem('dnd-type', f.key);
			localStorage.setItem('dnd-size', s.key);
		} catch {}
	}

	function cycleFont() {
		fontIdx = (fontIdx + 1) % FONTS.length;
		apply();
	}
	function cycleSize() {
		sizeIdx = (sizeIdx + 1) % SIZES.length;
		apply();
	}

	if (typeof window !== 'undefined') {
		const savedType = localStorage.getItem('dnd-type');
		const savedSize = localStorage.getItem('dnd-size');
		const fi = FONTS.findIndex((f) => f.key === savedType);
		const si = SIZES.findIndex((s) => s.key === savedSize);
		fontIdx = fi >= 0 ? fi : 0; // default: Serif (current parchment pairing)
		sizeIdx = si >= 0 ? si : 1; // default: standard size
		apply();
	}
</script>

<div class="type-switch" aria-label="Typography">
	<button type="button" class="t-btn" onclick={cycleFont} title="Switch font pairing">
		<span class="t-dot" aria-hidden="true">Aa</span>
		<span class="t-label">{FONTS[fontIdx].label}</span>
	</button>
	<button type="button" class="t-btn size" onclick={cycleSize} title="Switch text size">
		<span class="t-label">{SIZES[sizeIdx].label}</span>
	</button>
</div>

<style>
	.type-switch {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		flex: none;
	}
	.t-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		border: 1px solid var(--rule);
		background: var(--parchment-light);
		color: var(--ink-soft);
		border-radius: 6px;
		padding: 0.25rem 0.5rem;
		cursor: pointer;
		font-family: var(--font-ui);
		font-size: 0.8rem;
		line-height: 1;
		transition: background 0.12s ease, border-color 0.12s ease, color 0.12s ease;
	}
	.t-btn:hover {
		background: var(--parchment-deep);
		border-color: var(--accent);
		color: var(--ink);
	}
	.t-dot {
		font-family: var(--font-display);
		font-size: 0.85rem;
		font-weight: 700;
		color: var(--accent);
	}
	.t-btn.size {
		min-width: 1.9rem;
		justify-content: center;
	}
</style>
