<script lang="ts">
	import { mount, unmount } from 'svelte';
	import MapView from './MapView.svelte';
	import { INLINE_DICE_RE } from '$lib/dice';
	import type { MapData, RevealOp, RollData } from '$lib/types';

	let {
		html,
		dm = false,
		campaignId,
		maps = [],
		meta = {},
		onrender,
		onroll
	}: {
		html: string;
		dm?: boolean;
		campaignId: string;
		maps?: MapData[];
		meta?: Record<string, { shared: number; collapsed: number }>;
		onrender?: (container: HTMLElement) => void;
		onroll?: (roll: RollData) => void;
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

	interface HeadingEl {
		el: HTMLElement;
		id: string;
		level: number;
		parent: number;
	}

	function collectHeadings(): HeadingEl[] {
		const nodes = Array.from(container.querySelectorAll('[data-heading-id]')) as HTMLElement[];
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
			body: JSON.stringify({ roller, expression, secret: false })
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
		line-height: 1.6;
		word-wrap: break-word;
	}
	.rendered :global(h1),
	.rendered :global(h2),
	.rendered :global(h3),
	.rendered :global(h4),
	.rendered :global(h5),
	.rendered :global(h6) {
		position: relative;
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
	.rendered :global(img) {
		max-width: 100%;
		height: auto;
	}
	.rendered :global(pre) {
		background: #f4f4f5;
		padding: 0.8rem;
		border-radius: 6px;
		overflow: auto;
	}
	.rendered :global(code) {
		font-family: ui-monospace, monospace;
	}
	.rendered :global(.dice-inline) {
		border: 1px solid #c4b5fd;
		background: #f5f3ff;
		color: #5b21b6;
		border-radius: 4px;
		padding: 0 0.3rem;
		font: inherit;
		font-size: 0.9em;
		cursor: pointer;
	}
	.rendered :global(.dice-inline:hover) {
		background: #ede9fe;
	}
	.rendered :global(a.wiki-link) {
		color: #5b21b6;
		text-decoration: none;
		border-bottom: 1px solid #c4b5fd;
		cursor: pointer;
	}
	.rendered :global(.wiki-missing) {
		color: #dc2626;
		border-bottom: 1px dashed #fca5a5;
	}
	.rendered :global(blockquote) {
		border-left: 3px solid #ddd;
		margin-left: 0;
		padding-left: 1rem;
		color: #555;
	}
</style>
