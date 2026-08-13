import { $prose } from '@milkdown/utils';
import type { MilkdownPlugin } from '@milkdown/ctx';
import type { Node as ProseNode } from '@milkdown/prose/model';
import { Plugin, PluginKey } from '@milkdown/prose/state';
import { Decoration, DecorationSet, type EditorView } from '@milkdown/prose/view';
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
	let currentView: EditorView | undefined;
	/** pos of the heading whose section is currently hovered (for the highlight). */
	let hoveredPos: number | null = null;
	/** the currently-highlighted section's doc range (heading start .. section end), if any. */
	let hlRange: { from: number; to: number } | null = null;
	/** sorted heading start positions + levels, rebuilt each decoration pass. */
	const sectionIndex: { pos: number; level: number }[] = [];
	/** heading id -> parent heading id (built during decoration traversal). */
	let headingParents = new Map<string, string | null>();

	const key = new PluginKey('dnd-interactive');

	/** Hierarchical visibility: a hidden ancestor hides all descendants below it. */
	function effectiveShared(id: string | null): boolean {
		let cur: string | null = id;
		let anyShared = false;
		while (cur !== null) {
			const state = meta.get(cur)?.shared ?? 0;
			if (state === 2) return false; // hidden ancestor hides everything below
			if (state === 1) anyShared = true;
			cur = headingParents.get(cur) ?? null;
		}
		return anyShared;
	}

	function makeHeadingControls(id: string): HTMLElement {
		const dom = document.createElement('span');
		dom.className = 'dm-heading-controls';
		dom.contentEditable = 'false';
		// pinned in the fixed left gutter (ProseMirror padding-left = 4rem, inset 0.4rem)
		dom.style.left = `calc(-4rem + 0.4rem)`;

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
			// recompute decorations so the hidden content shows/hides
			currentView?.dispatch(currentView.state.tr);
		};

		// single show/hide toggle for players: 👁 reveal, 🙈 hide. Reveal uses the
		// handout flow (live reveal + scroll/flash), hide unshares.
		const vis = document.createElement('button');
		vis.type = 'button';
		vis.className = 'dhc-vis';
		vis.textContent = effectiveShared(id) ? '🙈' : '👁';
		vis.title = effectiveShared(id) ? 'Hide from players' : 'Reveal to players';
		vis.onmousedown = (e) => e.stopPropagation();
		vis.onclick = (e) => {
			e.stopPropagation();
			const shared = effectiveShared(id);
			if (shared) {
				// currently visible to players -> hide
				meta.set(id, { ...st(), shared: 2 });
				fetch(`/c/${campaignId}/share`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ headingId: id, state: 2 })
				});
			} else {
				// hidden -> reveal live (handout flow)
				meta.set(id, { ...st(), shared: 1 });
				fetch(`/c/${campaignId}/handout`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ headingId: id })
				});
			}
			// recompute decorations so the re-rendered button reflects the new state
			currentView?.dispatch(currentView.state.tr);
		};

		const btns = document.createElement('span');
		btns.className = 'dhc-btns';
		btns.append(collapse, vis);
		dom.append(btns);
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
			props: {
				decorations(state) {
					const decos: Decoration[] = [];
					const headings: { pos: number; node: ProseNode }[] = [];
					headingParents = new Map<string, string | null>();
					const stack: number[] = []; // indices of open ancestor headings
					state.doc.descendants((node, pos) => {
						if (node.type.name === 'heading') {
							const level = node.attrs.level as number;
							while (
								stack.length &&
								(headings[stack[stack.length - 1]].node.attrs.level as number) >= level
							) {
								stack.pop();
							}
							const parentIdx = stack.length ? stack[stack.length - 1] : null;
							const id = headingId(node);
							headings.push({ pos, node });
							if (id) {
								const parentId =
									parentIdx !== null ? headingId(headings[parentIdx].node) : null;
								headingParents.set(id, parentId);
								// controls at the START of the heading, in the gutter
								decos.push(
									Decoration.widget(pos + 1, () => makeHeadingControls(id), {
										side: -1
									})
								);
							}
							stack.push(headings.length - 1);
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
					// rebuild the section index used by the hover highlight
					sectionIndex.length = 0;
					for (const h of headings) {
						sectionIndex.push({ pos: h.pos, level: h.node.attrs.level as number });
					}
					// collapse: hide content below a collapsed heading until the next heading of <= level
					for (let i = 0; i < headings.length; i++) {
						const { pos, node } = headings[i];
						const id = headingId(node);
						if (!id || !meta.get(id)?.collapsed) continue;
						const level = node.attrs.level as number;
						let j = i + 1;
						while (j < headings.length && (headings[j].node.attrs.level as number) > level) j++;
						const from = pos + node.nodeSize;
						const to = j < headings.length ? headings[j].pos : state.doc.content.size;
						if (to <= from) continue;
						state.doc.nodesBetween(from, to, (child, cpos) => {
							if (!child.isInline && !child.isText) {
								decos.push(
									Decoration.node(cpos, cpos + child.nodeSize, { class: 'collapsed-child' })
								);
							}
						});
					}
					// section highlight: when the caret sits in a section (or the mouse hovers it),
					// tint the heading and every block below it up to the next heading of <= level,
					// so the section reads as one unit.
					let caretHeading: number | null = null;
					const sel = state.selection;
					if (sel) {
						const p = sel.$from.pos;
						for (const si of sectionIndex) {
							if (si.pos <= p) caretHeading = si.pos;
							else break;
						}
					}
					// mouse hover wins transiently while present; otherwise the caret's section shows
					const target = hoveredPos ?? caretHeading;
					hlRange = null;
					if (target !== null) {
						const hi = headings.findIndex((h) => h.pos === target);
						if (hi >= 0) {
							const { pos, node } = headings[hi];
							const level = node.attrs.level as number;
							let j = hi + 1;
							while (j < headings.length && (headings[j].node.attrs.level as number) > level) j++;
							const from = pos + node.nodeSize;
							const to = j < headings.length ? headings[j].pos : state.doc.content.size;
							hlRange = { from: pos, to };
							// the heading row itself
							decos.push(Decoration.node(pos, pos + node.nodeSize, { class: 'section-hl' }));
							if (to > from) {
								state.doc.nodesBetween(from, to, (child, cpos) => {
									if (!child.isInline && !child.isText) {
										decos.push(
											Decoration.node(cpos, cpos + child.nodeSize, { class: 'section-hl' })
										);
									}
								});
							}
						}
					}
					return DecorationSet.create(state.doc, decos);
				}
			},
			view(view) {
				currentView = view;
				const onMouseDown = (e: MouseEvent) => {
					const target = e.target as HTMLElement;
					// widgets handle their own clicks
					if (target.closest('.map-widget, .dm-heading-controls')) return;
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
				const onMouseOver = (e: MouseEvent) => {
					// any block-level element belongs to the section of the heading that
					// precedes it; map it back so hovering anywhere in a section highlights it
					const block = (e.target as HTMLElement).closest(
						'h1,h2,h3,h4,h5,h6,p,ul,ol,li,blockquote,pre,hr,.map-widget'
					);
					if (!block) {
						if (hoveredPos !== null) {
							hoveredPos = null;
							view.dispatch(view.state.tr);
						}
						return;
					}
					const P = view.posAtDOM(block, 0);
					let hPos: number | null = null;
					for (const h of sectionIndex) {
						if (h.pos <= P) hPos = h.pos;
						else break;
					}
					if (hPos !== hoveredPos) {
						hoveredPos = hPos;
						view.dispatch(view.state.tr);
					}
				};
				view.dom.addEventListener('mouseover', onMouseOver);

				// A single box drawn as an overlay around the whole section (ProseMirror
				// renders the section's blocks as flat siblings, so a wrapper box needs a
				// measured overlay element instead of per-block backgrounds).
				let host: HTMLElement | null = null;
				let overlay: HTMLDivElement | null = null;
				const ensureOverlay = () => {
					if (overlay) return;
					host = view.dom.closest('.mdx-host') as HTMLElement | null;
					if (!host) return;
					host.style.position = 'relative';
					overlay = document.createElement('div');
					overlay.className = 'section-box';
					overlay.style.display = 'none';
					host.appendChild(overlay);
				};
				const updateOverlay = () => {
					if (!overlay || !host) return;
					if (!hlRange) {
						overlay.style.display = 'none';
						return;
					}
					const blocks = view.dom.querySelectorAll('.section-hl');
					if (!blocks.length) {
						overlay.style.display = 'none';
						return;
					}
					let l = Infinity,
						t = Infinity,
						r = -Infinity,
						b = -Infinity;
					for (const el of blocks) {
						const rc = (el as HTMLElement).getBoundingClientRect();
						l = Math.min(l, rc.left);
						t = Math.min(t, rc.top);
						r = Math.max(r, rc.right);
						b = Math.max(b, rc.bottom);
					}
					const hr = host.getBoundingClientRect();
					overlay.style.display = 'block';
					overlay.style.left = `${l - hr.left}px`;
					overlay.style.top = `${t - hr.top}px`;
					overlay.style.width = `${r - l}px`;
					overlay.style.height = `${b - t}px`;
				};
				ensureOverlay();
				const onScroll = () => updateOverlay();
				const onResize = () => updateOverlay();
				(host as HTMLElement | null)?.addEventListener('scroll', onScroll);
				window.addEventListener('resize', onResize);

				return {
					update() {
						ensureOverlay();
						updateOverlay();
					},
					destroy: () => {
						view.dom.removeEventListener('mousedown', onMouseDown);
						view.dom.removeEventListener('mouseover', onMouseOver);
						host?.removeEventListener('scroll', onScroll);
						window.removeEventListener('resize', onResize);
						overlay?.remove();
						overlay = null;
						host = null;
						hoveredPos = null;
						hlRange = null;
						currentView = undefined;
					}
				};
			}
		});
	});
}
