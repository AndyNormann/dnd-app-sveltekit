<script lang="ts">
	import { onMount } from 'svelte';
	import RenderedDoc from '$lib/components/RenderedDoc.svelte';
	import RollLog from '$lib/components/RollLog.svelte';
	import Outline from '$lib/components/Outline.svelte';
	import type { PageData } from './$types';
	import type { MapData, RevealOp, RollData } from '$lib/types';

	let { data }: { data: PageData } = $props();

	let html = $state(data.html);
	let title = $state(data.title);
	let maps = $state<MapData[]>(data.maps);
	let outlineItems = $state<{ id: string; level: number; text: string }[]>([]);
	let doc: RenderedDoc;
	let rollLog: RollLog;

	function refreshOutline(container: HTMLElement) {
		outlineItems = (
			Array.from(container.querySelectorAll('[data-heading-id]')) as HTMLElement[]
		).map((el) => ({
			id: el.getAttribute('data-heading-id') || '',
			level: Number(el.getAttribute('data-level')) || 1,
			text: el.textContent?.trim() || ''
		}));
	}

	onMount(() => {
		const es = new EventSource(`/c/${data.campaignId}/events`);
		es.onmessage = (e) => {
			const ev = JSON.parse(e.data);
			switch (ev.type) {
				case 'doc-updated':
				case 'share-changed':
					html = ev.html;
					break;
				case 'map-revealed':
				case 'map-hidden':
					doc?.applyMapOp(ev.mapId, ev.op as RevealOp);
					break;
				case 'map-added':
					if (!maps.some((m) => m.id === ev.map.id)) maps = [...maps, ev.map];
					break;
				case 'roll':
					rollLog?.addRoll(ev.roll as RollData);
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

<div class="page">
	<aside class="rail">
		<Outline items={outlineItems} />
	</aside>
	<main>
		<h1 class="campaign-title">{title}</h1>
		<RenderedDoc
			bind:this={doc}
			{html}
			campaignId={data.campaignId}
			{maps}
			onrender={refreshOutline}
			onroll={(r) => rollLog?.addRoll(r)}
		/>
	</main>
</div>

<RollLog bind:this={rollLog} campaignId={data.campaignId} initial={data.rolls} />

<style>
	.page {
		display: grid;
		grid-template-columns: 12rem minmax(0, 50rem);
		justify-content: center;
		gap: 1rem;
		font-family: system-ui, sans-serif;
	}
	.rail {
		position: sticky;
		top: 1rem;
		align-self: start;
		max-height: calc(100vh - 2rem);
		overflow-y: auto;
		padding-top: 1rem;
	}
	main {
		padding: 1rem 1.25rem 4rem;
		line-height: 1.6;
		min-width: 0;
	}
	.campaign-title {
		margin-top: 0.5rem;
	}
	@media (max-width: 46rem) {
		.page {
			grid-template-columns: 1fr;
		}
		.rail {
			display: none;
		}
	}
</style>
