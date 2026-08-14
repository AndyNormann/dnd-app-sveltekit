<script lang="ts">
	import { mount, unmount } from 'svelte';
	import MapView from './MapView.svelte';
	import { INLINE_DICE_RE } from '$lib/dice';
	import type { MapData, RevealOp, RollData, TokenData, PingData } from '$lib/types';

	let {
		html,
		dm = false,
		campaignId,
		maps = [],
		onrender,
		onroll,
		getSecret,
		roller
	}: {
		html: string;
		dm?: boolean;
		campaignId: string;
		maps?: MapData[];
		onrender?: (container: HTMLElement) => void;
		onroll?: (roll: RollData) => void;
		getSecret?: () => boolean;
		roller?: string;
	} = $props();

	let container: HTMLDivElement;

	const mapInstances = new Map<string, ReturnType<typeof mount>>();

	/** Forward an SSE reveal/hide op to the matching mounted map. */
	export function applyMapOp(mapId: string, op: RevealOp) {
		const inst = mapInstances.get(mapId) as { applyOp?: (o: RevealOp) => void } | undefined;
		inst?.applyOp?.(op);
	}

	export function applyTokens(mapId: string, tokens: TokenData[]) {
		const inst = mapInstances.get(mapId) as { applyTokens?: (t: TokenData[]) => void } | undefined;
		inst?.applyTokens?.(tokens);
	}

	export function applyGrid(mapId: string, grid: number) {
		const inst = mapInstances.get(mapId) as { applyGrid?: (g: number) => void } | undefined;
		inst?.applyGrid?.(grid);
	}

	export function applyLayer(mapId: string, layer: number) {
		const inst = mapInstances.get(mapId) as { applyLayer?: (l: number) => void } | undefined;
		inst?.applyLayer?.(layer);
	}

	export function applyRevealRemoved(mapId: string, opId: number) {
		const inst = mapInstances.get(mapId) as { applyRevealRemoved?: (id: number) => void } | undefined;
		inst?.applyRevealRemoved?.(opId);
	}

	export function applyLayerCleared(mapId: string, layer: number) {
		const inst = mapInstances.get(mapId) as { applyLayerCleared?: (l: number) => void } | undefined;
		inst?.applyLayerCleared?.(layer);
	}

	/** Forward a transient ping to the matching mounted map. */
	export function applyMapPing(mapId: string, ping: PingData) {
		const inst = mapInstances.get(mapId) as { applyPing?: (p: PingData) => void } | undefined;
		inst?.applyPing?.(ping);
	}

	/** Apply a full snapshot (reveals/grid/layer + tokens) to every mounted map. */
	export function applySnapshot(
		maps: MapData[],
		tokens: { mapId: string; tokens: TokenData[] }[]
	) {
		const tokenByMap = new Map(tokens.map((t) => [t.mapId, t.tokens]));
		for (const m of maps) {
			const inst = mapInstances.get(m.id) as
				| { applyState?: (d: MapData, t: TokenData[]) => void }
				| undefined;
			inst?.applyState?.(m, tokenByMap.get(m.id) ?? []);
		}
	}

	function hydrateMaps() {
		const placeholders = Array.from(
			container.querySelectorAll('.map-embed[data-map-id]')
		) as HTMLElement[];
		const seen = new Set<string>();
		for (const ph of placeholders) {
			const id = ph.getAttribute('data-map-id')!;
			seen.add(id);
			if (ph.dataset.hydrated === 'true') continue;
			const data = maps.find((m) => m.id === id);
			if (!data) {
				ph.textContent = '[missing map]';
				continue;
			}
			ph.dataset.hydrated = 'true';
			const inst = mount(MapView, {
				target: ph,
				props: { map: data, dm, campaignId }
			});
			mapInstances.set(id, inst);
		}
		// unmount maps whose placeholders disappeared
		for (const [id, inst] of mapInstances) {
			if (!seen.has(id)) {
				unmount(inst);
				mapInstances.delete(id);
			}
		}
	}

	/** Wrap auto-detected dice expressions (e.g. 2d6+3) in clickable buttons. */
	function decorateDice() {
		const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
			acceptNode(node) {
				const p = node.parentElement;
				if (!p || p.closest('pre, code, a, button, .map-embed')) {
					return NodeFilter.FILTER_REJECT;
				}
				return NodeFilter.FILTER_ACCEPT;
			}
		});
		const targets: Text[] = [];
		let n: Node | null;
		while ((n = walker.nextNode())) {
			if (INLINE_DICE_RE.test(n.textContent ?? '')) targets.push(n as Text);
			INLINE_DICE_RE.lastIndex = 0;
		}
		for (const text of targets) {
			const frag = document.createDocumentFragment();
			let last = 0;
			const src = text.textContent ?? '';
			for (const m of src.matchAll(INLINE_DICE_RE)) {
				frag.appendChild(document.createTextNode(src.slice(last, m.index)));
				const btn = document.createElement('button');
				btn.type = 'button';
				btn.className = 'dice-inline';
				btn.textContent = m[0];
				btn.title = 'Roll';
				btn.onclick = () => rollInline(m[0]);
				frag.appendChild(btn);
				last = m.index + m[0].length;
			}
			frag.appendChild(document.createTextNode(src.slice(last)));
			text.replaceWith(frag);
		}
	}

	async function rollInline(expression: string) {
		const rollerName = dm ? 'DM' : roller ?? (localStorage.getItem('dnd-roller-name') || 'Anonymous');
		const res = await fetch(`/c/${campaignId}/roll`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ roller: rollerName, expression, secret: getSecret?.() ?? false })
		});
		if (res.ok) onroll?.((await res.json()) as RollData);
	}

	/** Handle clicks on wiki links: scroll to the linked heading. */
	function onContainerClick(e: MouseEvent) {
		const link = (e.target as HTMLElement).closest('a.wiki-link') as HTMLAnchorElement | null;
		if (!link) return;
		e.preventDefault();
		const targetId = link.getAttribute('data-heading-id');
		if (!targetId) return;
		container
			.querySelector(`[data-heading-id="${CSS.escape(targetId)}"]`)
			?.scrollIntoView({ behavior: 'smooth', block: 'start' });
	}

	$effect(() => {
		// re-run whenever html changes
		void html;
		if (!container) return;
		// tear down old map instances before innerHTML swap
		for (const [, inst] of mapInstances) unmount(inst);
		mapInstances.clear();
		container.innerHTML = html;
		decorateDice();
		hydrateMaps();
		onrender?.(container);
	});
</script>

<!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
<div class="rendered" class:dm bind:this={container} onclick={onContainerClick}></div>

<style>
	.rendered {
		line-height: 1.45;
		word-wrap: break-word;
		font-family: var(--font-body);
		font-size: var(--text-base, 1.35rem);
		color: var(--paper-ink);
	}
	.rendered :global(p) {
		margin: 0.55em 0;
	}
	.rendered :global(ul),
	.rendered :global(ol) {
		padding-left: 1.4em;
		margin: 0.55em 0;
	}
	.rendered :global(li) {
		margin: 0.3em 0;
	}
	.rendered :global(h1),
	.rendered :global(h2),
	.rendered :global(h3),
	.rendered :global(h4),
	.rendered :global(h5),
	.rendered :global(h6) {
		position: relative;
		font-family: var(--font-display);
		color: var(--paper-ink);
		letter-spacing: 0.02em;
		line-height: 1.2;
	}
	.rendered :global(h1) {
		font-size: 2.3rem;
		font-weight: 600;
		border-bottom: 1px solid #b59a5a;
		padding-bottom: 0.25rem;
	}
	.rendered :global(h2) {
		font-size: 1.8rem;
		font-weight: 600;
	}
	.rendered :global(h3) {
		font-size: 1.45rem;
		font-weight: 500;
	}
	.rendered :global(h4) {
		font-size: 1.25rem;
		font-weight: 500;
	}
	.rendered :global(h5) {
		font-size: 1.12rem;
		font-weight: 400;
	}
	.rendered :global(h6) {
		font-size: 1.05rem;
		font-weight: 400;
	}
	.rendered :global(h3),
	.rendered :global(h4),
	.rendered :global(h5),
	.rendered :global(h6) {
		color: var(--paper-ink);
	}
	/* drop cap on the first paragraph of each top-level section */
	.rendered :global(h1 + p)::first-letter {
		font-family: var(--font-display);
		font-size: 3.1em;
		font-weight: 700;
		float: left;
		line-height: 0.85;
		padding: 0.05em 0.12em 0 0;
		color: #7a5c14;
	}
	/* ornamental divider: type --- in markdown. --page-bg is set by the host page. */
	.rendered :global(hr) {
		border: 0;
		height: 1px;
		background: var(--rule);
		position: relative;
		margin: 2.2rem 0;
		overflow: visible;
	}
	.rendered :global(hr)::after {
		content: '❖';
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		background: var(--page-bg, var(--parchment-light));
		padding: 0 0.7rem;
		color: var(--gold);
		font-size: 0.95rem;
		line-height: 1;
	}
	.rendered :global(img) {
		max-width: 100%;
		height: auto;
	}
	.rendered :global(pre) {
		background: rgba(0, 0, 0, 0.06);
		border: 1px solid var(--paper-rule);
		padding: 0.8rem;
		border-radius: 6px;
		overflow: auto;
		font-size: 0.85em;
		color: var(--paper-ink);
	}
	.rendered :global(code) {
		font-family: ui-monospace, monospace;
	}
	.rendered :global(.dice-inline) {
		border: 1px solid #b59a5a;
		background: rgba(122, 92, 20, 0.10);
		color: #6a4f0e;
		border-radius: 4px;
		padding: 0 0.35rem;
		font: inherit;
		font-size: 0.9em;
		font-weight: 600;
		cursor: pointer;
	}
	.rendered :global(.dice-inline:hover) {
		background: rgba(122, 92, 20, 0.18);
	}
	.rendered :global(a.wiki-link) {
		color: #7a5c14;
		text-decoration: none;
		border-bottom: 1px solid #b59a5a;
		cursor: pointer;
	}
	.rendered :global(.wiki-missing) {
		color: #8a6d1a;
		border-bottom: 1px dashed #b59a5a;
	}
	/* stat-block: classic 5e monster panel via blockquote */
	.rendered :global(blockquote) {
		margin: 1.4rem 0;
		padding: 0.7rem 1.1rem;
		background: rgba(122, 92, 20, 0.08);
		border-top: 3px solid #7a5c14;
		border-bottom: 3px solid #7a5c14;
		box-shadow: var(--shadow);
		color: var(--paper-ink);
	}
	.rendered :global(blockquote p:first-child strong:first-child) {
		font-family: var(--font-display);
		color: #7a5c14;
		font-size: 1.15em;
	}
</style>
