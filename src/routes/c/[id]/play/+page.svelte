<script lang="ts">
	import { onMount } from 'svelte';
	import RenderedDoc from '$lib/components/RenderedDoc.svelte';
	import RollLog from '$lib/components/RollLog.svelte';
	import Outline from '$lib/components/Outline.svelte';
	import LiveStamp from '$lib/components/LiveStamp.svelte';
	import type { PageData } from './$types';
	import type { MapData, RevealOp, RollData } from '$lib/types';

	let { data }: { data: PageData } = $props();

	let html = $state(data.html);
	let title = $state(data.title);
	let maps = $state<MapData[]>(data.maps);
	let connected = $state(false);
	let lastActivity = $state(Date.now());
	let banner = $state<string | null>(null);
	let bannerTimer: ReturnType<typeof setTimeout>;
	function poke() {
		lastActivity = Date.now();
	}
	function showBanner(msg: string) {
		banner = msg;
		clearTimeout(bannerTimer);
		bannerTimer = setTimeout(() => (banner = null), 5000);
	}
	let outlineItems = $state<{ id: string; level: number; text: string }[]>([]);
	let doc: RenderedDoc;
	let rollLog: RollLog;

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
			poke();
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
				case 'rolls-cleared':
					rollLog?.setRolls([]);
					break;
				case 'rolls-restored':
					rollLog?.setRolls(ev.rolls);
					break;
				case 'reveal-undone':
					doc?.applyRevealRemoved(ev.mapId, ev.opId);
					break;
				case 'reveals-cleared':
					doc?.applyLayerCleared(ev.mapId, ev.layer);
					break;
				case 'handout-revealed':
					showBanner('📢 New from the DM');
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

<nav class="tabs">
	<a href={`/c/${data.campaignId}/play`} class="tab" class:active={true}>Notes</a>
	<a href={`/c/${data.campaignId}/play/combat`} class="tab">Combat</a>
</nav>

<div class="page">
	<aside class="rail">
		<Outline items={outlineItems} />
	</aside>
	<main>
		<h1 class="campaign-title">{title}</h1>
		<div class="conn" class:on={connected} title={connected ? 'Live' : 'Reconnecting…'}></div>
		{#if !connected}<span class="reconnect">Reconnecting…</span>{/if}
		<LiveStamp at={lastActivity} />
		{#if banner}<div class="banner">{banner}</div>{/if}
		{#if html.trim() === ''}
			<p class="empty">The DM hasn't shared anything yet. Hang tight!</p>
		{:else}
			<RenderedDoc
				bind:this={doc}
				{html}
				campaignId={data.campaignId}
				{maps}
				onrender={refreshOutline}
				onroll={(r) => rollLog?.addRoll(r)}
			/>
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
	.page {
		display: grid;
		grid-template-columns: 12rem minmax(0, 50rem) 18rem;
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
		height: calc(100vh - 1rem);
		max-height: none;
		overflow: hidden;
		padding-top: 0;
		border-left: 1px solid var(--rule);
	}
	main {
		--page-bg: var(--parchment-light);
		background: var(--parchment-light);
		border-left: 1px solid var(--rule);
		border-right: 1px solid var(--rule);
		box-shadow: var(--shadow-glow);
		padding: 1.5rem 2.5rem 32vh;
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
		border: 1.5px solid #c33;
	}
	.conn.on {
		background: #3a9b45;
		border-color: #3a9b45;
	}
	.reconnect {
		position: absolute;
		top: 0.7rem;
		right: 2rem;
		font-size: 0.75rem;
		color: var(--accent-soft);
		font-weight: 600;
	}
	.banner {
		position: absolute;
		top: 0.6rem;
		left: 50%;
		transform: translateX(-50%);
		background: var(--accent);
		color: var(--parchment-light);
		border-radius: 99px;
		padding: 0.35rem 1rem;
		font-family: var(--font-body);
		font-size: 0.9rem;
		font-weight: 600;
		box-shadow: var(--shadow-md);
		animation: banner-in 0.2s ease;
	}
	@keyframes banner-in {
		from {
			opacity: 0;
			transform: translateX(-50%) translateY(-6px);
		}
		to {
			opacity: 1;
			transform: translateX(-50%) translateY(0);
		}
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
