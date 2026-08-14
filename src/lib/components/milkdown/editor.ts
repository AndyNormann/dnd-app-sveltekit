import { Editor, rootCtx, defaultValueCtx, parserCtx, editorViewCtx, remarkPluginsCtx } from '@milkdown/core';
import { commonmark } from '@milkdown/kit/preset/commonmark';
import { gfm } from '@milkdown/kit/preset/gfm';
import { history } from '@milkdown/kit/plugin/history';
import { listener, listenerCtx } from '@milkdown/kit/plugin/listener';
import { cursor } from '@milkdown/kit/plugin/cursor';
import { trailing } from '@milkdown/kit/plugin/trailing';
import { getMarkdown } from '@milkdown/utils';
import { nord } from '@milkdown/theme-nord';
import { buildInteractivePlugin } from './interactive';
import { buildSlashPlugin } from './slash';
import { mapBlock, mapBlockView, mapDirectiveTransformer, mapApi, configureMaps } from './mapNode';
import type { MapData, TokenData, PingData } from '$lib/types';

export interface MilkdownHandle {
	/** Current document serialized to markdown. */
	getMarkdown(): string;
	/** Replace the whole document with the given markdown. */
	setValue(markdown: string): void;
	/** Tear down the editor. */
	destroy(): Promise<void>;
	applyTokens(mapId: string, tokens: TokenData[]): void;
	applyGrid(mapId: string, grid: number): void;
	applyLayer(mapId: string, layer: number): void;
	applyRevealRemoved(mapId: string, opId: number): void;
	applyLayerCleared(mapId: string, layer: number): void;
	applyState(maps: MapData[], tokenList: { mapId: string; tokens: TokenData[] }[]): void;
	applyMapPing(mapId: string, ping: PingData): void;
}

export interface CreateEditorOptions {
	root: HTMLElement;
	value: string;
	onChange?: (markdown: string) => void;
	campaignId: string;
	isSecret?: () => boolean;
	getMaps?: () => MapData[];
	/** Push a freshly uploaded map into the live maps list (slash `/map` insert). */
	addMap?: (map: MapData) => void;
	/** The campaign's documents, for cross-document wiki links. */
	documents?: () => { id: string; title: string }[];
}

/**
 * Milkdown escapes the opening `[` of `[[Name]]` wiki links when serializing
 * (`\[[Name]]`); restore it so the app's `[[Name]]` parsing keeps matching.
 */
function fixSerializedMarkdown(markdown: string): string {
	// Milkdown escapes the opening `[` of `[[Name]]` wiki links (`\[[Name]]`)
	// and underscores inside `::map{id=...}` ids (`::map{id=X_Y}` -> `X\_Y`).
	// Restore both so the app's parsing keeps matching.
	return markdown
		.replace(/\\\[\\\[/g, '[[')
		.replace(/\\\]\\\]/g, ']]')
		.replace(/::map\{id=([^}]*)\}/g, (_m, id: string) => `::map{id=${id.replace(/\\/g, '')}}`);
}

/**
 * Create a markdown-native WYSIWYG editor (Milkdown / ProseMirror) mounted in
 * `root`. This module is imported dynamically by the Svelte component so that
 * no ProseMirror code runs during SSR.
 */
export async function createMilkdownEditor(opts: CreateEditorOptions): Promise<MilkdownHandle> {
	let lastMarkdown = opts.value;

	configureMaps({
		campaignId: opts.campaignId,
		getMaps: opts.getMaps ?? (() => [])
	});

	const interactive = buildInteractivePlugin({
		campaignId: opts.campaignId,
		isSecret: opts.isSecret,
		documents: opts.documents
	});

	const slash = buildSlashPlugin({
		campaignId: opts.campaignId,
		addMap: opts.addMap ?? (() => {}),
		getMaps: opts.getMaps
	});

	const editor = await Editor.make()
		.config((ctx) => {
			ctx.set(rootCtx, opts.root);
			ctx.set(defaultValueCtx, opts.value === '' ? '\n' : opts.value);
		})
		.config((ctx) => {
			// turn ::map{id=...} paragraphs into a distinct mapDirective node before
			// commonmark parses them, so mapBlock can be registered after commonmark.
			ctx.set(remarkPluginsCtx, [
				...(ctx.get(remarkPluginsCtx) ?? []),
				{ plugin: mapDirectiveTransformer, options: {} }
			]);
		})
		.config(nord)
		.use(commonmark)
		.use(gfm)
		.use(mapBlock)
		.use(mapBlockView)
		.use(history)
		.use(cursor)
		.use(trailing)
		.use(listener)
		.use(interactive)
		.use(slash)
		.config((ctx) => {
			const lm = ctx.get(listenerCtx);
			lm.markdownUpdated((_ctx, markdown) => {
				lastMarkdown = markdown;
				opts.onChange?.(fixSerializedMarkdown(markdown));
			});
		})
		.create();

	return {
		getMarkdown: () => fixSerializedMarkdown(editor.action(getMarkdown()) ?? lastMarkdown),
		setValue(markdown) {
			editor.action((ctx) => {
				const view = ctx.get(editorViewCtx);
				const parser = ctx.get(parserCtx);
				const doc = parser(markdown);
				const tr = view.state.tr.replaceWith(
					0,
					view.state.doc.content.size,
					doc.content
				);
				view.dispatch(tr);
				lastMarkdown = markdown;
			});
		},
		destroy: async () => {
			await editor.destroy();
		},
		applyTokens: (mapId, tokens) => mapApi.applyTokens(mapId, tokens),
		applyGrid: (mapId, grid) => mapApi.applyGrid(mapId, grid),
		applyLayer: (mapId, layer) => mapApi.applyLayer(mapId, layer),
		applyRevealRemoved: (mapId, opId) => mapApi.applyRevealRemoved(mapId, opId),
		applyLayerCleared: (mapId, layer) => mapApi.applyLayerCleared(mapId, layer),
		applyState: (maps, tokenList) => mapApi.applyState(maps, tokenList),
		applyMapPing: (mapId, ping) => mapApi.applyMapPing(mapId, ping)
	};
}
