<script lang="ts">
	import { onMount } from 'svelte';
	import CombatBoard from '$lib/components/CombatBoard.svelte';
	import Initiative from '$lib/components/Initiative.svelte';
		import RollLog from '$lib/components/RollLog.svelte';
	import LiveStamp from '$lib/components/LiveStamp.svelte';
	import A11yLive from '$lib/components/A11yLive.svelte';
		import { applyFeedEvent, type FeedHandlers } from '$lib/feed';
	import type { PageData } from './$types';
	import type { CombatUnit, CombatDrawing, BoardConfig } from '$lib/server/db';

	let { data }: { data: PageData } = $props();

	let title = $state(data.title);
	let connected = $state(false);
	let lastActivity = $state(Date.now());
	function poke() {
		lastActivity = Date.now();
	}
	let units = $state<CombatUnit[]>(data.units);
	let drawings = $state<CombatDrawing[]>(data.drawings);
	let boardConfig = $state<BoardConfig>(data.boardConfig);
	let initiative: Initiative;
	let board: CombatBoard;
	let rollLog: RollLog;
	let activeName = $state(data.initiative.find((x: { active: number }) => x.active === 1)?.name ?? '');
	let activeUnitId = $state<string | null>(data.activeUnitId);
	const myUnitId = $derived(units.find((u) => u.character_id === data.character.id)?.id ?? null);
	const isMyTurn = $derived(activeUnitId != null && activeUnitId === myUnitId);
	let ready = $state(myUnitId != null && data.readyIds.includes(myUnitId));
	let a11y: A11yLive;
	$effect(() => {
		if (activeName) a11y?.announce(isMyTurn ? `Your turn. ${activeName} is active.` : `${activeName}'s turn.`);
	});

	async function toggleReady() {
		if (!myUnitId) return;
		const res = await fetch(`/c/${data.campaignId}/combat/ready`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ unitId: myUnitId, ready: !ready })
		});
		if (res.ok) {
			const body = (await res.json()) as { readyIds: string[] };
			ready = body.readyIds.includes(myUnitId);
		}
	}

	onMount(() => {
		const es = new EventSource(`/c/${data.campaignId}/events`);
		es.onopen = () => (connected = true);
		es.onerror = () => (connected = false);
		es.onmessage = (e) => {
			poke();
			applyFeedEvent(JSON.parse(e.data), feed);
		};
		const feed: FeedHandlers = {
			applyInitiative: (entries, r) => {
				initiative?.applyEntries(entries, r);
				const active = entries.find((x) => x.active === 1)?.unit_id ?? null;
				board?.setActiveUnitId(active);
				activeUnitId = active;
				activeName = entries.find((x) => x.active === 1)?.name ?? '';
				ready = false; // a new turn clears your ready state
			},
			applyCombatReady: (r) => (ready = myUnitId != null && r.includes(myUnitId)),
			applyCombatLog: (entry) => {
				rollLog?.addCombatLog(entry);
				a11y?.announce(entry.text);
			},
			addRoll: (roll) => { if (!roll.secret) rollLog?.addRoll(roll); },
			setRolls: (rolls) => rollLog?.setRolls(rolls),
			applySnapshot: (snapshot) => { title = snapshot.title; rollLog?.setRolls(snapshot.rolls); },
			applyCombatUnits: (u) => {
				units = u;
				board?.applyUnits(u);
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
			onTitle: (t) => (title = t)
		};
		return () => es.close();
	});
</script>

<svelte:head><title>{title} — Combat</title></svelte:head>

<nav class="tabs">
	<span class="you" title="You are connected as this character">Playing as {data.character.name}</span>
	<a href={`/p/${data.token}`} class="tab">Notes</a>
	<a href={`/p/${data.token}/combat`} class="tab" class:active={true}>Combat</a>
	</nav>

<A11yLive bind:this={a11y} />

<main class="combat">
	<div class="top">		<h1 class="campaign-title">{title}</h1>
		<div class="conn" class:on={connected} title={connected ? 'Live' : 'Reconnecting…'}></div>
		<LiveStamp at={lastActivity} />
	</div>
	<div class="layout">
		<section class="rail left">
			<Initiative
				bind:this={initiative}
				campaignId={data.campaignId}
				initial={data.initiative}
				initialRound={data.initiativeRound}
				units={units}
				viewerUnitId={myUnitId}
			/>
		</section>
		<section class="col">
			{#if activeName}
				<div class="turn-banner" class:mine={isMyTurn} aria-live="polite">
					{#if isMyTurn}✨ Your turn — go!{:else}⏳ Waiting on {activeName}…{/if}
				</div>
			{/if}
			<CombatBoard
				bind:this={board}
				campaignId={data.campaignId}
				dm={false}
				characterId={data.character.id}
				initialUnits={units}
				initialDrawings={drawings}
				initialConfig={boardConfig}
				activeUnitId={data.activeUnitId}
			/>
			{#if myUnitId}
				<button
					type="button"
					class="ready-btn"
					class:on={ready}
					onclick={toggleReady}
					title={ready ? 'Click to mark yourself not done' : 'Mark yourself done'}
					>{ready ? '✅ Done' : 'I\'m done'}</button
				>
			{/if}
		</section>
		<section class="rail right sidebar activity-sidebar">
			<RollLog bind:this={rollLog} campaignId={data.campaignId} initial={data.rolls} initialCombat={data.logs} />
		</section>
	</div>
</main>

<style>
	.tabs {
		display: flex;
		justify-content: center;
		align-items: center;
		gap: 0.25rem;
		padding: 0.75rem 0 0;
	}
	.tabs {
		position: relative;
	}
	.you {
		margin-right: 0.6rem;
		font-family: var(--font-display);
		font-weight: 600;
		color: var(--accent);
	}
	.tab {
		text-decoration: none;
		font-size: 0.85rem;
		padding: 0.4rem 1rem;
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
	.combat {
		max-width: 96rem;
		margin: 1rem auto;
		padding: 0 1rem;
	}
	.top {
		position: relative;
		margin-bottom: 1rem;
	}
	.layout {
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
	}
	.sidebar {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		min-height: 0;
		align-self: stretch;
	}
	.sidebar :global(.roll-log) {
		min-height: 0;
		flex: 1;
	}
	.activity-sidebar {
		gap: 0;
		overflow: hidden;
		background: var(--parchment-light);
		border: 1px solid var(--rule);
		border-top: 3px solid var(--gold);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-md);
	}
	.activity-sidebar :global(.roll-log) {
		border: 0;
		border-radius: 0;
		box-shadow: none;
		background: transparent;
		height: min(32rem, calc(100vh - 8rem));
	}

	@media (max-width: 72rem) {
		.layout {
			grid-template-columns: 1fr;
		}
		.rail {
			position: static;
			max-height: none;
			overflow: visible;
		}
		.activity-sidebar :global(.roll-log) {
			height: min(22rem, 55vh);
		}
	}
	.campaign-title {
		font-family: var(--font-display);
		font-weight: 700;
		color: var(--accent);
		text-align: center;
		letter-spacing: 0.04em;
		border-bottom: 3px double var(--gold);
		padding-bottom: 0.6rem;
	}
	.conn {
		position: absolute;
		top: 1rem;
		right: 1rem;
		width: 0.6rem;
		height: 0.6rem;
		border-radius: 50%;
		background: transparent;
		border: 1.5px solid var(--danger);
	}
	.conn.on {
		background: var(--success);
		border-color: var(--success);
	}
	.turn-banner {
		text-align: center;
		font-family: var(--font-display);
		font-size: 1rem;
		font-weight: 600;
		padding: 0.5rem;
		margin: 0 0 1rem;
		border-radius: 6px;
		border: 1px solid var(--rule);
		background: var(--parchment-deep);
		color: var(--ink-soft);
	}
	.turn-banner.mine {
		background: #1f5d2b;
		border-color: var(--success);
		color: #f6f1e3;
		box-shadow: 0 0 0 2px rgba(58, 155, 69, 0.4);
	}
	.ready-btn {
		display: block;
		margin: 0.75rem auto 0;
		border: 1px solid var(--gold);
		background: var(--parchment-deep);
		color: var(--ink-soft);
		border-radius: 6px;
		padding: 0.5rem 1.4rem;
		cursor: pointer;
		font-family: var(--font-ui);
		font-weight: 600;
		font-size: 0.95rem;
	}
	.ready-btn.on {
		background: #1f5d2b;
		border-color: var(--success);
		color: #f6f1e3;
	}
</style>
