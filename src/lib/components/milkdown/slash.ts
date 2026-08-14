import { $prose } from '@milkdown/utils';
import type { MilkdownPlugin } from '@milkdown/ctx';
import { Plugin, PluginKey, TextSelection } from '@milkdown/prose/state';
import { setBlockType } from '@milkdown/prose/commands';
import type { EditorView } from '@milkdown/prose/view';
import type { MapData } from '$lib/types';

export interface SlashOptions {
	campaignId: string;
	/** Push a freshly uploaded map into the live maps list so the inserted block resolves. */
	addMap: (map: MapData) => void;
	/** Existing campaign maps, so `/map` can offer "pick an existing map". */
	getMaps?: () => MapData[];
}

interface MenuItem {
	act: string;
	label: string;
	title: string;
}

const ITEMS: MenuItem[] = [
	{ act: 'map', label: '🗺 Map', title: 'Upload a map and insert it here' },
	{ act: 'h1', label: 'H1', title: 'Heading 1' },
	{ act: 'h2', label: 'H2', title: 'Heading 2' },
	{ act: 'h3', label: 'H3', title: 'Heading 3' },
	{ act: 'wiki', label: '[[Wiki]]', title: 'Insert a wiki link' },
	{ act: 'hr', label: '──── Divider', title: 'Insert a horizontal divider' }
];

/**
 * A lightweight `/` slash menu (map upload at caret, headings, wiki link,
 * divider) implemented as a `$prose` plugin so it runs client-only inside the
 * Milkdown editor. Typing `/` at the start of a block opens a floating menu
 * near the caret.
 */
export function buildSlashPlugin(opts: SlashOptions): MilkdownPlugin {
	const { campaignId, addMap, getMaps } = opts;
	const key = new PluginKey('dnd-slash');

	let activeView: EditorView | undefined;
	let menu: HTMLElement;
	let mapsMenu: HTMLElement;
	let fileInput: HTMLInputElement;
	let lastPos = 0;

	function hide() {
		if (menu) menu.style.display = 'none';
	}

	function positionMenu(view: EditorView, pos: number) {
		const coords = view.coordsAtPos(pos);
		menu.style.display = 'block';
		const rect = menu.getBoundingClientRect();
		let left = coords.left;
		let top = coords.bottom + 6;
		if (left + rect.width > window.innerWidth - 8) left = window.innerWidth - rect.width - 8;
		if (top + rect.height > window.innerHeight - 8) {
			top = Math.max(8, coords.top - rect.height - 6);
		}
		menu.style.left = `${left}px`;
		menu.style.top = `${top}px`;
	}

	function run(view: EditorView, act: string) {
		hide();
		view.focus();
		if (act === 'map') {
			const existing = getMaps?.() ?? [];
			if (existing.length > 0) {
				showMapsMenu(view, existing);
			} else {
				fileInput.click();
			}
			return;
		}
		const { schema } = view.state;
		if (act === 'h1' || act === 'h2' || act === 'h3') {
			const heading = schema.nodes.heading;
			const level = Number(act[1]);
			setBlockType(heading, { level })(view.state, view.dispatch);
			return;
		}
		if (act === 'wiki') {
			const text = '[[Name]]';
			const from = view.state.selection.from;
			const tr = view.state.tr.insertText(text, from);
			tr.setSelection(TextSelection.create(tr.doc, from + 2, from + 6));
			view.dispatch(tr);
			return;
		}
		if (act === 'hr') {
			const hr = schema.nodes.horizontal_rule ?? schema.nodes.hr;
			if (hr) {
				view.dispatch(view.state.tr.replaceSelectionWith(hr.create()));
			} else {
				view.dispatch(view.state.tr.insertText('---\n\n'));
			}
		}
	}

	function hideMapsMenu() {
		if (mapsMenu) mapsMenu.style.display = 'none';
	}

	function insertExistingMap(view: EditorView, mapId: string) {
		hideMapsMenu();
		view.focus();
		const mapType = view.state.schema.nodes.mapBlock;
		if (mapType) view.dispatch(view.state.tr.replaceSelectionWith(mapType.create({ mapId })));
	}

	function showMapsMenu(view: EditorView, maps: MapData[]) {
		if (!mapsMenu) return;
		mapsMenu.textContent = '';
		const heading = document.createElement('div');
		heading.className = 'dnd-slash-maps-title';
		heading.textContent = 'Insert map';
		mapsMenu.appendChild(heading);
		for (const m of maps) {
			const b = document.createElement('button');
			b.type = 'button';
			b.className = 'dnd-slash-item dnd-slash-map';
			b.dataset.mapId = m.id;
			b.textContent = `🗺 ${m.width}x${m.height}`;
			b.title = m.id;
			b.onmousedown = (e) => e.preventDefault();
			b.onclick = (e) => {
				e.stopPropagation();
				if (activeView) insertExistingMap(activeView, m.id);
			};
			mapsMenu.appendChild(b);
		}
		const up = document.createElement('button');
		up.type = 'button';
		up.className = 'dnd-slash-item dnd-slash-map-upload';
		up.textContent = '⬆ Upload new map';
		up.onmousedown = (e) => e.preventDefault();
		up.onclick = (e) => {
			e.stopPropagation();
			hideMapsMenu();
			fileInput.click();
		};
		mapsMenu.appendChild(up);
		// position near the caret
		const coords = view.coordsAtPos(lastPos);
		mapsMenu.style.display = 'block';
		const rect = mapsMenu.getBoundingClientRect();
		let left = coords.left;
		let top = coords.bottom + 6;
		if (left + rect.width > window.innerWidth - 8) left = window.innerWidth - rect.width - 8;
		if (top + rect.height > window.innerHeight - 8) top = Math.max(8, coords.top - rect.height - 6);
		mapsMenu.style.left = `${left}px`;
		mapsMenu.style.top = `${top}px`;
	}

	async function uploadAndInsert(view: EditorView, file: File) {
		const bitmap = await createImageBitmap(file);
		const fd = new FormData();
		fd.append('file', file);
		fd.append('width', String(bitmap.width));
		fd.append('height', String(bitmap.height));
		const res = await fetch(`/c/${campaignId}/maps`, { method: 'POST', body: fd });
		if (!res.ok) return;
		const map = (await res.json()) as MapData;
		addMap(map); // push into live maps list BEFORE the node mounts
		const mapType = view.state.schema.nodes.mapBlock;
		if (mapType) view.dispatch(view.state.tr.replaceSelectionWith(mapType.create({ mapId: map.id })));
		view.focus();
	}

	return $prose((ctx) => {
		void ctx;
		return new Plugin({
			key,
			props: {
				handleTextInput(view, _from, _to, text) {
					if (menu && menu.style.display !== 'none' && text !== '/') {
						hide();
						return false; // let the char insert normally
					}
					if (text !== '/') return false;
					const from = view.state.selection.from;
					const $from = view.state.doc.resolve(from);
					const before = $from.parent.textBetween(0, $from.parentOffset, undefined, '\ufffc');
					if (before.trim() !== '') return false; // only trigger at block start
					lastPos = from;
					positionMenu(view, from);
					return true; // consume the slash
				}
			},
			view(view) {
				activeView = view;

				menu = document.createElement('div');
				menu.className = 'dnd-slash';
				menu.style.display = 'none';
				for (const item of ITEMS) {
					const b = document.createElement('button');
					b.type = 'button';
					b.className = `dnd-slash-item dnd-slash-${item.act}`;
					b.dataset.act = item.act;
					b.textContent = item.label;
					b.title = item.title;
					b.onmousedown = (e) => e.preventDefault(); // keep editor focus
					b.onclick = (e) => {
						e.stopPropagation();
						if (activeView) run(activeView, item.act);
					};
					menu.appendChild(b);
				}
				document.body.appendChild(menu);

				mapsMenu = document.createElement('div');
				mapsMenu.className = 'dnd-slash-maps';
				mapsMenu.style.display = 'none';
				document.body.appendChild(mapsMenu);

				fileInput = document.createElement('input');
				fileInput.type = 'file';
				fileInput.accept = 'image/*';
				fileInput.className = 'dnd-slash-file';
				fileInput.style.display = 'none';
				fileInput.onchange = () => {
					const file = fileInput.files?.[0];
					if (file && activeView) uploadAndInsert(activeView, file);
					fileInput.value = '';
				};
				document.body.appendChild(fileInput);

				const onKey = (e: KeyboardEvent) => {
					if (e.key === 'Escape' || e.key === 'Enter') {
						hide();
						hideMapsMenu();
					}
				};
				const onDocMouseDown = (e: MouseEvent) => {
					if (menu && menu.style.display !== 'none' && !menu.contains(e.target as Node)) hide();
					if (mapsMenu && mapsMenu.style.display !== 'none' && !mapsMenu.contains(e.target as Node))
						hideMapsMenu();
				};
				view.dom.addEventListener('keydown', onKey);
				document.addEventListener('mousedown', onDocMouseDown);
				return {
					destroy: () => {
						view.dom.removeEventListener('keydown', onKey);
						document.removeEventListener('mousedown', onDocMouseDown);
						menu?.remove();
						mapsMenu?.remove();
						fileInput?.remove();
						activeView = undefined;
					}
				};
			}
		});
	});
}
