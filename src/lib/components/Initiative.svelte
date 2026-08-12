<script lang="ts">
	import type { InitEntry } from '$lib/server/db';

	let {
		campaignId,
		dm = false,
		initial = [],
		initialRound = 1
	}: { campaignId: string; dm?: boolean; initial?: InitEntry[]; initialRound?: number } = $props();

	let entries = $state<InitEntry[]>([...initial]);
	let round = $state(initialRound);
	let open = $state(true);
	let name = $state('');
	let init = $state('');
	let hp = $state('');

	/** Apply the latest list + round from the server (SSE). */
	export function applyEntries(next: InitEntry[], nextRound: number = round) {
		entries = [...next];
		round = nextRound;
	}

	async function post(url: string, payload: unknown) {
		await fetch(url, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(payload)
		});
	}

	async function add(e: Event) {
		e.preventDefault();
		if (!name.trim()) return;
		await post(`/c/${campaignId}/initiative`, { action: 'add', name, init: init || '0', hp: hp || '0' });
		name = '';
		init = '';
		hp = '';
	}

	function setActive(entry: InitEntry) {
		post(`/c/${campaignId}/initiative/${entry.id}`, { action: 'update', active: true });
	}
	function setHp(entry: InitEntry, delta: number) {
		post(`/c/${campaignId}/initiative/${entry.id}`, { action: 'update', hp: entry.hp + delta });
	}
	function remove(entry: InitEntry) {
		post(`/c/${campaignId}/initiative/${entry.id}`, { action: 'remove' });
	}
	function nextTurn() {
		post(`/c/${campaignId}/initiative`, { action: 'next' });
	}
	function clear() {
		post(`/c/${campaignId}/initiative`, { action: 'clear' });
	}
</script>

<div class="initiative" class:open>
	<button type="button" class="header" onclick={() => (open = !open)}>
		⚔ Initiative · Round {round} {open ? '▾' : '▴'}
	</button>
	{#if open}
		<div class="list">
			{#if entries.length === 0}
				<p class="empty">No combatants yet.</p>
			{/if}
			{#each entries as e (e.id)}
				<div class="entry" class:active={e.active === 1}>
					{#if dm}
						<button type="button" class="play" title="It's their turn" onclick={() => setActive(e)}>▶</button>
						<button type="button" class="rm" title="Remove" onclick={() => remove(e)}>✕</button>
					{/if}
					<span class="nm">{e.name}</span>
					<span class="in">({e.init})</span>
					{#if dm}
						<span class="hp">
							<button type="button" onclick={() => setHp(e, -1)}>−</button>
							{e.hp}
							<button type="button" onclick={() => setHp(e, 1)}>+</button>
						</span>
					{:else if e.hp > 0}
						<span class="hp">{e.hp}</span>
					{/if}
				</div>
			{/each}
		</div>
		{#if dm}
			<form class="add" onsubmit={add}>
				<input class="nm" placeholder="Name" bind:value={name} maxlength="60" />
				<input class="in" placeholder="Init" bind:value={init} maxlength="5" />
				<input class="hp" placeholder="HP" bind:value={hp} maxlength="6" />
				<button type="submit">Add</button>
			</form>
			<div class="actions">
				<button type="button" onclick={nextTurn}>Next ▸</button>
				<button type="button" onclick={clear}>Clear</button>
			</div>
		{/if}
	{/if}
</div>

<style>
	.initiative {
		width: 100%;
		background: var(--parchment-light);
		border: 1px solid var(--rule);
		border-top: 3px solid var(--gold);
		border-radius: 8px;
		box-shadow: 0 4px 14px rgba(43, 35, 23, 0.12);
		font-family: system-ui, sans-serif;
		font-size: 0.9rem;
		color: var(--ink);
	}
	.header {
		width: 100%;
		text-align: left;
		padding: 0.6rem 0.85rem;
		border: 0;
		background: none;
		font-family: var(--font-display);
		font-weight: 600;
		font-size: 1.05rem;
		color: var(--accent);
		cursor: pointer;
	}
	.list {
		max-height: none;
		overflow-y: auto;
		padding: 0 0.5rem;
	}
	.empty {
		color: var(--ink-soft);
		font-style: italic;
		margin: 0.3rem 0;
	}
	.entry {
		display: flex;
		align-items: center;
		gap: 0.3rem;
		padding: 0.3rem 0.2rem;
		border-top: 1px solid var(--rule);
	}
	.entry.active {
		background: var(--parchment-deep);
		box-shadow: inset 3px 0 0 var(--gold);
	}
	.nm {
		flex: 1;
		font-weight: 600;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.in {
		color: var(--ink-soft);
	}
	.hp {
		display: inline-flex;
		align-items: center;
		gap: 0.15rem;
	}
	.hp button {
		border: 1px solid var(--rule);
		background: var(--parchment-light);
		border-radius: 3px;
		cursor: pointer;
		width: 1.1rem;
	}
	.play {
		border: 0;
		background: none;
		cursor: pointer;
		color: var(--accent);
	}
	.rm {
		border: 0;
		background: none;
		cursor: pointer;
		color: var(--rule);
	}
	.add {
		display: flex;
		gap: 0.3rem;
		padding: 0.5rem;
		border-top: 1px solid var(--rule);
	}
	.add input {
		border: 1px solid var(--rule);
		border-radius: 4px;
		padding: 0.25rem 0.35rem;
		font-size: 0.8rem;
		min-width: 0;
	}
	.add .nm {
		flex: 1.4;
	}
	.add .in,
	.add .hp {
		width: 2.6rem;
	}
	.add button {
		border: 0;
		background: var(--accent);
		color: var(--parchment-light);
		border-radius: 4px;
		padding: 0.25rem 0.6rem;
		cursor: pointer;
	}
	.actions {
		display: flex;
		gap: 0.3rem;
		padding: 0 0.5rem 0.5rem;
	}
	.actions button {
		flex: 1;
		border: 1px solid var(--rule);
		background: var(--parchment-light);
		border-radius: 4px;
		padding: 0.3rem;
		cursor: pointer;
	}
</style>
