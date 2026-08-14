<script lang="ts">
	import { onMount } from 'svelte';
	import CombatBoard from '$lib/components/CombatBoard.svelte';
	import Initiative from '$lib/components/Initiative.svelte';
	import CombatLog from '$lib/components/CombatLog.svelte';
	import A11yLive from '$lib/components/A11yLive.svelte';
	import { applyFeedEvent, type FeedHandlers } from '$lib/feed';
	import type { PageData } from './$types';
	import type {
		Monster,
		CombatUnit,
		CombatDrawing,
		BoardConfig,
		CollectionRow
	} from '$lib/server/db';

	let { data }: { data: PageData } = $props();

	let title = $state(data.title);
	let connected = $state(false);
	let units = $state<CombatUnit[]>(data.units);
	let drawings = $state<CombatDrawing[]>(data.drawings);
	let boardConfig = $state<BoardConfig>(data.boardConfig);
	let monsters = $state<Monster[]>(data.monsters);
	let combatLog: CombatLog;
	let initiative: Initiative;
	let board: CombatBoard;
	let activeName = $state('');
	let round = $state(data.initiativeRound);

	let collections = $state<CollectionRow[]>(data.collections);
	let collSel = $state('');
	let collErr = $state('');
	let readyIds = $state<string[]>(data.readyIds);
	let a11y: A11yLive;
	let errorMsg = $state('');
	let toast = $state<string | null>(null);
	let toastTimer: ReturnType<typeof setTimeout>;

	function showToast(msg: string) {
		toast = msg;
		clearTimeout(toastTimer);
		toastTimer = setTimeout(() => (toast = null), 2000);
	}

	function rollInitiative() {
		errorMsg = '';
		fetch(`/c/${data.campaignId}/initiative`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ action: 'roll' })
		});
	}

	function clearBoard() {
		errorMsg = '';
		fetch(`/c/${data.campaignId}/combat/units`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ action: 'clear' })
		});
		showToast('Board cleared');
	}

	// --- encounter save/load + ready signalling ---

	const readyNames = $derived(
		units
			.filter((u) => readyIds.includes(u.id))
			.map((u) => u.name)
			.join(', ')
	);
	const playerCount = $derived(units.filter((u) => u.kind === 'player').length);

	async function refreshCollections() {
		const res = await fetch(`/c/${data.campaignId}/combat/collections`);
		if (res.ok) collections = await res.json();
	}

	async function spawnCollection() {
		collErr = '';
		if (!collSel) return;
		const res = await fetch(`/c/${data.campaignId}/combat/units`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ action: 'add-collection', collection_id: collSel })
		});
		if (!res.ok) collErr = 'Could not add collection';
		else showToast('Collection added');
	}

	function clearReady() {
		fetch(`/c/${data.campaignId}/combat/ready`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ action: 'reset' })
		});
	}

	onMount(() => {
		refreshCollections();
		const es = new EventSource(`/c/${data.campaignId}/events`);
		es.onopen = () => (connected = true);
		es.onerror = () => (connected = false);
		es.onmessage = (e) => applyFeedEvent(JSON.parse(e.data), feed);
		const feed: FeedHandlers = {
			applyInitiative: (entries, r) => {
				initiative?.applyEntries(entries, r);
				const active = entries.find((x) => x.active === 1)?.unit_id ?? null;
				board?.setActiveUnitId(active);
				activeName = entries.find((x) => x.active === 1)?.name ?? '';
				round = r;
				readyIds = []; // a new turn clears everyone's ready state
			},
			applyCombatReady: (r) => (readyIds = r),
			applyCombatUnits: (u) => {
				units = u;
				board?.applyUnits(u);
			},
			applyCombatLog: (entry) => {
				combatLog?.add(entry);
				a11y?.announce(entry.text);
			},
			applyCombatDrawings: (d) => {
				drawings = d;
				board?.applyDrawings(d);
			},
			applyBoardConfig: (config) => {
				boardConfig = config;
				board?.applyConfig(config);
			},
			applyCombatPing: (ping) => board?.applyPing(ping),
			onMonsters: () => refreshMonsters(),
			onTitle: (t) => (title = t)
		};
		return () => es.close();
	});

	function onKeydown(e: KeyboardEvent) {
		// N / Space advances the turn (DM only)
		if (e.key === 'n' || e.key === 'N' || e.key === ' ') {
			// ignore when typing in an input
			const tag = (e.target as HTMLElement)?.tagName;
			if (tag === 'INPUT' || tag === 'TEXTAREA') return;
			e.preventDefault();
			initiative?.advance();
		}
	}

	async function refreshMonsters() {
		const res = await fetch(`/c/${data.campaignId}/monsters`);
		if (res.ok) monsters = await res.json();
	}
</script>

<svelte:head><title>{title} — Combat</title></svelte:head>

<svelte:window onkeydown={onKeydown} />

<A11yLive bind:this={a11y} />

<header class="bar">
	<a href="/" class="back">←</a>
	<span class="conn" class:on={connected} title={connected ? 'Realtime connected' : 'Realtime disconnected'}></span>
	<h1>{title}</h1>
	<nav class="tabs">
		<a href={`/c/${data.campaignId}`} class="tab">Notes</a>
		<a href={`/c/${data.campaignId}/combat`} class="tab" class:active={true}>Combat</a>
		<a href={`/c/${data.campaignId}/combat/roster`} class="tab">Roster</a>
	</nav>
	<div class="spacer"></div>
	<a href={`/c/${data.campaignId}/play/combat`} target="_blank" rel="noreferrer">Spectate</a>
	<form method="POST" action="/logout" class="logout">
		<button type="submit" title="Log out as DM">Log out</button>
	</form>
</header>

<main class="combat">
	<section class="panel rail left">
		<Initiative
			bind:this={initiative}
			campaignId={data.campaignId}
			dm
			initial={data.initiative}
			initialRound={data.initiativeRound}
			units={units}
		/>
		<div class="init-actions">
			<button type="button" class="big" onclick={rollInitiative}>🎲 Roll initiative</button>
			<form class="add-encounter" onsubmit={(e) => { e.preventDefault(); spawnCollection(); }}>
				<select class="nm enc-select" bind:value={collSel} aria-label="Collection to add">
					<option value="">Pick collection…</option>
					{#each collections as coll (coll.id)}
						<option value={coll.id}>{coll.name}</option>
					{/each}
				</select>
				<button type="submit">Add collection</button>
			</form>
			{#if collErr}<p class="error">{collErr}</p>{/if}
		</div>
	</section>

	<section class="col">
		<section class="panel board">
			{#if activeName}
				<div class="turn-status">Round <b>{round}</b> · {activeName}'s turn <kbd>N</kbd></div>
			{/if}
			{#if playerCount > 0}
				<div class="ready-status">
					<button type="button" class="clear-ready" onclick={clearReady} title="Clear all ready states">✕</button>
					<span>🟢 {readyIds.length}/{playerCount} ready{readyNames ? ` · ${readyNames}` : ''}</span>
				</div>
			{/if}
			<CombatBoard
				bind:this={board}
				campaignId={data.campaignId}
				dm
				initialUnits={units}
				initialDrawings={drawings}
				initialConfig={boardConfig}
				activeUnitId={data.activeUnitId}
				onClearBoard={clearBoard}
			/>
		</section>

		{#if errorMsg}<p class="error">{errorMsg}</p>{/if}
	</section>

	<section class="panel rail right">
		<CombatLog bind:this={combatLog} initial={data.logs} />
	</section>
</main>

{#if toast}<div class="toast">{toast}</div>{/if}

<style>
	.bar {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.6rem 1rem;
		background: var(--parchment-light);
		border-bottom: 2px solid var(--rule);
		font-family: system-ui, sans-serif;
	}
	.bar h1 {
		font-family: var(--font-display);
		font-size: 1.1rem;
		margin: 0;
		color: var(--accent);
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
		border: 1.5px solid #c33;
		flex: none;
	}
	.conn.on {
		background: #3a9b45;
		border-color: #3a9b45;
	}
	.bar button,
	.bar a[target] {
		font-size: 0.85rem;
		padding: 0.4rem 0.7rem;
		border: 1px solid var(--rule);
		border-radius: 6px;
		background: var(--parchment-light);
		cursor: pointer;
		text-decoration: none;
		color: var(--ink-soft);
	}
	.logout {
		margin: 0;
	}
	.logout button {
		border: 1px solid var(--accent-soft);
		color: var(--accent-soft);
	}
	.combat {
		max-width: 96rem;
		margin: 1rem auto;
		padding: 0 1rem;
		display: grid;
		grid-template-columns: minmax(15rem, 19rem) 1fr minmax(15rem, 19rem);
		gap: 1rem;
		align-items: start;
	}
	.col {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		min-width: 0;
	}
	.rail {
		position: sticky;
		top: 1rem;
		max-height: calc(100vh - 2rem);
		overflow-y: auto;
		margin-bottom: 0;
	}
	.board {
		overflow-x: auto;
	}
	@media (max-width: 72rem) {
		.combat {
			grid-template-columns: 1fr;
		}
		.rail {
			position: static;
			max-height: none;
			overflow: visible;
		}
	}
	.panel {
		background: var(--parchment-light);
		border: 1px solid var(--rule);
		border-radius: 8px;
		padding: 0.9rem;
		margin-bottom: 1rem;
	}
	.turn-status {
		font-family: var(--font-display);
		font-size: 0.95rem;
		font-weight: 600;
		color: var(--ink);
		margin-bottom: 0.6rem;
		padding: 0.4rem 0.7rem;
		background: var(--parchment-deep);
		border: 1px solid var(--gold);
		border-radius: 6px;
		display: inline-block;
	}
	.turn-status kbd {
		font-family: inherit;
		font-size: 0.7rem;
		color: var(--ink-soft);
		border: 1px solid var(--rule);
		border-radius: 4px;
		padding: 0.05rem 0.35rem;
		margin-left: 0.4rem;
		background: var(--parchment-light);
	}
	.init-actions {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		margin-top: 0.8rem;
		padding-top: 0.8rem;
		border-top: 1px solid var(--rule);
	}
	.add-encounter {
		display: flex;
		gap: 0.35rem;
		flex-wrap: wrap;
	}
	.add-encounter input,
	.add-encounter select {
		border: 1px solid var(--rule);
		border-radius: 5px;
		padding: 0.3rem 0.4rem;
		font-size: 0.85rem;
		min-width: 0;
		background: var(--parchment-deep);
		color: var(--ink);
	}
	.add-encounter .nm {
		flex: 1 1 10rem;
	}
	.add-encounter .num {
		width: 3.4rem;
	}
	.add-encounter .enc-select {
		flex: 1 1 10rem;
	}
	.add-encounter button {
		border: 0;
		background: var(--accent);
		color: var(--parchment-light);
		border-radius: 5px;
		padding: 0.3rem 0.7rem;
		cursor: pointer;
	}
	.big {
		border: 0;
		background: var(--accent);
		color: var(--parchment-light);
		border-radius: 6px;
		padding: 0.5rem 0.9rem;
		cursor: pointer;
		font-family: var(--font-display);
		font-weight: 600;
	}
	.error {
		color: var(--danger);
		font-size: 0.9rem;
	}
	.toast {
		position: fixed;
		right: 1.25rem;
		bottom: 1.25rem;
		z-index: 2000;
		padding: 0.6rem 1rem;
		background: var(--parchment-light);
		border: 1px solid var(--gold);
		border-left: 4px solid #3a9b45;
		border-radius: 6px;
		box-shadow: var(--shadow-lg);
		font-family: var(--font-body);
		color: var(--ink);
	}
	.ready-status {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		font-size: 0.82rem;
		color: var(--ink-soft);
		margin-bottom: 0.6rem;
		padding: 0.3rem 0.6rem;
		background: var(--parchment-deep);
		border: 1px solid var(--rule);
		border-radius: 6px;
	}
	.clear-ready {
		border: 0;
		background: none;
		color: var(--ink-soft);
		cursor: pointer;
		font-size: 0.85rem;
		padding: 0 0.1rem;
	}
</style>
