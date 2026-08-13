<script lang="ts">
	import { onMount } from 'svelte';
	import Initiative from '$lib/components/Initiative.svelte';
	import LiveStamp from '$lib/components/LiveStamp.svelte';
	import { applyFeedEvent, type FeedHandlers } from '$lib/feed';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let title = $state(data.title);
	let connected = $state(false);
	let lastActivity = $state(Date.now());
	let initiative: Initiative;
	function poke() {
		lastActivity = Date.now();
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
			applyInitiative: (entries, r) => initiative?.applyEntries(entries, r),
			onTitle: (t) => (title = t)
		};
		return () => es.close();
	});
</script>

<svelte:head><title>{title} — Combat</title></svelte:head>

<nav class="tabs">
	<a href={`/c/${data.campaignId}/play`} class="tab">Notes</a>
	<a href={`/c/${data.campaignId}/play/combat`} class="tab" class:active={true}>Combat</a>
</nav>

<main class="combat">
	<h1 class="campaign-title">{title}</h1>
	<div class="conn" class:on={connected} title={connected ? 'Live' : 'Reconnecting…'}></div>
	<LiveStamp at={lastActivity} />
	<Initiative bind:this={initiative} campaignId={data.campaignId} initial={data.initiative} initialRound={data.initiativeRound} />
</main>

<style>
	.tabs {
		display: flex;
		justify-content: center;
		gap: 0.25rem;
		padding: 0.75rem 0 0;
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
		max-width: 42rem;
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
		background: transparent;
		border: 1.5px solid #c33;
	}
	.conn.on {
		background: #3a9b45;
		border-color: #3a9b45;
	}
</style>
