<script lang="ts">
	import { onMount } from 'svelte';
	import RenderedDoc from '$lib/components/RenderedDoc.svelte';
	import DocumentList from '$lib/components/DocumentList.svelte';
	import RollLog from '$lib/components/RollLog.svelte';
	import A11yLive from '$lib/components/A11yLive.svelte';
	import { applyFeedEvent, type FeedHandlers } from '$lib/feed';
	import type { DocumentSummary } from '$lib/server/db';
	import type { PageData } from './$types';
		import type { MapData } from '$lib/types';

	let { data }: { data: PageData } = $props();

	let documents = $state<DocumentSummary[]>(data.documents);
	let currentDocId = $state(data.document?.id ?? '');
	let html = $state(data.html);
	let campaignTitle = $state(data.campaignTitle);
	let maps = $state<MapData[]>(data.maps);
	let connected = $state(false);
	let doc: RenderedDoc;
	let rollLog: RollLog;
	let a11y: A11yLive;

	$effect(() => {
		const d = data.document;
		if (d?.id === currentDocId) return; // same doc; keep live updates
		currentDocId = d?.id ?? '';
		html = data.html;
	});

	onMount(() => {
		const es = new EventSource(`/c/${data.campaignId}/events`);
		es.onopen = () => (connected = true);
		es.onerror = () => (connected = false);
		const feed: FeedHandlers = {
			onDocuments: (ds) => {
			documents = ds.filter((d) => d.shared === 1);
			// if the player's current document was just unshared, move them away
			if (currentDocId && !documents.some((d) => d.id === currentDocId)) {
				currentDocId = '';
				html = '';
				if (documents.length > 0) {
					location.href = `/p/${data.token}?doc=${documents[0].id}`;
				}
				return;
			}
			if (!currentDocId && documents.length > 0) {
				location.href = `/p/${data.token}?doc=${documents[0].id}`;
			}
		},
			onDocumentUpdated: (documentId, h) => {
				if (documentId === currentDocId) html = h;
			},
			addRoll: (r) => {
				rollLog?.addRoll(r);
				a11y?.announce(`${r.roller} rolled ${r.expression}`);
			},
			setRolls: (rolls) => rollLog?.setRolls(rolls),
			applyMapOp: (mapId, op) => doc?.applyMapOp(mapId, op),
			applyTokens: (mapId, tokens) => doc?.applyTokens(mapId, tokens),
			applyGrid: (mapId, size) => doc?.applyGrid(mapId, size),
			applyLayer: (mapId, layer) => doc?.applyLayer(mapId, layer),
			applyMapPing: (mapId, ping) => doc?.applyMapPing(mapId, ping),
			applySnapshot: (s) => {
				campaignTitle = s.title;
				documents = s.documents.filter((d) => d.shared === 1);
				maps = s.maps;
				doc?.applySnapshot(s.maps, s.tokens);
				// if the current document is no longer shared, move away from it
				if (currentDocId && !documents.some((d) => d.id === currentDocId)) {
					currentDocId = '';
					html = '';
					if (documents.length > 0) {
						location.href = `/p/${data.token}?doc=${documents[0].id}`;
					}
				}
			},
			onMapAdded: (m) => {
				if (!maps.some((x) => x.id === m.id)) maps = [...maps, m];
			},
			onTitle: (t) => (campaignTitle = t)
		};
		es.onmessage = (e) => {
			applyFeedEvent(JSON.parse(e.data), feed);
		};
		return () => es.close();
	});
</script>

<svelte:head><title>{data.document?.title ?? 'Notes'} — {campaignTitle}</title></svelte:head>

<A11yLive bind:this={a11y} />

<nav class="tabs">
	<span class="you" title="You are connected as this character">Playing as {data.character.name}</span>
	<a href={`/p/${data.token}`} class="tab" class:active={true}>Notes</a>
	<a href={`/p/${data.token}/combat`} class="tab">Combat</a>
	</nav>

<div class="page">
	<aside class="rail">
		<DocumentList
			campaignId={data.campaignId}
			documents={documents}
			activeId={data.document?.id ?? ''}
			dm={false}
			base={`/p/${data.token}`}
		/>
	</aside>
	<main>
		<h1 class="doc-title">{data.document?.title ?? ''}</h1>
		<div class="conn" class:on={connected} title={connected ? 'Live' : 'Reconnecting…'}></div>
		{#if documents.length === 0}
			<p class="empty">The DM hasn't shared any documents yet. Hang tight!</p>
		{:else if html.trim() === ''}
			<p class="empty">This document is empty for now.</p>
		{:else}
			<RenderedDoc bind:this={doc} {html} campaignId={data.campaignId} {maps} roller={data.character.name} onroll={(r) => rollLog?.addRoll(r)} />
		{/if}
	</main>
	<aside class="rail rolls">
		<RollLog bind:this={rollLog} campaignId={data.campaignId} initial={data.rolls} />
	</aside>
</div>

<style>
	.tabs {
		display: flex;
		justify-content: center;
		align-items: center;
		gap: 0.25rem;
		padding: 0.75rem 0 0;
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
	.page {
		display: grid;
		grid-template-columns: 13rem minmax(0, 50rem) 18rem;
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
	.rail.rolls {
		position: sticky;
		top: 1rem;
		align-self: start;
		max-height: none;
		height: calc(100vh - 2rem);
		overflow: hidden;
		border-left: 1px solid var(--rule);
		padding: 0.5rem 0 0 0.75rem;
	}
	main {
		--page-bg: var(--paper);
		color: var(--paper-ink);
		background: var(--paper);
		border: 1px solid var(--paper-edge);
		border-radius: var(--radius-md);
		box-shadow: var(--paper-shadow);
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
		color: var(--paper-ink-soft);
		font-style: italic;
		margin: 2rem 0;
	}
	.doc-title {
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
		.rail.rolls {
			display: none;
		}
		main {
			padding: 1rem 1.25rem 3rem;
		}
	}
</style>
