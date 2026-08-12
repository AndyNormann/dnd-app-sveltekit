<script lang="ts">
	import { onMount } from 'svelte';
	import CombatBoard from '$lib/components/CombatBoard.svelte';
	import Initiative from '$lib/components/Initiative.svelte';
	import CombatLog from '$lib/components/CombatLog.svelte';
	import type { PageData } from './$types';
	import type { CombatUnit, CombatDrawing, BoardConfig } from '$lib/server/db';

	let { data }: { data: PageData } = $props();

	let title = $state(data.title);
	let connected = $state(false);
	let units = $state<CombatUnit[]>(data.units);
	let drawings = $state<CombatDrawing[]>(data.drawings);
	let boardConfig = $state<BoardConfig>(data.boardConfig);
	let initiative: Initiative;
	let board: CombatBoard;
	let log: CombatLog;
	let activeName = $state(data.initiative.find((x: { active: number }) => x.active === 1)?.name ?? '');
	let activeUnitId = $state<string | null>(data.activeUnitId);
	const myUnitId = $derived(units.find((u) => u.character_id === data.character.id)?.id ?? null);
	const isMyTurn = $derived(activeUnitId != null && activeUnitId === myUnitId);

	onMount(() => {
		const es = new EventSource(`/c/${data.campaignId}/events`);
		es.onopen = () => (connected = true);
		es.onerror = () => (connected = false);
		es.onmessage = (e) => {
			const ev = JSON.parse(e.data);
			switch (ev.type) {
				case 'initiative-updated': {
					initiative?.applyEntries(ev.entries, ev.round);
					const active = ev.entries.find((x: { active: number }) => x.active === 1)?.unit_id ?? null;
					board?.setActiveUnitId(active);
					activeUnitId = active;
					activeName = ev.entries.find((x: { active: number }) => x.active === 1)?.name ?? '';
					break;
				}
				case 'combat-log':
					log?.add(ev.entry);
					break;
				case 'combat-units-updated':
					units = ev.units;
					board?.applyUnits(ev.units);
					break;
				case 'combat-drawings-updated':
					drawings = ev.drawings;
					board?.applyDrawings(ev.drawings);
					break;
				case 'board-config-updated':
					boardConfig = ev.config;
					board?.applyConfig(ev.config);
					break;
				case 'title-changed':
					title = ev.title;
					break;
			}
		};
		return () => es.close();
	});
</script>

<svelte:head><title>{title} — Combat</title></svelte:head>

<nav class="tabs">
	<span class="you">{data.character.name}</span>
	<a href={`/p/${data.token}`} class="tab">Notes</a>
	<a href={`/p/${data.token}/combat`} class="tab" class:active={true}>Combat</a>
</nav>

<main class="combat">
	<h1 class="campaign-title">{title}</h1>
	<div class="conn" class:on={connected} title={connected ? 'Live' : 'Reconnecting…'}></div>
	{#if activeName}
		<div class="turn-banner" class:mine={isMyTurn}>
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
	<section class="order">
		<Initiative
			bind:this={initiative}
			campaignId={data.campaignId}
			initial={data.initiative}
			initialRound={data.initiativeRound}
			units={units}
			viewerUnitId={myUnitId}
		/>
	</section>
	<section class="clog">
		<CombatLog bind:this={log} initial={data.logs} />
	</section>
</main>

<style>
	.tabs {
		display: flex;
		justify-content: center;
		align-items: center;
		gap: 0.25rem;
		padding: 0.75rem 0 0;
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
		max-width: 64rem;
		margin: 1rem auto;
		padding: 0 1rem;
		position: relative;
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
		background: #c33;
	}
	.conn.on {
		background: #3a9b45;
	}
	.order {
		margin-top: 1rem;
	}
	.clog {
		margin-top: 1rem;
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
		border-color: #3a9b45;
		color: #f6f1e3;
		box-shadow: 0 0 0 2px rgba(58, 155, 69, 0.4);
	}
</style>
