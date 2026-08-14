import { $prose } from '@milkdown/utils';
import type { MilkdownPlugin } from '@milkdown/ctx';
import type { Node as ProseNode } from '@milkdown/prose/model';
import { Plugin, PluginKey } from '@milkdown/prose/state';
import { Decoration, DecorationSet, type EditorView } from '@milkdown/prose/view';
import { INLINE_DICE_RE } from '$lib/dice';

export interface InteractiveOptions {
	campaignId: string;
	/** Read the DM's secret-roll toggle so inline dice respect it. */
	isSecret?: () => boolean;
}

const WIKI_RE = /\[\[([^\][]+)\]\]/g;

/**
 * A ProseMirror decoration plugin (added via `$prose`) that overlays:
 *  - click-to-roll dice expressions,
 *  - click-to-open `[[wiki links]]` (document or `Doc#Heading`).
 *
 * The document text stays normal editable markdown; the interactivity is purely
 * presentational (inline class decorations + a delegated click handler on the
 * editor DOM), so round-tripping to markdown is lossless.
 */
export function buildInteractivePlugin(opts: InteractiveOptions): MilkdownPlugin {
	const { campaignId } = opts;
	let currentView: EditorView | undefined;

	const key = new PluginKey('dnd-interactive');

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

	/** Open a wiki link target: `Doc` or `Doc#Heading`. */
	function jumpToWiki(target: string) {
		const viewDom = document.querySelector('.mdx-host .ProseMirror') ?? null;
		if (!viewDom) return;
		const name = target.replace(/^#/, '').trim().toLowerCase();
		const els = viewDom.querySelectorAll('h1,h2,h3,h4,h5,h6');
		// prefer an exact heading; otherwise the heading whose text starts with it
		const found = Array.from(els).find(
			(h) => (h.textContent ?? '').trim().toLowerCase() === name
		) ?? Array.from(els).find((h) => (h.textContent ?? '').trim().toLowerCase().startsWith(name));
		(found as HTMLElement | undefined)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
	}

	return $prose((ctx) => {
		void ctx;
		return new Plugin({
			key,
			props: {
				decorations(state) {
					const decos: Decoration[] = [];
					state.doc.descendants((node, pos) => {
						if (node.isText) {
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
				currentView = view;
				const onMouseDown = (e: MouseEvent) => {
					const target = e.target as HTMLElement;
					// map widgets handle their own clicks
					if (target.closest('.map-widget')) return;
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
					destroy: () => {
						view.dom.removeEventListener('mousedown', onMouseDown);
						currentView = undefined;
					}
				};
			}
		});
	});
}
