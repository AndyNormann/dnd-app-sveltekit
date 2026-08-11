import { $node, $view } from '@milkdown/utils';
import { mount, unmount } from 'svelte';
import MapView from '../MapView.svelte';
import type { MapData, TokenData } from '$lib/types';

const mapInstances = new Map<string, ReturnType<typeof mount>>();
let getMaps: () => MapData[] = () => [];
let campaignId = '';

/** Configure the map node with the current campaign + map data source. */
export function configureMaps(cfg: { campaignId: string; getMaps: () => MapData[] }) {
	campaignId = cfg.campaignId;
	getMaps = cfg.getMaps;
}

const DIRECTIVE_RE = /^::map\{id=([^}]+)\}$/;

/**
 * A remark transformer that converts `::map{id=...}` paragraphs into a
 * distinct `mapDirective` node, so the mapBlock node can be registered after
 * commonmark (paragraph stays the first block node, avoiding ProseMirror
 * filling an empty doc with mapBlock). Registered via remarkPluginsCtx.
 */
export const mapDirectiveTransformer: () => (tree: { children?: unknown[] }) => void = () => (
	tree
) => {
	if (!Array.isArray(tree.children)) return;
	const out: unknown[] = [];
	for (const child of tree.children) {
		const node = child as { type?: string; children?: { value?: string }[] };
		if (node.type === 'paragraph') {
			const text = (node.children ?? [])
				.map((c) => c.value ?? '')
				.join('')
				.trim();
			const m = text.match(DIRECTIVE_RE);
			if (m) {
				out.push({ type: 'mapDirective', value: m[1] });
				continue;
			}
		}
		out.push(child);
	}
	tree.children = out;
};

/** The `::map{id=...}` block node (atom). Registered AFTER commonmark. */
export const mapBlock = $node('mapBlock', () => ({
	atom: true,
	group: 'block',
	attrs: { mapId: { default: '' } },
	parseDOM: [
		{
			tag: 'div[data-map-id]',
			getAttrs: (dom) => {
				const id = (dom as HTMLElement).getAttribute('data-map-id') ?? '';
				if (!id) return null; // reject empty-id placeholders
				return { mapId: id };
			}
		}
	],
	toDOM: (node) => ['div', { class: 'map-block', 'data-map-id': node.attrs.mapId }],
	parseMarkdown: {
		match: (mdNode) => mdNode.type === 'mapDirective',
		runner: (state, mdNode, type) => {
			state.addNode(type, { mapId: String((mdNode as { value?: unknown }).value ?? '') });
		}
	},
	toMarkdown: {
		match: (node) => node.type.name === 'mapBlock',
		runner: (state, node) => {
			state.openNode('paragraph');
			state.addNode('text', undefined, `::map{id=${node.attrs.mapId}}`);
			state.closeNode();
		}
	}
}));

/** Node view that mounts the interactive MapView inside the editor. */
export const mapBlockView = $view(mapBlock, () => (node) => {
	const mapId = node.attrs.mapId;
	const dom = document.createElement('div');
	dom.className = 'map-widget';
	dom.contentEditable = 'false';

	let inst: ReturnType<typeof mount> | undefined;
	function tryMount() {
		if (inst) return;
		const data = getMaps().find((m) => m.id === mapId);
		if (!data) {
			dom.textContent = '[missing map]';
			return;
		}
		dom.textContent = '';
		inst = mount(MapView, {
			target: dom,
			props: { map: data, dm: true, campaignId }
		});
		if (inst) mapInstances.set(mapId, inst);
	}
	tryMount();

	return {
		dom,
		// the widget is non-editable; ignore all edits/events inside it
		ignoreMutation: () => true,
		stopEvent: () => true,
		update() {
			// if it was missing, try mounting now that the map may exist
			tryMount();
			return true; // mapId never changes; no redraw needed
		},
		destroy() {
			if (inst) {
				unmount(inst);
				mapInstances.delete(mapId);
			}
		}
	};
});

type MapInstance = ReturnType<typeof mount> & {
	applyTokens?: (t: TokenData[]) => void;
	applyGrid?: (g: number) => void;
	applyLayer?: (l: number) => void;
	applyRevealRemoved?: (id: number) => void;
	applyLayerCleared?: (l: number) => void;
	applyState?: (m: MapData, tokens: TokenData[]) => void;
};

/** Forward realtime/SSE map updates to the mounted MapView instances. */
export const mapApi = {
	applyTokens(mapId: string, tokens: TokenData[]) {
		(mapInstances.get(mapId) as MapInstance | undefined)?.applyTokens?.(tokens);
	},
	applyGrid(mapId: string, grid: number) {
		(mapInstances.get(mapId) as MapInstance | undefined)?.applyGrid?.(grid);
	},
	applyLayer(mapId: string, layer: number) {
		(mapInstances.get(mapId) as MapInstance | undefined)?.applyLayer?.(layer);
	},
	applyRevealRemoved(mapId: string, opId: number) {
		(mapInstances.get(mapId) as MapInstance | undefined)?.applyRevealRemoved?.(opId);
	},
	applyLayerCleared(mapId: string, layer: number) {
		(mapInstances.get(mapId) as MapInstance | undefined)?.applyLayerCleared?.(layer);
	},
	applyState(maps: MapData[], tokenList: { mapId: string; tokens: TokenData[] }[]) {
		for (const m of maps) {
			const inst = mapInstances.get(m.id) as MapInstance | undefined;
			const tokens = tokenList.find((t) => t.mapId === m.id)?.tokens ?? [];
			inst?.applyState?.(m, tokens);
		}
	}
};
