<script lang="ts">
	import { onMount } from 'svelte';
	import CollectionCard from '$lib/components/CollectionCard.svelte';
	import { applyFeedEvent, type FeedHandlers } from '$lib/feed';
	import type { PageData } from './$types';
	import type { CharacterRow, Monster, CollectionRow } from '$lib/server/db';
	
	let { data }: { data: PageData } = $props();

	let title = $state(data.title);
	let connected = $state(false);
	let characters = $state<CharacterRow[]>(data.characters);
	let monsters = $state<Monster[]>(data.monsters);
	let collections = $state<CollectionRow[]>(data.collections);
	let newColName = $state('');
	let colErr = $state('');
	let actionError = $state('');

	// character form
	let charName = $state('');
	let charPlayer = $state('');
	let charSpeed = $state('30');
	let charInit = $state('0');
	let charHp = $state('');
	let charColor = $state('#1b6ca8');

	// monster form
	let monName = $state('');
	let monSpeed = $state('30');
	let monInit = $state('0');
	let monHp = $state('');
	let monColor = $state('#a33');
	let editingMonId = $state<string | null>(null);

	let toast = $state<string | null>(null);
	let toastTimer: ReturnType<typeof setTimeout>;

	function showToast(msg: string) {
		toast = msg;
		clearTimeout(toastTimer);
		toastTimer = setTimeout(() => (toast = null), 2000);
	}

	function linkFor(c: CharacterRow) {
		return `${location.origin}/p/${c.link_token}`;
	}
	function copyLink(c: CharacterRow) {
		navigator.clipboard?.writeText(linkFor(c)).then(
			() => showToast(`Link for ${c.name} copied`),
			() => showToast('Could not copy link')
		);
	}

	async function addCharacter(e: Event) {
		e.preventDefault();
		if (!charName.trim()) return;
		const res = await fetch(`/c/${data.campaignId}/characters`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				name: charName,
				player_name: charPlayer,
				speed: charSpeed,
				init_bonus: charInit,
				max_hp: charHp,
				color: charColor
			})
		});
		if (!res.ok) { actionError = 'Could not create character'; return; }
		const ch = (await res.json()) as CharacterRow;
		characters = [...characters, ch];
		charName = '';
		charPlayer = '';
		charSpeed = '30';
		charInit = '0';
		charHp = '';
		showToast(`Created ${ch.name}`);
	}

	async function deleteCharacter(id: string) {
		const character = characters.find((c) => c.id === id);
		if (!character || !confirm(`Delete ${character.name}? This also removes its combat link.`)) return;
		actionError = '';
		const res = await fetch(`/c/${data.campaignId}/characters/${id}`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ action: 'delete' })
		});
		if (!res.ok) { actionError = 'Could not delete character'; return; }
		characters = characters.filter((c) => c.id !== id);
		showToast('Character deleted');
	}

	async function addMonster(e: Event) {
		e.preventDefault();
		if (!monName.trim()) return;
		const res = await fetch(`/c/${data.campaignId}/monsters`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				name: monName,
				speed: monSpeed,
				init_bonus: monInit,
				max_hp: monHp,
				color: monColor
			})
		});
		if (!res.ok) { actionError = 'Could not create monster'; return; }
		const m = (await res.json()) as Monster;
		monsters = [...monsters, m];
		monName = '';
		monSpeed = '30';
		monInit = '0';
		monHp = '';
		showToast(`Created ${m.name}`);
	}

	function startEditMonster(m: Monster) {
		editingMonId = m.id;
		monName = m.name;
		monSpeed = String(m.speed);
		monInit = String(m.init_bonus);
		monHp = String(m.max_hp);
		monColor = m.color;
	}

	async function saveMonsterEdit(e: Event) {
		e.preventDefault();
		if (!editingMonId || !monName.trim()) return;
		const res = await fetch(`/c/${data.campaignId}/monsters/${editingMonId}`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				action: 'update',
				name: monName,
				speed: monSpeed,
				init_bonus: monInit,
				max_hp: monHp,
				color: monColor
			})
		});
		if (!res.ok) return;
		const updated = (await res.json()) as Monster;
		monsters = monsters.map((m) => (m.id === updated.id ? updated : m));
		cancelEditMonster();
		showToast('Saved');
	}

	function cancelEditMonster() {
		editingMonId = null;
		monName = '';
		monSpeed = '30';
		monInit = '0';
		monHp = '';
	}

	async function deleteMonster(id: string) {
		const monster = monsters.find((m) => m.id === id);
		if (!monster || !confirm(`Delete ${monster.name}?`)) return;
		const res = await fetch(`/c/${data.campaignId}/monsters/${id}`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ action: 'delete' })
		});
		if (!res.ok) { actionError = 'Could not delete monster'; return; }
		monsters = monsters.filter((m) => m.id !== id);
		showToast('Monster deleted');
	}

	async function refreshCharacters() {
		const res = await fetch(`/c/${data.campaignId}/characters`);
		if (res.ok) characters = await res.json();
	}
	async function refreshMonsters() {
		const res = await fetch(`/c/${data.campaignId}/monsters`);
		if (res.ok) monsters = await res.json();
	}
	async function refreshCollections() {
		const res = await fetch(`/c/${data.campaignId}/combat/collections`);
		if (res.ok) collections = await res.json();
	}
	async function createCollection(e: Event) {
		e.preventDefault();
		colErr = '';
		const name = newColName.trim();
		if (!name) return;
		const res = await fetch(`/c/${data.campaignId}/combat/collections`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ action: 'save', name, items: [] })
		});
		if (!res.ok) colErr = 'Could not create encounter';
		else {
			newColName = '';
			refreshCollections();
			showToast('Encounter created');
		}
	}

	onMount(() => {
		const es = new EventSource(`/c/${data.campaignId}/events`);
		es.onopen = () => (connected = true);
		es.onerror = () => (connected = false);
		es.onmessage = (e) => applyFeedEvent(JSON.parse(e.data), feed);
		const feed: FeedHandlers = {
			onCharacters: () => refreshCharacters(),
			onMonsters: () => refreshMonsters(),
			onTitle: (t) => (title = t)
		};
		return () => es.close();
	});
</script>

<svelte:head><title>{title} — Roster</title></svelte:head>



<main class="roster">
	{#if actionError}<p class="error" role="alert">{actionError}</p>{/if}
	<section class="panel">
		<h2>Characters</h2>
		<form class="add-char" onsubmit={addCharacter}>
			<input class="nm" aria-label="Character name" placeholder="Character" bind:value={charName} maxlength="60" />
			<input class="pn" aria-label="Player name" placeholder="Player name" bind:value={charPlayer} maxlength="60" />
			<input class="num" aria-label="Speed in feet" placeholder="Speed" title="Speed (ft)" bind:value={charSpeed} maxlength="4" />
			<input class="num" aria-label="Initiative bonus" placeholder="Init+" title="Init bonus" bind:value={charInit} maxlength="4" />
			<input class="num" aria-label="Maximum hit points" placeholder="Max HP" bind:value={charHp} maxlength="6" />
			<input class="color" aria-label="Character token color" type="color" bind:value={charColor} title="Token color" />
			<button type="submit">Add</button>
		</form>
		{#if characters.length === 0}
			<p class="empty">No characters yet. Create one, then send them their player link.</p>
		{/if}
		<ul class="char-list">
			{#each characters as c (c.id)}
				<li>
					<span class="dot" style="background:{c.color}"></span>
					<span class="cname">{c.name}</span>
					<span class="cmeta">{c.player_name ? c.player_name + ' · ' : ''}{c.speed}ft · init {c.init_bonus >= 0 ? '+' : ''}{c.init_bonus} · {c.hp}/{c.max_hp}hp</span>
					<button type="button" class="tiny" title="Copy player link" aria-label="Copy player link" onclick={() => copyLink(c)}>🔗</button>
					<button type="button" class="tiny" title="Delete" aria-label="Delete" onclick={() => deleteCharacter(c.id)}>✕</button>
				</li>
			{/each}
		</ul>
	</section>

	<section class="panel">
		<h2>Monsters</h2>
		<form class="add-char" onsubmit={editingMonId ? saveMonsterEdit : addMonster}>
			<input class="nm" aria-label="Monster name" placeholder="Monster name" bind:value={monName} maxlength="60" />
			<input class="num" aria-label="Monster speed in feet" placeholder="Speed" title="Speed (ft)" bind:value={monSpeed} maxlength="4" />
			<input class="num" aria-label="Monster initiative bonus" placeholder="Init+" title="Init bonus" bind:value={monInit} maxlength="4" />
			<input class="num" aria-label="Monster maximum hit points" placeholder="Max HP" bind:value={monHp} maxlength="6" />
			<input class="color" aria-label="Monster token color" type="color" bind:value={monColor} title="Token color" />
			{#if editingMonId}
				<button type="submit">Save</button>
				<button type="button" onclick={cancelEditMonster}>Cancel</button>
			{:else}
				<button type="submit">Add</button>
			{/if}
		</form>
		{#if monsters.length === 0}
			<p class="empty">No monsters yet. Add reusable monster templates, then drop them into encounters on the Combat page.</p>
		{/if}
		<ul class="char-list">
			{#each monsters as m (m.id)}
				<li>
					<span class="dot" style="background:{m.color}"></span>
					<span class="cname">{m.name}</span>
					<span class="cmeta">{m.speed}ft · init {m.init_bonus >= 0 ? '+' : ''}{m.init_bonus} · {m.max_hp}hp</span>
					<button type="button" class="tiny" title="Edit" aria-label="Edit" onclick={() => startEditMonster(m)}>✎</button>
					<button type="button" class="tiny" title="Delete" aria-label="Delete" onclick={() => deleteMonster(m.id)}>✕</button>
				</li>
			{/each}
		</ul>
	</section>

	<section class="panel collections">
		<h2>Encounters</h2>
		<p class="hint">Build reusable enemy groups, then drop one onto the board from the Combat page.</p>
		<form class="new-col" onsubmit={createCollection}>
			<input class="nm" placeholder="Encounter name" bind:value={newColName} maxlength="60" />
			<button type="submit">Create encounter</button>
		</form>
		{#if colErr}<p class="error">{colErr}</p>{/if}
		{#if collections.length === 0}
			<p class="empty">No collections yet. Create one, then add enemies to it.</p>
		{:else}
			<div class="coll-grid">
				{#each collections as coll (coll.id)}
					<CollectionCard
						collection={coll}
						monsters={monsters}
						campaignId={data.campaignId}
						onchanged={refreshCollections}
					/>
				{/each}
			</div>
		{/if}
	</section>
</main>

{#if toast}<div class="toast" role="status">{toast}</div>{/if}

<style>
	.bar {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.6rem 1rem;
		background: var(--parchment-light);
		border-bottom: 2px solid var(--rule);
		font-family: var(--font-ui);
	}
	.bar h1 {
		font-family: var(--font-display);
		font-size: 1.1rem;
		margin: 0;
		color: var(--accent);
	}
	.crumb {
		width: 16rem;
		max-width: 16rem;
		flex: none;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-weight: 600;
	}
	.gsep {
		width: 1px;
		height: 1.4rem;
		background: var(--rule);
	}
	.back {
		text-decoration: none;
		font-size: 1.2rem;
		color: var(--ink-soft);
	}
	.spacer {
		flex: 1;
	}
	.tabs {
		display: inline-flex;
		gap: 0.25rem;
		margin-left: 0.5rem;
	}
	.tab {
		text-decoration: none;
		font-size: 0.85rem;
		padding: 0.35rem 0.7rem;
		border: 1px solid var(--rule);
		border-radius: 6px;
		color: var(--ink-soft);
		background: var(--parchment-light);
	}
	.tab.active {
		color: var(--accent);
		border-color: var(--gold);
		background: var(--parchment-deep);
	}
	.conn {
		width: 0.6rem;
		height: 0.6rem;
		border-radius: 50%;
		background: transparent;
		border: 1.5px solid var(--danger);
		flex: none;
	}
	.conn.on {
		background: var(--success);
		border-color: var(--success);
	}
	.bar button {
		font-size: 0.85rem;
		padding: 0.4rem 0.7rem;
		border: 1px solid var(--rule);
		border-radius: 6px;
		background: var(--parchment-light);
		cursor: pointer;
		color: var(--ink-soft);
		transition: background 0.12s ease, border-color 0.12s ease, color 0.12s ease;
	}
	.bar button:hover {
		background: var(--parchment-deep);
		border-color: var(--accent);
		color: var(--ink);
	}
	.logout {
		margin: 0;
	}
	.logout button {
		border: 1px solid var(--accent-soft);
		color: var(--accent-soft);
	}
	.roster {
		max-width: 56rem;
		margin: 1rem auto;
		padding: 0 1rem;
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1rem;
		align-items: start;
	}
	.collections {
		grid-column: 1 / -1;
	}
	.hint {
		color: var(--ink-soft);
		font-size: 0.85rem;
		margin: 0 0 0.6rem;
	}
	.new-col {
		display: flex;
		gap: 0.35rem;
		margin-bottom: 0.6rem;
	}
	.new-col input {
		flex: 1;
		min-width: 0;
		border: 1px solid var(--rule);
		border-radius: 5px;
		padding: 0.3rem 0.4rem;
		font-size: 0.85rem;
		background: var(--parchment-deep);
		color: var(--ink);
	}
	.new-col button {
		border: 0;
		background: var(--accent);
		color: var(--parchment-light);
		border-radius: 5px;
		padding: 0.3rem 0.7rem;
		cursor: pointer;
	}
	.error {
		color: var(--danger);
		font-size: 0.85rem;
		margin: 0 0 0.5rem;
	}
	.coll-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(16rem, 1fr));
		gap: 0.6rem;
	}
	@media (max-width: 48rem) {
		.roster {
			grid-template-columns: 1fr;
		}
		.bar {
			flex-wrap: wrap;
		}
		.bar h1 {
			min-width: 0;
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
			flex: 1;
		}
	}
	.panel {
		background: var(--parchment-light);
		border: 1px solid var(--rule);
		border-radius: 8px;
		padding: 0.9rem;
	}
	.panel h2 {
		font-family: var(--font-display);
		color: var(--accent);
		margin: 0 0 0.6rem;
		font-size: 1rem;
	}
	.add-char {
		display: flex;
		gap: 0.35rem;
		flex-wrap: wrap;
		margin-bottom: 0.6rem;
	}
	.add-char input {
		border: 1px solid var(--rule);
		border-radius: 5px;
		padding: 0.3rem 0.4rem;
		font-size: 0.85rem;
		min-width: 0;
	}
	.add-char .nm {
		flex: 1 1 9rem;
	}
	.add-char .pn {
		flex: 1 1 8rem;
	}
	.add-char .num {
		width: 3.4rem;
	}
	.add-char input.color {
		width: 2.4rem;
		padding: 0.1rem;
	}
	.add-char button {
		border: 0;
		background: var(--accent);
		color: var(--parchment-light);
		border-radius: 5px;
		padding: 0.3rem 0.7rem;
		cursor: pointer;
	}
	.empty {
		color: var(--ink-soft);
		font-style: italic;
		font-size: 0.9rem;
	}
	.char-list {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.char-list li {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.3rem 0;
		border-top: 1px solid var(--rule);
	}
	.char-list .dot {
		width: 0.9rem;
		height: 0.9rem;
		border-radius: 50%;
		flex: none;
	}
	.char-list .cname {
		font-weight: 600;
		min-width: 6rem;
	}
	.char-list .cmeta {
		flex: 1;
		color: var(--ink-soft);
		font-size: 0.8rem;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.tiny {
		border: 1px solid var(--rule);
		background: var(--parchment-deep);
		color: var(--ink-soft);
		border-radius: 5px;
		padding: 0.15rem 0.4rem;
		cursor: pointer;
		font-size: 0.8rem;
	}
	.toast {
		position: fixed;
		right: 1.25rem;
		bottom: 1.25rem;
		background: var(--parchment-light);
		color: var(--ink);
		border: 1px solid var(--success);
		border-radius: var(--radius-md);
		padding: 0.6rem 1rem;
		box-shadow: var(--shadow-lg);
		z-index: 2000;
		animation: toast-in 0.18s ease;
	}
	@keyframes toast-in {
		from {
			opacity: 0;
			transform: translateY(6px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}
</style>
