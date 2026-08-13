<script lang="ts">
	import type { CombatLogEntry } from '$lib/server/db';

	let {
		initial = []
	}: {
		initial?: CombatLogEntry[];
	} = $props();

	// newest first (listCombatLogs orders DESC)
	let logs = $state<CombatLogEntry[]>([...initial]);
	let open = $state(true);

	/** Prepend a freshly broadcast entry from the server. */
	export function add(entry: CombatLogEntry) {
		logs = [entry, ...logs.filter((e) => e.id !== entry.id)].slice(0, 80);
	}
</script>

<div class="clog" class:open>
	<button type="button" class="header" onclick={() => (open = !open)}>
		📜 Combat log {open ? '▾' : '▴'}
	</button>
	{#if open}
		<div class="feed">
			{#if logs.length === 0}
				<p class="empty">Nothing yet. HP changes, turns and downed units land here.</p>
			{/if}
			{#each logs as e (e.id)}
				<div class="row">{e.text}</div>
			{/each}
		</div>
	{/if}
</div>

<style>
	.clog {
		width: 100%;
		background: var(--parchment-light);
		border: 1px solid var(--rule);
		border-top: 3px solid var(--gold);
		border-radius: 8px;
		box-shadow: var(--shadow-md);
		font-family: system-ui, sans-serif;
		font-size: 0.85rem;
		color: var(--ink);
	}
	.header {
		width: 100%;
		text-align: left;
		padding: 0.55rem 0.85rem;
		border: 0;
		background: none;
		font-family: var(--font-display);
		font-weight: 600;
		font-size: 1rem;
		color: var(--accent);
		cursor: pointer;
	}
	.feed {
		max-height: 16rem;
		overflow-y: auto;
		padding: 0 0.6rem 0.6rem;
		display: flex;
		flex-direction: column;
	}
	.empty {
		color: var(--ink-soft);
		font-style: italic;
		margin: 0.3rem 0;
	}
	.row {
		padding: 0.28rem 0.1rem;
		border-top: 1px solid var(--rule);
	}
</style>
