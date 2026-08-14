<script lang="ts">
	import { onMount } from 'svelte';
	import RenderedDoc from '$lib/components/RenderedDoc.svelte';
	import RollLog from '$lib/components/RollLog.svelte';
	import Outline from '$lib/components/Outline.svelte';
	import LiveStamp from '$lib/components/LiveStamp.svelte';
	import A11yLive from '$lib/components/A11yLive.svelte';
	import { applyFeedEvent, type FeedHandlers } from '$lib/feed';
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
	let a11y: A11yLive;

	// resizable sidebars (persisted per campaign)
	let outlineW = $state(12);
	let rollsW = $state(18);
	const uiKey = `dnd-ui-play-${data.campaignId}`;
	function persistUi() {
		localStorage.setItem(uiKey, JSON.stringify({ outlineW, rollsW }));
	}
	function startResize(side: 'outline' | 'rolls') {
		return (e: MouseEvent) => {
			e.preventDefault();
			const startX = e.clientX;
			const startW = side === 'outline' ? outlineW : rollsW;
			const onMove = (ev: MouseEvent) => {
				const delta = ev.clientX - startX;
				if (side === 'outline') {
					outlineW = Math.max(6, Math.min(34, startW + delta / 16));
				} else {
					rollsW = Math.max(14, Math.min(44, startW - delta / 16));
				}
			};
			const onUp = () => {
				window.removeEventListener('mousemove', onMove);
				window.removeEventListener('mouseup', onUp);
				persistUi();
			};
			window.addEventListener('mousemove', onMove);
			window.addEventListener('mouseup', onUp);
		};
	}

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
		try {
			const saved = JSON.parse(localStorage.getItem(uiKey) ?? '{}');
			if (typeof saved.outlineW === 'number') outlineW = saved.outlineW;
			if (typeof saved.rollsW === 'number') rollsW = saved.rollsW;
		} catch {
			// corrupt entry; keep defaults
		}
		const es = new EventSource(`/c/${data.campaignId}/events`);
		es.onopen = () => (connected = true);
		es.onerror = () => (connected = false);
		es.onmessage = (e) => {
			poke();
			applyFeedEvent(JSON.parse(e.data), feed);
		};
		const feed: FeedHandlers = {
			onDoc: (h) => (html = h),
			applyMapOp: (mapId, op) => doc?.applyMapOp(mapId, op),
			applyTokens: (mapId, tokens) => doc?.applyTokens(mapId, tokens),
			applyGrid: (mapId, size) => doc?.applyGrid(mapId, size),
			applyLayer: (mapId, layer) => doc?.applyLayer(mapId, layer),
			applyMapPing: (mapId, ping) => doc?.applyMapPing(mapId, ping),
			applyRevealRemoved: (mapId, opId) => doc?.applyRevealRemoved(mapId, opId),
			applyLayerCleared: (mapId, layer) => doc?.applyLayerCleared(mapId, layer),
			applySnapshot: (s) => {
				title = s.title;
				html = s.html;
				maps = s.maps;
				rollLog?.setRolls(s.rolls);
				doc?.applySnapshot(s.maps, s.tokens);
			},
			onMapAdded: (m) => {
				if (!maps.some((x) => x.id === m.id)) maps = [...maps, m];
			},
			addRoll: (r) => {
				rollLog?.addRoll(r);
				a11y?.announce(`${r.roller} rolled ${r.expression}`);
			},
			setRolls: (rolls) => rollLog?.setRolls(rolls),
			onHandout: (id) => {
				showBanner('📢 New from the DM');
				a11y?.announce('The DM shared something new');
				// the shared html will have been delivered; scroll to + flash the heading
				setTimeout(() => {
					document
						.querySelector(`[data-heading-id="${CSS.escape(id)}"]`)
						?.scrollIntoView({ behavior: 'smooth', block: 'start' });
					const el = document.querySelector(`#h-${CSS.escape(id)}`);
					if (el) {
						el.classList.add('handout-flash');
						setTimeout(() => el.classList.remove('handout-flash'), 2000);
					}
				}, 120);
			},
			onTitle: (t) => (title = t)
		};
		return () => es.close();
	});
</script>

<svelte:head><title>{title}</title></svelte:head>

<A11yLive bind:this={a11y} />

<nav class="tabs">
	<a href={`/c/${data.campaignId}/play`} class="tab" class:active={true}>Notes</a>
	<a href={`/c/${data.campaignId}/play/combat`} class="tab">Combat</a>
</nav>

<div class="page">
	<div class="frame" style={`--outline-w: ${outlineW}rem; --rolls-w: ${rollsW}rem`}>
		<aside class="rail">
			<Outline items={outlineItems} />
		</aside>
		<div
			class="rh rh-outline"
			role="separator"
			aria-orientation="vertical"
			title="Drag to resize outline"
			onmousedown={startResize('outline')}
		></div>
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
		<div
			class="rh rh-rolls"
			role="separator"
			aria-orientation="vertical"
			title="Drag to resize rolls"
			onmousedown={startResize('rolls')}
		></div>
		<aside class="rail rolls">
			<RollLog bind:this={rollLog} campaignId={data.campaignId} initial={data.rolls} />
		</aside>
	</div>
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
		display: flex;
		justify-content: center;
		padding: 0 1rem;
	}
	.frame {
		display: grid;
		grid-template-columns: var(--outline-w, 12rem) minmax(0, 50rem) var(--rolls-w, 18rem);
		gap: 1.25rem;
		font-family: var(--font-body);
		position: relative;
		width: max-content;
		max-width: 100%;
	}
	/* drag handles on the sidebar borders (centered in the gap) */
	.rh {
		position: absolute;
		top: 0;
		bottom: 0;
		width: 8px;
		cursor: col-resize;
		z-index: 5;
	}
	.rh-outline {
		left: calc(var(--outline-w, 12rem) + 0.625rem);
		margin-left: -4px;
	}
	.rh-rolls {
		right: calc(var(--rolls-w, 18rem) + 0.625rem);
		margin-right: -4px;
	}
	.rh:hover {
		background: var(--accent-soft);
		opacity: 0.35;
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
		border: 1.5px solid var(--danger);
	}
	.conn.on {
		background: var(--success);
		border-color: var(--success);
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
		top: 4.2rem;
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
		z-index: 5;
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
		.frame {
			grid-template-columns: 1fr;
			width: 100%;
		}
		.rail,
		.rail.rolls,
		.rh {
			display: none;
		}
		main {
			padding: 1rem 1.25rem 3rem;
		}
	}
</style>
