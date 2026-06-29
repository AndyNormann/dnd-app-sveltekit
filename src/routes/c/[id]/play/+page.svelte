<script lang="ts">
	import { onMount } from 'svelte';
	import RenderedDoc from '$lib/components/RenderedDoc.svelte';
	import type { PageData } from './$types';
	import type { MapData, RevealOp } from '$lib/types';

	let { data }: { data: PageData } = $props();

	let html = $state(data.html);
	let maps = $state<MapData[]>(data.maps);
	let doc: RenderedDoc;

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
			}
		};
		return () => es.close();
	});
</script>

<svelte:head><title>{data.title}</title></svelte:head>

<main>
	<RenderedDoc bind:this={doc} {html} campaignId={data.campaignId} {maps} />
</main>

<style>
	main {
		max-width: 50rem;
		margin: 2rem auto;
		padding: 0 1.25rem;
		font-family: system-ui, sans-serif;
		line-height: 1.6;
	}
</style>
