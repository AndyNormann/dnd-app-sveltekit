<script lang="ts">
	import { onMount } from 'svelte';
	import RenderedDoc from '$lib/components/RenderedDoc.svelte';
	import RollLog from '$lib/components/RollLog.svelte';
	import Initiative from '$lib/components/Initiative.svelte';
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
	let initiative: Initiative;

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
		es.onmessage = (e) => {
			const ev = JSON.parse(e.data);
			switch (ev.type) {
				case 'snapshot':
					title = ev.title;
					html = ev.html;
					maps = ev.maps;
					if (rollLog) rollLog.setRolls(ev.rolls);
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
				case 'roll':
					rollLog?.addRoll(ev.roll as RollData);
					break;
				case 'initiative-updated':
					initiative?.applyEntries(ev.entries);
					break;
				case 'handout-revealed':
					// the shared html will have been delivered; scroll to + flash the heading
					setTimeout(() => {
						document
							.querySelector(`[data-heading-id="${CSS.escape(ev.headingId)}"]`)
							?.scrollIntoView({ behavior: 'smooth', block: 'start' });
						const el = document.querySelector(`#h-${CSS.escape(ev.headingId)}`);
						if (el) {
							el.classList.add('handout-flash');
							setTimeout(() => el.classList.remove('handout-flash'), 2000);
						}
					}, 120);
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
<Initiative bind:this={initiative} campaignId={data.campaignId} initial={data.initiative} />

<style>
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
		}
		.rail {
			display: none;
		}
		main {
			padding: 1rem 1.25rem 3rem;
		}
	}
</style>
