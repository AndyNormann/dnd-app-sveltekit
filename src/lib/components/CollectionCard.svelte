<script lang="ts">
	import type { CollectionRow, Monster } from '$lib/server/db';

	let {
		collection,
		monsters,
		campaignId,
		onchanged
	}: {
		collection: CollectionRow;
		monsters: Monster[];
		campaignId: string;
		onchanged: () => void;
	} = $props();

	let monSel = $state('');
	let monCount = $state('1');
	let itemErr = $state('');

	function monsterName(id: string) {
		return monsters.find((m) => m.id === id)?.name ?? '(missing monster)';
	}

	async function save(items: { monster_id: string; count: number }[], name = collection.name) {
		const res = await fetch(`/c/${campaignId}/combat/collections`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ action: 'save', id: collection.id, name, items })
		});
		return res.ok;
	}

	async function addItem(e: Event) {
		e.preventDefault();
		itemErr = '';
		if (!monSel) {
			itemErr = 'Pick a monster to add.';
			return;
		}
		const ok = await save([
			...collection.items,
			{ monster_id: monSel, count: Math.max(1, Math.floor(Number(monCount)) || 1) }
		]);
		if (ok) {
			monSel = '';
			monCount = '1';
			onchanged();
		} else itemErr = 'Could not update encounter';
	}

	async function removeItem(monster_id: string) {
		const ok = await save(collection.items.filter((it) => it.monster_id !== monster_id));
		if (ok) onchanged();
	}

	async function rename() {
		const name = prompt(`Name for encounter`, collection.name);
		if (!name || name.trim() === '' || name.trim() === collection.name) return;
		const ok = await save(collection.items, name.trim());
		if (ok) onchanged();
	}

	async function remove() {
		if (!confirm(`Delete collection "${collection.name}"?`)) return;
		const res = await fetch(`/c/${campaignId}/combat/collections`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ action: 'delete', id: collection.id })
		});
		if (res.ok) onchanged();
	}
</script>

<div class="coll">
	<div class="chead">
		<span class="cname">{collection.name}</span>
		<span class="cmeta">{collection.items.reduce((n, it) => n + it.count, 0)} monster{collection.items.reduce((n, it) => n + it.count, 0) === 1 ? '' : 's'}</span>
		<div class="cactions">
			<button type="button" class="tiny" title="Rename" aria-label="Rename collection" onclick={rename}>✎</button>
			<button type="button" class="tiny del" title="Delete collection" aria-label="Delete collection" onclick={remove}>✕</button>
		</div>
	</div>
	<form class="add-item" onsubmit={addItem}>
		<select class="nm" bind:value={monSel} aria-label="Monster to add to collection">
			<option value="">Pick monster…</option>
			{#each monsters as m (m.id)}
				<option value={m.id}>{m.name}</option>
			{/each}
		</select>
		<input class="num" placeholder="Count" title="How many" bind:value={monCount} maxlength="2" />
		<button type="submit">Add</button>
	</form>
	{#if itemErr}<p class="err">{itemErr}</p>{/if}
	{#if collection.items.length === 0}
		<p class="empty">Empty collection — add some enemies above.</p>
	{:else}
		<ul class="items">
			{#each collection.items as it (it.monster_id)}
				<li>
					<span class="iname">{it.count}× {monsterName(it.monster_id)}</span>
					<button type="button" class="tiny del" title="Remove from collection" aria-label="Remove from collection" onclick={() => removeItem(it.monster_id)}>✕</button>
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.coll {
		border: 1px solid var(--rule);
		border-radius: 8px;
		padding: 0.7rem;
		background: var(--parchment-deep);
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.chead {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
	.cname {
		font-family: var(--font-display);
		font-weight: 700;
		color: var(--ink);
	}
	.cmeta {
		flex: 1;
		font-size: 0.78rem;
		color: var(--ink-soft);
	}
	.cactions {
		display: inline-flex;
		gap: 0.3rem;
	}
	.tiny {
		border: 1px solid var(--rule);
		background: var(--parchment-light);
		color: var(--ink-soft);
		border-radius: 5px;
		padding: 0.15rem 0.4rem;
		cursor: pointer;
		font-size: 0.8rem;
	}
	.tiny.del {
		color: var(--danger);
	}
	.add-item {
		display: flex;
		gap: 0.35rem;
	}
	.add-item select {
		flex: 1;
		min-width: 0;
		border: 1px solid var(--rule);
		border-radius: 5px;
		padding: 0.3rem 0.4rem;
		font-size: 0.85rem;
		background: var(--parchment-light);
		color: var(--ink);
	}
	.add-item .num {
		width: 3.4rem;
		border: 1px solid var(--rule);
		border-radius: 5px;
		padding: 0.3rem 0.4rem;
		font-size: 0.85rem;
		background: var(--parchment-light);
		color: var(--ink);
	}
	.add-item button {
		border: 0;
		background: var(--accent);
		color: var(--parchment-light);
		border-radius: 5px;
		padding: 0.3rem 0.7rem;
		cursor: pointer;
	}
	.items {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}
	.items li {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.25rem 0.4rem;
		background: var(--parchment-light);
		border-radius: 5px;
	}
	.iname {
		flex: 1;
		font-size: 0.88rem;
		color: var(--ink);
	}
	.empty {
		color: var(--ink-soft);
		font-style: italic;
		font-size: 0.85rem;
		margin: 0;
	}
	.err {
		color: var(--danger);
		font-size: 0.8rem;
		margin: 0;
	}
</style>
