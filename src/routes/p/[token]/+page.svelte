<script lang="ts">
	import { onMount } from 'svelte';
	import RenderedDoc from '$lib/components/RenderedDoc.svelte';
	import Outline from '$lib/components/Outline.svelte';
	import A11yLive from '$lib/components/A11yLive.svelte';
	import { applyFeedEvent, type FeedHandlers } from '$lib/feed';
	import type { PageData } from './$types';
	import type { MapData, RevealOp } from '$lib/types';

	let { data }: { data: PageData } = $props();

	let html = $state(data.html);
	let title = $state(data.title);
	let maps = $state<MapData[]>(data.maps);
	let connected = $state(false);
	let outlineItems = $state<{ id: string; level: number; text: string }[]>([]);
	let doc: RenderedDoc;
	let a11y: A11yLive;

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
		const feed: FeedHandlers = {
			onDoc: (h) => (html = h),
			applyMapOp: (mapId, op) => doc?.applyMapOp(mapId, op),
			applyTokens: (mapId, tokens) => doc?.applyTokens(mapId, tokens),
			applyGrid: (mapId, size) => doc?.applyGrid(mapId, size),
			applyLayer: (mapId, layer) => doc?.applyLayer(mapId, layer),
			applyMapPing: (mapId, ping) => doc?.applyMapPing(mapId, ping),
			applySnapshot: (s) => {
				title = s.title;
				html = s.html;
				maps = s.maps;
				doc?.applySnapshot(s.maps, s.tokens);
			},
			onMapAdded: (m) => {
				if (!maps.some((x) => x.id === m.id)) maps = [...maps, m];
			},
			onTitle: (t) => (title = t),
			onHandout: (id) => {
				a11y?.announce('The DM shared something new');
			}
		};
		es.onmessage = (e) => {
			applyFeedEvent(JSON.parse(e.data), feed);
		};
		return () => es.close();
	});
</script>

<svelte:head><title>{title}</title></svelte:head>

<A11yLive bind:this={a11y} />

<nav class="tabs">
	<span class="you" title="You are connected as this character">Playing as {data.character.name}</span>
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
			<RenderedDoc bind:this={doc} {html} campaignId={data.campaignId} {maps} roller={data.character.name} onrender={refreshOutline} />
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
		box-shadow: var(--shadow-glow);
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
		background: transparent;
		border: 1.5px solid var(--danger);
	}
	.conn.on {
		background: var(--success);
		border-color: var(--success);
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
	@media (max-width: 46rem) {
		.page {
			grid-template-columns: 1fr;
			justify-content: stretch;
		}
		.rail {
			display: none;
		}
		main {
			padding: 1rem 1.25rem 3rem;
		}
	}
</style>
