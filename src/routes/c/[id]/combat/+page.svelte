<script lang="ts">
	import { onMount } from 'svelte';
	import Initiative from '$lib/components/Initiative.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let title = $state(data.title);
	let connected = $state(false);
	let initiative: Initiative;

	onMount(() => {
		const es = new EventSource(`/c/${data.campaignId}/events`);
		es.onopen = () => (connected = true);
		es.onerror = () => (connected = false);
		es.onmessage = (e) => {
			const ev = JSON.parse(e.data);
			if (ev.type === 'initiative-updated') initiative?.applyEntries(ev.entries, ev.round);
			else if (ev.type === 'title-changed') title = ev.title;
		};
		return () => es.close();
	});
</script>

<svelte:head><title>{title} — Combat</title></svelte:head>

<header class="bar">
	<a href="/" class="back">←</a>
	<span
		class="conn"
		class:on={connected}
		title={connected ? 'Realtime connected' : 'Realtime disconnected'}
	></span>
	<h1>{title}</h1>
	<nav class="tabs">
		<a href={`/c/${data.campaignId}`} class="tab">Notes</a>
		<a href={`/c/${data.campaignId}/combat`} class="tab" class:active={true}>Combat</a>
	</nav>
	<div class="spacer"></div>
	<a href={`/c/${data.campaignId}/play/combat`} target="_blank" rel="noreferrer">Player combat</a>
	<form method="POST" action="/logout" class="logout">
		<button type="submit" title="Log out as DM">Log out</button>
	</form>
</header>

<main class="combat">
	<Initiative bind:this={initiative} campaignId={data.campaignId} dm initial={data.initiative} initialRound={data.initiativeRound} />
</main>

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
		background: #c33;
		flex: none;
	}
	.conn.on {
		background: #3a9b45;
	}
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
		font-size: 0.85rem;
		padding: 0.4rem 0.7rem;
		border-radius: 6px;
		background: var(--parchment-light);
		cursor: pointer;
	}
	.combat {
		max-width: 42rem;
		margin: 1.5rem auto;
		padding: 0 1rem;
	}
</style>
