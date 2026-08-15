<script lang="ts">
	import { onMount } from 'svelte';
	import RenderedDoc from '$lib/components/RenderedDoc.svelte';
	import DocumentList from '$lib/components/DocumentList.svelte';
	import RollLog from '$lib/components/RollLog.svelte';
	import A11yLive from '$lib/components/A11yLive.svelte';
	import { applyFeedEvent, type FeedHandlers } from '$lib/feed';
	import type { DocumentSummary } from '$lib/server/db';
	import type { PageData } from './$types';
	import TypeSwitcher from '$lib/components/TypeSwitcher.svelte';
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
	<span class="tabs-actions"><TypeSwitcher /></span>
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
		background-image:
			var(--paper-grain),
			repeating-linear-gradient(
				transparent 0,
				transparent 1.9rem,
				rgba(90, 70, 20, 0.05) 1.9rem,
				rgba(90, 70, 20, 0.05) calc(1.9rem + 1px)
			),
			var(--paper);
		border: none;
		border-radius: 0;
		clip-path: polygon(
			1.1% 0.9%, 6% 0.3%, 11% 1.2%, 17% 0.4%, 23% 1.0%, 29% 0.2%, 35% 1.1%, 41% 0.4%,
			47% 0.9%, 53% 0.2%, 59% 1.2%, 65% 0.4%, 71% 1.0%, 77% 0.3%, 83% 1.1%, 89% 0.5%,
			95% 0.8%, 99.4% 1.2%, 99.6% 6%, 99.1% 12%, 99.6% 18%, 99.1% 24%, 99.6% 30%, 99.1% 36%,
			99.6% 42%, 99.1% 48%, 99.6% 54%, 99.1% 60%, 99.6% 66%, 99.1% 72%, 99.6% 78%, 99.1% 84%,
			99.6% 90%, 99.2% 96%, 95% 99.4%, 89% 99.6%, 83% 99.1%, 77% 99.6%, 71% 99.1%, 65% 99.6%,
			59% 99.1%, 53% 99.6%, 47% 99.1%, 41% 99.6%, 35% 99.1%, 29% 99.6%, 23% 99.1%, 17% 99.6%,
			11% 99.1%, 6% 99.5%, 1.0% 99.2%, 0.4% 94%, 0.9% 88%, 0.3% 82%, 0.9% 76%, 0.3% 70%,
			0.9% 64%, 0.3% 58%, 0.9% 52%, 0.3% 46%, 0.9% 40%, 0.3% 34%, 0.9% 28%, 0.3% 22%,
			0.9% 16%, 0.4% 10%
		);
		filter: drop-shadow(0 12px 26px rgba(0, 0, 0, 0.5));
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
