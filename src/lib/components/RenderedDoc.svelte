<script lang="ts">
	import { mount, unmount } from 'svelte';
	import MapView from './MapView.svelte';
	import { INLINE_DICE_RE } from '$lib/dice';
	import type { MapData, RevealOp, RollData, TokenData } from '$lib/types';

	let {
		html,
		dm = false,
		campaignId,
		maps = [],
		meta = {},
		onrender,
		onroll,
		getSecret
	}: {
		html: string;
		dm?: boolean;
		campaignId: string;
		maps?: MapData[];
		meta?: Record<string, { shared: number; collapsed: number }>;
		onrender?: (container: HTMLElement) => void;
		onroll?: (roll: RollData) => void;
		getSecret?: () => boolean;
	} = $props();

	let container: HTMLDivElement;

	// local mutable copy of heading meta (DM only)
	let localMeta: Record<string, { shared: number; collapsed: number }> = {};
	$effect(() => {
		localMeta = {};
		for (const [k, v] of Object.entries(meta)) localMeta[k] = { ...v };
	});

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

	interface HeadingEl {
		el: HTMLElement;
		id: string;
		level: number;
		parent: number;
	}

	function collectHeadings(): HeadingEl[] {
		// scope to heading tags: wiki links also carry data-heading-id
		const nodes = Array.from(
			container.querySelectorAll('h1,h2,h3,h4,h5,h6')
		).filter((el) => el.hasAttribute('data-heading-id')) as HTMLElement[];
		const list: HeadingEl[] = [];
		const stack: number[] = [];
		for (const el of nodes) {
			const id = el.getAttribute('data-heading-id') || '';
			const level = Number(el.getAttribute('data-level')) || 1;
			while (stack.length && list[stack[stack.length - 1]].level >= level) stack.pop();
			const parent = stack.length ? stack[stack.length - 1] : -1;
			list.push({ el, id, level, parent });
			stack.push(list.length - 1);
		}
		return list;
	}

	function effectiveShared(idx: number, list: HeadingEl[]): boolean {
		let cur = idx;
		while (cur !== -1) {
			const state = localMeta[list[cur].id]?.shared ?? 0;
			if (state === 1) return true;
			if (state === 2) return false;
			cur = list[cur].parent;
		}
		return false;
	}

	async function postShare(headingId: string, state: number) {
		await fetch(`/c/${campaignId}/share`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ headingId, state })
		});
	}

	async function postHandout(headingId: string) {
		await fetch(`/c/${campaignId}/handout`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ headingId })
		});
	}

	async function postCollapse(headingId: string, collapsed: boolean) {
		await fetch(`/c/${campaignId}/collapse`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ headingId, collapsed })
		});
	}

	/** Hide DOM nodes following a collapsed heading up to the next sibling-or-higher heading. */
	function applyCollapse(list: HeadingEl[]) {
		for (let i = 0; i < list.length; i++) {
			const h = list[i];
			const collapsed = !!localMeta[h.id]?.collapsed;
			let node = h.el.nextElementSibling as HTMLElement | null;
			while (node && !isHigherOrEqualHeading(node, h.level)) {
				node.style.display = collapsed ? 'none' : '';
				node = node.nextElementSibling as HTMLElement | null;
			}
		}
	}

	function isHigherOrEqualHeading(node: HTMLElement, level: number): boolean {
		const l = node.getAttribute('data-level');
		return l !== null && Number(l) <= level;
	}

	function decorateHeadings() {
		if (!dm) return;
		const list = collectHeadings();
		for (let i = 0; i < list.length; i++) {
			const h = list[i];
			if (h.el.querySelector('.heading-controls')) continue;
			const controls = document.createElement('span');
			controls.className = 'heading-controls';
			controls.contentEditable = 'false';

			const collapseBtn = document.createElement('button');
			collapseBtn.className = 'collapse-btn';
			collapseBtn.type = 'button';
			collapseBtn.title = 'Collapse / expand';
			collapseBtn.textContent = localMeta[h.id]?.collapsed ? '▸' : '▾';
			collapseBtn.onclick = () => {
				const next = !localMeta[h.id]?.collapsed;
				localMeta[h.id] = {
					...(localMeta[h.id] ?? { shared: 0, collapsed: 0 }),
					collapsed: next ? 1 : 0
				};
				collapseBtn.textContent = next ? '▸' : '▾';
				applyCollapse(collectHeadings());
				postCollapse(h.id, next);
			};

			const share = document.createElement('input');
			share.type = 'checkbox';
			share.className = 'share-box';
			share.title = 'Share with players';
			share.checked = effectiveShared(i, list);
			share.onclick = (e) => {
				e.preventDefault();
				const currently = effectiveShared(i, collectHeadings());
				const next = currently ? 2 : 1; // hidden vs shared
				localMeta[h.id] = { ...(localMeta[h.id] ?? { shared: 0, collapsed: 0 }), shared: next };
				refreshShareBoxes();
				postShare(h.id, next);
			};

			controls.appendChild(collapseBtn);
			controls.appendChild(share);
			const handout = document.createElement('button');
			handout.type = 'button';
			handout.className = 'handout-btn';
			handout.title = 'Reveal handout to players now';
			handout.textContent = '📢';
			handout.onclick = () => postHandout(h.id);
			controls.appendChild(handout);
			h.el.prepend(controls);
		}
		applyCollapse(list);
		refreshShareBoxes();
	}

	function refreshShareBoxes() {
		const list = collectHeadings();
		for (let i = 0; i < list.length; i++) {
			const box = list[i].el.querySelector('.share-box') as HTMLInputElement | null;
			if (box) box.checked = effectiveShared(i, list);
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
				if (!p || p.closest('pre, code, a, button, .heading-controls, .map-embed')) {
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
		const roller = dm ? 'DM' : localStorage.getItem('dnd-roller-name') || 'Anonymous';
		const res = await fetch(`/c/${campaignId}/roll`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ roller, expression, secret: getSecret?.() ?? false })
		});
		if (res.ok) onroll?.((await res.json()) as RollData);
	}

	/** Handle clicks on wiki links: expand collapsed ancestors and scroll. */
	function onContainerClick(e: MouseEvent) {
		const link = (e.target as HTMLElement).closest('a.wiki-link') as HTMLAnchorElement | null;
		if (!link) return;
		e.preventDefault();
		const targetId = link.getAttribute('data-heading-id');
		if (!targetId) return;
		if (dm) expandAncestors(targetId);
		container
			.querySelector(`[data-heading-id="${CSS.escape(targetId)}"]`)
			?.scrollIntoView({ behavior: 'smooth', block: 'start' });
	}

	function expandAncestors(headingId: string) {
		const list = collectHeadings();
		let idx = list.findIndex((h) => h.id === headingId);
		if (idx === -1) return;
		// expand the chain of ancestors (and the target itself) so it's visible
		while (idx !== -1) {
			const h = list[idx];
			if (localMeta[h.id]?.collapsed) {
				localMeta[h.id] = { ...localMeta[h.id], collapsed: 0 };
				const btn = h.el.querySelector('.collapse-btn');
				if (btn) btn.textContent = '▾';
				postCollapse(h.id, false);
			}
			idx = h.parent;
		}
		applyCollapse(list);
	}

	$effect(() => {
		// re-run whenever html changes
		void html;
		if (!container) return;
		// tear down old map instances before innerHTML swap
		for (const [, inst] of mapInstances) unmount(inst);
		mapInstances.clear();
		container.innerHTML = html;
		decorateHeadings();
		decorateDice();
		hydrateMaps();
		onrender?.(container);
	});
</script>

<!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
<div class="rendered" class:dm bind:this={container} onclick={onContainerClick}></div>

<style>
	.rendered {
		line-height: 1.55;
		word-wrap: break-word;
		font-family: var(--font-body);
		font-size: 1.35rem;
		color: var(--ink);
	}
	.rendered :global(h1),
	.rendered :global(h2),
	.rendered :global(h3),
	.rendered :global(h4),
	.rendered :global(h5),
	.rendered :global(h6) {
		position: relative;
		font-family: var(--font-display);
		color: var(--accent);
		letter-spacing: 0.02em;
	}
	.rendered :global(h1) {
		border-bottom: 1px solid var(--gold);
		padding-bottom: 0.25rem;
	}
	.rendered :global(h3),
	.rendered :global(h4),
	.rendered :global(h5),
	.rendered :global(h6) {
		color: var(--ink);
	}
	/* drop cap on the first paragraph of each top-level section */
	.rendered :global(h1 + p)::first-letter {
		font-family: var(--font-display);
		font-size: 3.1em;
		font-weight: 700;
		float: left;
		line-height: 0.85;
		padding: 0.05em 0.12em 0 0;
		color: var(--accent);
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
	.rendered :global(.heading-controls) {
		display: inline-flex;
		gap: 0.3rem;
		align-items: center;
		margin-right: 0.5rem;
		vertical-align: middle;
	}
	.rendered :global(.collapse-btn) {
		border: 0;
		background: none;
		cursor: pointer;
		font-size: 0.8em;
		color: #6b7280;
		padding: 0;
		width: 1em;
	}
	.rendered :global(.share-box) {
		cursor: pointer;
	}
	.rendered :global(.handout-btn) {
		border: 1px solid var(--gold);
		background: var(--parchment-deep);
		cursor: pointer;
		border-radius: 4px;
		font-size: 0.8em;
		padding: 0 0.25rem;
		line-height: 1.2;
	}
	.rendered :global(.handout-btn:hover) {
		background: var(--rule);
	}
	.rendered :global(.handout-flash) {
		animation: handout-pulse 2s ease-out;
	}

	@keyframes handout-pulse {
		0% {
			background: var(--gold);
		}
		100% {
			background: transparent;
		}
	}
	.rendered :global(img) {
		max-width: 100%;
		height: auto;
	}
	.rendered :global(pre) {
		background: var(--parchment-deep);
		border: 1px solid var(--rule);
		padding: 0.8rem;
		border-radius: 6px;
		overflow: auto;
		font-size: 0.85em;
	}
	.rendered :global(code) {
		font-family: ui-monospace, monospace;
	}
	.rendered :global(.dice-inline) {
		border: 1px solid var(--gold);
		background: var(--parchment-deep);
		color: var(--accent);
		border-radius: 4px;
		padding: 0 0.35rem;
		font: inherit;
		font-size: 0.9em;
		font-weight: 600;
		cursor: pointer;
	}
	.rendered :global(.dice-inline:hover) {
		background: var(--rule);
	}
	.rendered :global(a.wiki-link) {
		color: var(--accent);
		text-decoration: none;
		border-bottom: 1px solid var(--gold);
		cursor: pointer;
	}
	.rendered :global(.wiki-missing) {
		color: var(--accent-soft);
		border-bottom: 1px dashed var(--accent-soft);
	}
	/* stat-block: classic 5e monster panel via blockquote */
	.rendered :global(blockquote) {
		margin: 1.4rem 0;
		padding: 0.7rem 1.1rem;
		background: var(--parchment-deep);
		border-top: 3px solid var(--accent);
		border-bottom: 3px solid var(--accent);
		box-shadow: var(--shadow);
		color: var(--ink);
	}
	.rendered :global(blockquote p:first-child strong:first-child) {
		font-family: var(--font-display);
		color: var(--accent);
		font-size: 1.15em;
	}
</style>
