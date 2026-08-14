<script lang="ts">
	export interface OutlineItem {
		id: string;
		level: number;
		text: string;
	}

	let { items, onnavigate }: { items: OutlineItem[]; onnavigate?: (id: string) => void } = $props();

	let minLevel = $derived(items.length ? Math.min(...items.map((i) => i.level)) : 1);

	function go(id: string) {
		onnavigate?.(id);
		document.getElementById(`h-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
	}
</script>

<nav class="outline">
	<div class="label">Outline</div>
	{#if items.length === 0}
		<p class="empty">No headings yet</p>
	{/if}
	{#each items as item (item.id)}
		<button
			type="button"
			style={`padding-left: ${0.5 + (item.level - minLevel) * 0.8}rem`}
			onclick={() => go(item.id)}
		>
			{item.text}
		</button>
	{/each}
</nav>

<style>
	.outline {
		font-family: var(--font-ui);
		font-size: 0.82rem;
		overflow-y: auto;
	}
	.label {
		font-family: var(--font-display);
		font-weight: 700;
		text-transform: uppercase;
		font-size: 0.7rem;
		letter-spacing: 0.08em;
		color: var(--gold);
		padding: 0.5rem;
	}
	.empty {
		color: var(--ink-soft);
		font-style: italic;
		padding: 0 0.5rem;
		margin: 0;
	}
	button {
		display: block;
		width: 100%;
		text-align: left;
		border: 0;
		background: none;
		padding: 0.25rem 0.5rem;
		color: var(--ink-soft);
		cursor: pointer;
		border-radius: 4px;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	button:hover {
		background: var(--parchment-deep);
		color: var(--accent);
	}
</style>
