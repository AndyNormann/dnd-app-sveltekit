import { $prose } from '@milkdown/utils';
import type { MilkdownPlugin } from '@milkdown/ctx';
import { Plugin, PluginKey } from '@milkdown/prose/state';
import type { EditorView } from '@milkdown/prose/view';

export interface WikiAutocompleteOptions {
	/** The campaign's documents, suggested as `[[Doc]]` link targets. */
	documents?: () => { id: string; title: string }[];
}

/**
 * As-you-type autocomplete for `[[wiki links]]`: once the DM types `[[` (and an
 * opening bracket isn't yet closed), a small popup lists matching documents to
 * complete the link. Arrow keys / Enter select, Escape closes, and a click picks
 * an item. The completed link stays a normal editable `[[Doc]]` markdown link.
 */
export function buildWikiAutocompletePlugin(opts: WikiAutocompleteOptions): MilkdownPlugin {
	const key = new PluginKey('dnd-wiki-autocomplete');

	let popup: HTMLElement | null = null;
	let viewRef: EditorView | null = null;
	let items: string[] = [];
	let selected = 0;
	let from = 0; // doc position of the opening '[['
	let to = 0; // current caret position

	function renderItems() {
		const p = popup;
		if (!p) return;
		p.textContent = '';
		if (items.length === 0) {
			const none = document.createElement('div');
			none.className = 'dnd-wiki-none';
			none.textContent = 'No matching documents';
			p.appendChild(none);
			return;
		}
		items.forEach((title, i) => {
			const b = document.createElement('button');
			b.type = 'button';
			b.className = `dnd-wiki-item${i === selected ? ' sel' : ''}`;
			b.textContent = title;
			b.onmousedown = (e) => e.preventDefault(); // keep editor focus
			b.onclick = (e) => {
				e.stopPropagation();
				accept(title);
			};
			p.appendChild(b);
		});
	}

	function show() {
		if (popup && viewRef) {
			popup.style.display = 'block';
			const coords = viewRef.coordsAtPos(to);
			const rect = popup.getBoundingClientRect();
			let left = coords.left;
			let top = coords.bottom + 6;
			if (left + rect.width > window.innerWidth - 8) left = window.innerWidth - rect.width - 8;
			if (top + rect.height > window.innerHeight - 8) top = Math.max(8, coords.top - rect.height - 6);
			popup.style.left = `${left}px`;
			popup.style.top = `${top}px`;
			renderItems();
		}
	}

	function hide() {
		if (popup) popup.style.display = 'none';
	}

	function accept(title: string) {
		if (!viewRef) return;
		const view = viewRef;
		const tr = view.state.tr.replaceWith(from, to, view.state.schema.text(`[[${title}]]`));
		view.dispatch(tr);
		hide();
		view.focus();
	}

	function recompute(view: EditorView) {
		const { $from } = view.state.selection;
		const before = $from.parent.textBetween(0, $from.parentOffset, undefined, '\ufffc');
		const idx = before.lastIndexOf('[[');
		if (idx < 0) {
			hide();
			return;
		}
		const afterOpen = before.slice(idx + 2);
		if (afterOpen.includes(']]')) {
			hide();
			return;
		}
		const query = afterOpen.trim().toLowerCase();
		const docs = opts.documents?.() ?? [];
		const names = docs
			.map((d) => d.title.trim())
			.filter(Boolean)
			.filter((t) => t.toLowerCase().includes(query));
		// dedupe, keep stable order
		items = Array.from(new Set(names)).slice(0, 8);
		selected = 0;
		from = $from.pos - (before.length - idx); // doc pos of the '['
		to = $from.pos;
		show();
	}

	return $prose((ctx) => {
		void ctx;
		return new Plugin({
			key,
			props: {
				handleKeyDown(view, e) {
					if (!popup || popup.style.display === 'none') return false;
					if (e.key === 'ArrowDown') {
						selected = (selected + 1) % Math.max(1, items.length);
						renderItems();
						return true;
					}
					if (e.key === 'ArrowUp') {
						selected = (selected - 1 + Math.max(1, items.length)) % Math.max(1, items.length);
						renderItems();
						return true;
					}
					if (e.key === 'Enter' || e.key === 'Tab') {
						if (items.length > 0) {
							accept(items[Math.min(selected, items.length - 1)]);
							return true;
						}
					}
					if (e.key === 'Escape') {
						hide();
						return true;
					}
					return false;
				}
			},
			view(view) {
				viewRef = view;
				popup = document.createElement('div');
				popup.className = 'dnd-wiki-pop';
				popup.style.display = 'none';
				document.body.appendChild(popup);
				return {
					update: (view) => {
						recompute(view);
					},
					destroy: () => {
						popup?.remove();
						popup = null;
						viewRef = null;
					}
				};
			}
		});
	});
}
