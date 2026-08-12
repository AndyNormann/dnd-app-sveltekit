<script lang="ts">
	import { onMount } from 'svelte';
	import RenderedDoc from '$lib/components/RenderedDoc.svelte';
	import Outline from '$lib/components/Outline.svelte';
	import type { PageData } from './$types';
	import type { MapData, RevealOp } from '$lib/types';

	let { data }: { data: PageData } = $props();

	let html = $state(data.html);
	let title = $state(data.title);
	let maps = $state<MapData[]>(data.maps);
	let connected = $state(false);
	let outlineItems = $state<{ id: string; level: number; text: string }[]>([]);
	let doc: RenderedDoc;

	function refreshOutline(container: HTMLElement) {
		const sel = 'h1,h2,h3,h4,h5,h6';
		outlineItems = (
			Array.from(container.querySelectorAll(sel)).filter((el) =>
				el.hasAttribute('data-heading-id')
			) as HTMLElement[]
		).map((el) => ({
			id: el.getAttribute('data-heading-id') || '',
			level: Number(el.getAttribute('data-level')) || 1,
			text: el.textContent?.trim() || ''
		}));
	}

	onMount(() => {
		const es = new EventSource(`/c/${data.campaignId}/events`);
		es.onopen = () => (connected = true);
		es.onerror = () => (connected = false);
		es.onmessage = (e) => {
			const ev = JSON.parse(e.data);
			switch (ev.type) {
				case 'snapshot':
					title = ev.title;
					html = ev.html;
					maps = ev.maps;
					doc?.applySnapshot(ev.maps, ev.tokens);
					break;
				case 'doc-updated':
				case 'share-changed':
					html = ev.html;
					break;
				case 'map-revealed':
				case 'map-hidden':
					doc?.applyMapOp(ev.mapId, ev.op as RevealOp);
					break;
				case 'tokens-updated':
					doc?.applyTokens(ev.mapId, ev.tokens);
					break;
				case 'grid-updated':
					doc?.applyGrid(ev.mapId, ev.grid_size);
					break;
				case 'layer-changed':
					doc?.applyLayer(ev.mapId, ev.layer);
					break;
				case 'map-added':
					if (!maps.some((m) => m.id === ev.map.id)) maps = [...maps, ev.map];
					break;
				case 'title-changed':
					title = ev.title;
					break;
			}
		};
		return () => es.close();
	});
</script>

<svelte:head><title>{title}</title></svelte:head>

<nav class="tabs">
	<span class="you">{data.character.name}</span>
	<a href={`/p/${data.token}`} class="tab" class:active={true}>Notes</a>
	<a href={`/p/${data.token}/combat`} class="tab">Combat</a>
</nav>

<div class="page">
	<aside class="rail">
		<Outline items={outlineItems} />
	</aside>
	<main>
		<h1 class="campaign-title">{title}</h1>
		<div class="conn" class:on={connected} title={connected ? 'Live' : 'Reconnecting…'}></div>
		{#if html.trim() === ''}
			<p class="empty">The DM hasn't shared anything yet. Hang tight!</p>
		{:else}
			<RenderedDoc bind:this={doc} {html} campaignId={data.campaignId} {maps} onrender={refreshOutline} />
		{/if}
	</main>
</div>

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
	.page {
		display: grid;
		grid-template-columns: 12rem minmax(0, 50rem);
		justify-content: center;
		gap: 1.25rem;
		font-family: var(--font-body);
		padding: 0 1rem;
	}
	.rail {
		position: sticky;
		top: 1rem;
		align-self: start;
		max-height: calc(100vh - 2rem);
		overflow-y: auto;
		padding-top: 1.5rem;
	}
	main {
		--page-bg: var(--parchment-light);
		background: var(--parchment-light);
		border-left: 1px solid var(--rule);
		border-right: 1px solid var(--rule);
		box-shadow: 0 0 18px rgba(43, 35, 23, 0.1);
		padding: 1.5rem 2.5rem 4rem;
		margin: 1rem 0 3rem;
		line-height: 1.6;
		min-width: 0;
		position: relative;
	}
	.conn {
		position: absolute;
		top: 0.75rem;
		right: 0.75rem;
		width: 0.6rem;
		height: 0.6rem;
		border-radius: 50%;
		background: #c33;
	}
	.conn.on {
		background: #3a9b45;
	}
	.empty {
		text-align: center;
		color: var(--ink-soft);
		font-style: italic;
		padding: 3rem 1rem;
	}
	.campaign-title {
		margin-top: 0.5rem;
		font-family: var(--font-display);
		font-weight: 700;
		color: var(--accent);
		text-align: center;
		letter-spacing: 0.04em;
		border-bottom: 3px double var(--gold);
		padding-bottom: 0.6rem;
	}
</style>
