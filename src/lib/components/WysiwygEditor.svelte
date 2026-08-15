<script lang="ts">
	import { onMount } from 'svelte';
	import type { MilkdownHandle } from './milkdown/editor';
	import type { MapData, TokenData, PingData } from '$lib/types';

	let {
		value = $bindable(''),
		onchange,
		campaignId,
		isSecret,
		getMaps,
		addMap,
		getDocuments
	}: {
		value: string;
		onchange?: (v: string) => void;
		campaignId: string;
		isSecret?: () => boolean;
		getMaps?: () => MapData[];
		addMap?: (map: MapData) => void;
		getDocuments?: () => { id: string; title: string }[];
	} = $props();

	let host: HTMLDivElement;
	let handle = $state<MilkdownHandle | undefined>();

	onMount(() => {
		// dynamic import keeps ProseMirror/Milkdown out of the SSR bundle
		(async () => {
			const { createMilkdownEditor } = await import('./milkdown/editor');
			handle = await createMilkdownEditor({
				root: host,
				value,
				campaignId,
				isSecret,
				getMaps,
				addMap,
				documents: getDocuments,
				onChange: (md) => {
					value = md;
					onchange?.(md);
				}
			});
		})();
		return () => {
			handle?.destroy();
			handle = undefined;
		};
	});

	/** Replace the document contents (e.g. after server canonicalizes ids). */
	export function setValue(next: string) {
		handle?.setValue(next);
	}

	/** Insert a freshly-uploaded map block at the current caret. */
	export function insertMap(mapId: string) {
		handle?.insertMap(mapId);
	}

	/** Current document serialized to markdown (after any pending edits). */
	export function getMarkdown(): string | undefined {
		return handle?.getMarkdown();
	}

	/** Forward realtime map updates to mounted MapView instances. */
	export function applyTokens(mapId: string, tokens: TokenData[]) {
		handle?.applyTokens(mapId, tokens);
	}
	export function applyGrid(mapId: string, grid: number) {
		handle?.applyGrid(mapId, grid);
	}
	export function applyLayer(mapId: string, layer: number) {
		handle?.applyLayer(mapId, layer);
	}
	export function applyRevealRemoved(mapId: string, opId: number) {
		handle?.applyRevealRemoved(mapId, opId);
	}
	export function applyLayerCleared(mapId: string, layer: number) {
		handle?.applyLayerCleared(mapId, layer);
	}
	export function applyState(maps: MapData[], tokenList: { mapId: string; tokens: TokenData[] }[]) {
		handle?.applyState(maps, tokenList);
	}
	export function applyMapPing(mapId: string, ping: PingData) {
		handle?.applyMapPing(mapId, ping);
	}
</script>

<div class="mdx-host" bind:this={host}>
	{#if !handle}<div class="loading" aria-hidden="true">Loading editor…</div>{/if}
</div>

<style>
	.mdx-host {
		height: 100%;
		overflow: auto;
		/* the editor is the page the DM writes on: cream paper with a soft lit glow
		   and faint ruled journal lines that the text sits on */
		background:
			radial-gradient(90% 65% at 50% 0%, rgba(255, 255, 255, 0.18), transparent 60%),
			repeating-linear-gradient(
				transparent 0,
				transparent 1.9rem,
				rgba(90, 70, 20, 0.06) 1.9rem,
				rgba(90, 70, 20, 0.06) calc(1.9rem + 1px)
			),
			var(--paper);
		color: var(--paper-ink);
	}
	.loading {
		position: sticky;
		top: 40%;
		text-align: center;
		color: var(--paper-ink-soft);
		font-family: var(--font-ui);
		font-size: 0.9rem;
	}
	:global(.mdx-host .ProseMirror) {
		min-height: 100%;
		outline: none;
		padding: 1rem 1.75rem 30vh 4rem;
		font-family: var(--font-body);
		font-size: var(--text-base, 1.35rem);
		line-height: 1.45;
		color: var(--paper-ink);
	}
	:global(.mdx-host .ProseMirror p) {
		margin: 0.55em 0;
	}
	:global(.mdx-host .ProseMirror blockquote) {
		margin: 0.8rem 0;
		padding: 0.6rem 1rem;
		background: rgba(122, 92, 20, 0.08);
		border: 0;
		border-top: 3px solid #7a5c14;
		border-bottom: 3px solid #7a5c14;
		color: var(--paper-ink);
	}
	:global(.mdx-host .ProseMirror blockquote p:first-child strong:first-child) {
		font-family: var(--font-display);
		color: #7a5c14;
		font-size: 1.15em;
	}
	:global(.mdx-host .ProseMirror pre) {
		background: rgba(0, 0, 0, 0.06);
		border: 1px solid var(--paper-rule);
		padding: 0.8rem;
		border-radius: 6px;
		overflow: auto;
		color: var(--paper-ink);
	}
	:global(.mdx-host .ProseMirror code) {
		font-family: ui-monospace, monospace;
		background: rgba(0, 0, 0, 0.06);
		color: #7a5c14;
		padding: 0.1em 0.3em;
		border-radius: 4px;
	}
	:global(.mdx-host .ProseMirror pre code) {
		background: none;
		padding: 0;
		color: inherit;
	}
	:global(.mdx-host .ProseMirror table) {
		border-collapse: collapse;
		margin: 0.6rem 0;
	}
	:global(.mdx-host .ProseMirror th),
	:global(.mdx-host .ProseMirror td) {
		border: 1px solid var(--paper-rule);
		padding: 0.35rem 0.6rem;
	}
	:global(.mdx-host .ProseMirror th) {
		background: rgba(122, 92, 20, 0.08);
	}
	:global(.mdx-host .ProseMirror h1),
	:global(.mdx-host .ProseMirror h2),
	:global(.mdx-host .ProseMirror h3),
	:global(.mdx-host .ProseMirror h4),
	:global(.mdx-host .ProseMirror h5),
	:global(.mdx-host .ProseMirror h6) {
		position: relative;
		/* headings read as plain text; sections are marked by the controls in the gutter */
		font-family: var(--font-display);
		color: var(--paper-ink);
		letter-spacing: normal;
		font-weight: 600;
		line-height: 1.45;
		/* heading hangs over its content: a big gap above marks the section boundary,
		   a small gap below glues the heading to the text it introduces. Deeper
		   headings override margin/weight below to stay connected to their parent. */
	}
	:global(.mdx-host .ProseMirror h1) {
		font-size: 1.85rem;
		font-weight: 600;
		margin: 1.6em 0 0.35em;
	}
	:global(.mdx-host .ProseMirror h2) {
		font-size: 1.5rem;
		font-weight: 600;
		margin: 1.05em 0 0.3em;
	}
	:global(.mdx-host .ProseMirror h3) {
		font-size: 1.28rem;
		font-weight: 500;
		margin: 0.8em 0 0.25em;
	}
	:global(.mdx-host .ProseMirror h4) {
		font-size: 1.16rem;
		font-weight: 500;
		margin: 0.7em 0 0.25em;
	}
	:global(.mdx-host .ProseMirror h5) {
		font-size: 1.08rem;
		font-weight: 400;
		margin: 0.65em 0 0.2em;
	}
	:global(.mdx-host .ProseMirror h6) {
		font-size: 1.02rem;
		font-weight: 400;
		margin: 0.6em 0 0.2em;
	}
	:global(.dice-dec) {
		border: 1px solid #b59a5a;
		background: rgba(122, 92, 20, 0.10);
		box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.4), 0 1px 2px rgba(0, 0, 0, 0.12);
		color: #6a4f0e;
		border-radius: 5px;
		padding: 0 0.4rem;
		font-weight: 600;
		cursor: pointer;
		white-space: nowrap;
	}
	:global(.dice-dec:hover) {
		background: rgba(122, 92, 20, 0.18);
		border-color: var(--gold);
		color: #5a4107;
	}
	:global(.wiki-dec) {
		color: #7a5c14;
		border-bottom: 1px solid #b59a5a;
		cursor: pointer;
	}
	:global(.map-widget) {
		/* keep the map width-compact so it reads as a block, but let it render at its
		   natural height — no internal scrollbar, so page scrolling is never trapped */
		margin: 0.75rem 0 1.5rem;
		max-width: 640px;
	}
	:global(.map-placeholder) {
		font-style: italic;
		color: var(--ink-soft);
		border: 1px dashed var(--rule);
		border-radius: 6px;
		padding: 0.5rem;
	}
	:global(.map-widget) {
		border: 1px solid var(--rule);
		border-radius: var(--radius-md);
		padding: 0.4rem;
	}

	/* Heading id markers (`<!--id:...-->`) are implementation detail: hide and
	   make them non-selectable so they never bother the user. The interactive
	   plugin reads the id from the ProseMirror node model, not the DOM, so this
	   is safe. Also hides any user-typed HTML comments in WYSIWYG mode. */
	:global(.mdx-host .ProseMirror span[data-type='html'][data-value^='<!--']) {
		display: none;
	}
	:global(.dnd-slash) {
		position: fixed;
		z-index: 1000;
		min-width: 12rem;
		background: var(--parchment-light);
		border: 1px solid var(--gold);
		border-radius: 8px;
		box-shadow: var(--shadow-lg);
		padding: 0.25rem;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	:global(.dnd-wiki-pop) {
		position: fixed;
		z-index: 1001;
		min-width: 10rem;
		max-height: 14rem;
		overflow-y: auto;
		background: var(--parchment-light);
		border: 1px solid var(--gold);
		border-radius: 8px;
		box-shadow: var(--shadow-lg);
		padding: 0.25rem;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	:global(.dnd-wiki-item) {
		text-align: left;
		border: 0;
		background: none;
		color: var(--ink);
		border-radius: 6px;
		padding: 0.35rem 0.5rem;
		cursor: pointer;
		font-size: 0.9rem;
	}
	:global(.dnd-wiki-item:hover),
	:global(.dnd-wiki-item.sel) {
		background: rgba(212, 161, 60, 0.14);
		color: var(--accent-soft);
	}
	:global(.dnd-wiki-none) {
		color: var(--ink-soft);
		font-size: 0.85rem;
		padding: 0.35rem 0.5rem;
	}
	:global(.dnd-slash-item) {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.45rem 0.6rem;
		border: 0;
		border-radius: 5px;
		background: none;
		font-family: var(--font-body);
		font-size: 0.95rem;
		color: var(--ink);
		text-align: left;
		cursor: pointer;
	}
	:global(.dnd-slash-item:hover) {
		background: var(--parchment-deep);
	}
	:global(.dnd-slash-map) {
		color: var(--accent);
	}
	:global(.dnd-slash-h1) {
		font-family: var(--font-display);
		font-size: 1.05rem;
	}
	:global(.dnd-slash-h2) {
		font-family: var(--font-display);
		font-size: 0.98rem;
	}
	:global(.dnd-slash-h3) {
		font-family: var(--font-display);
		font-size: 0.92rem;
	}
	:global(.dnd-slash-wiki) {
		color: var(--accent);
	}
	:global(.dnd-slash-hr) {
		color: var(--ink-soft);
	}
</style>
