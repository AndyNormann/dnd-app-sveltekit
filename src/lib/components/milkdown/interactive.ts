import { $prose } from '@milkdown/utils';
import type { MilkdownPlugin } from '@milkdown/ctx';
import type { Node as ProseNode } from '@milkdown/prose/model';
import { Plugin, PluginKey } from '@milkdown/prose/state';
import { Decoration, DecorationSet } from '@milkdown/prose/view';
import { INLINE_DICE_RE } from '$lib/dice';

export interface HeadingMeta {
	shared: number; // 0 inherit, 1 shared, 2 hidden
	collapsed: boolean;
}

export interface InteractiveOptions {
	campaignId: string;
	/** Read the DM's secret-roll toggle so inline dice respect it. */
	isSecret?: () => boolean;
	meta: Map<string, HeadingMeta>;
}

const ID_MARKER = /<!--id:([A-Za-z0-9_-]+)-->/;
const WIKI_RE = /\[\[([^\][]+)\]\]/g;

/** Find the app's `<!--id:...-->` marker inside a heading's inline children. */
function headingId(node: ProseNode): string | null {
	let out: string | null = null;
	node.forEach((child) => {
		if (out) return;
		const value =
			child.type.name === 'html' ? child.attrs?.value ?? '' : child.textContent ?? '';
		const m = String(value).match(ID_MARKER);
		if (m) out = m[1];
	});
	return out;
}

/**
 * A ProseMirror decoration plugin (added via `$prose`) that overlays:
 *  - click-to-roll dice expressions,
 *  - click-to-jump `[[wiki links]]`,
 *  - per-heading DM controls (share / collapse / 📢 handout).
 *
 * The document text stays normal editable markdown; the interactivity is
 * purely presentational (inline class decorations + a delegated click handler
 * on the editor DOM), so round-tripping to markdown is lossless.
 */
export function buildInteractivePlugin(opts: InteractiveOptions): MilkdownPlugin {
	const { campaignId } = opts;
	const meta = opts.meta;

	const key = new PluginKey('dnd-interactive');

	function effectiveShared(id: string): boolean {
		// For now, only the heading's own explicit state drives the checkbox.
		return meta.get(id)?.shared === 1;
	}

	function makeHeadingControls(id: string): HTMLElement {
		const dom = document.createElement('span');
		dom.className = 'dm-heading-controls';
		dom.contentEditable = 'false';

		const st = () => meta.get(id) ?? { shared: 0, collapsed: false };

		const collapse = document.createElement('button');
		collapse.type = 'button';
		collapse.className = 'dhc-collapse';
		collapse.title = 'Collapse from players';
		collapse.textContent = st().collapsed ? '▸' : '▾';
		collapse.onmousedown = (e) => e.stopPropagation();
		collapse.onclick = (e) => {
			e.stopPropagation();
			const next = !st().collapsed;
			meta.set(id, { ...st(), collapsed: next });
			collapse.textContent = next ? '▸' : '▾';
			fetch(`/c/${campaignId}/collapse`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ headingId: id, collapsed: next })
			});
		};

		const share = document.createElement('input');
		share.type = 'checkbox';
		share.className = 'dhc-share';
		share.title = 'Share with players';
		share.checked = effectiveShared(id);
		share.onmousedown = (e) => e.stopPropagation();
		share.onclick = (e) => {
			e.preventDefault();
			e.stopPropagation();
			const cur = effectiveShared(id);
			const next = cur ? 2 : 1;
			meta.set(id, { ...st(), shared: next });
			share.checked = !cur;
			fetch(`/c/${campaignId}/share`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ headingId: id, state: next })
			});
		};

		const handout = document.createElement('button');
		handout.type = 'button';
		handout.className = 'dhc-handout';
		handout.title = 'Reveal handout to players now';
		handout.textContent = '📢';
		handout.onmousedown = (e) => e.stopPropagation();
		handout.onclick = (e) => {
			e.stopPropagation();
			fetch(`/c/${campaignId}/handout`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ headingId: id })
			});
		};

		dom.append(collapse, share, handout);
		return dom;
	}

	function rollExpression(expression: string) {
		fetch(`/c/${campaignId}/roll`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				roller: 'DM',
				expression,
				secret: opts.isSecret?.() ?? false
			})
		});
	}

	function jumpToWiki(name: string) {
		// find the heading whose rendered text matches and scroll to it
		const viewDom = document.querySelector('.mdx-host .ProseMirror') ?? null;
		if (!viewDom) return;
		const target = Array.from(viewDom.querySelectorAll('h1,h2,h3,h4,h5,h6')).find(
			(h) => (h.textContent ?? '').trim().toLowerCase() === name.toLowerCase()
		) as HTMLElement | undefined;
		target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
	}

	return $prose((ctx) => {
		void ctx;
		return new Plugin({
			key,
			state: {
				init: () => DecorationSet.empty,
				apply(tr, set) {
					if (!tr.docChanged) return set.map(tr.mapping, tr.doc);
					return set;
				}
			},
			props: {
				decorations(state) {
					const decos: Decoration[] = [];
					state.doc.descendants((node, pos) => {
						if (node.type.name === 'heading') {
							const id = headingId(node);
							if (id) {
								decos.push(
									Decoration.widget(pos + 1, () => makeHeadingControls(id), {
										side: 1
									})
								);
							}
						} else if (node.isText) {
							const text = node.text ?? '';
							INLINE_DICE_RE.lastIndex = 0;
							for (const m of text.matchAll(INLINE_DICE_RE)) {
								decos.push(
									Decoration.inline(
										pos + (m.index ?? 0),
										pos + (m.index ?? 0) + m[0].length,
										{ class: 'dice-dec' }
									)
								);
							}
							WIKI_RE.lastIndex = 0;
							for (const m of text.matchAll(WIKI_RE)) {
								decos.push(
									Decoration.inline(
										pos + (m.index ?? 0),
										pos + (m.index ?? 0) + m[0].length,
										{ class: 'wiki-dec' }
									)
								);
							}
						}
						return true;
					});
					return DecorationSet.create(state.doc, decos);
				}
			},
			view(view) {
				const onMouseDown = (e: MouseEvent) => {
					const target = e.target as HTMLElement;
					if (target.closest('.dm-heading-controls')) return; // widget handles its own clicks
					const dice = target.closest('.dice-dec') as HTMLElement | null;
					if (dice) {
						e.preventDefault();
						e.stopPropagation();
						rollExpression(dice.textContent ?? '');
						return;
					}
					const wiki = target.closest('.wiki-dec') as HTMLElement | null;
					if (wiki) {
						e.preventDefault();
						e.stopPropagation();
						const m = (wiki.textContent ?? '').match(/\[\[([^\][]+)\]\]/);
						if (m) jumpToWiki(m[1].trim());
					}
				};
				view.dom.addEventListener('mousedown', onMouseDown);
				return {
					destroy: () => view.dom.removeEventListener('mousedown', onMouseDown)
				};
			}
		});
	});
}
