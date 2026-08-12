<script lang="ts">
	import { onMount } from 'svelte';
	import type { MilkdownHandle } from './milkdown/editor';
	import type { HeadingMeta } from './milkdown/interactive';
	import type { MapData, TokenData } from '$lib/types';

	let {
		value = $bindable(''),
		onchange,
		campaignId,
		isSecret,
		meta,
		getMaps,
		addMap
	}: {
		value: string;
		onchange?: (v: string) => void;
		campaignId: string;
		isSecret?: () => boolean;
		meta?: Map<string, HeadingMeta>;
		getMaps?: () => MapData[];
		addMap?: (map: MapData) => void;
	} = $props();

	let host: HTMLDivElement;
	let handle: MilkdownHandle | undefined;

	onMount(() => {
		// dynamic import keeps ProseMirror/Milkdown out of the SSR bundle
		(async () => {
			const { createMilkdownEditor } = await import('./milkdown/editor');
			handle = await createMilkdownEditor({
				root: host,
				value,
				campaignId,
				isSecret,
				meta,
				getMaps,
				addMap,
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
</script>

<div class="mdx-host" bind:this={host}></div>

<style>
	.mdx-host {
		height: 100%;
		overflow: auto;
	}
	:global(.mdx-host .ProseMirror) {
		min-height: 100%;
		outline: none;
		padding: 1rem 1.75rem 30vh 3rem;
		font-family: var(--font-body);
		font-size: 1.08rem;
		line-height: 1.55;
		color: var(--ink);
	}
	:global(.mdx-host .ProseMirror h1),
	:global(.mdx-host .ProseMirror h2),
	:global(.mdx-host .ProseMirror h3),
	:global(.mdx-host .ProseMirror h4),
	:global(.mdx-host .ProseMirror h5),
	:global(.mdx-host .ProseMirror h6) {
		font-family: var(--font-display);
		color: var(--accent);
		letter-spacing: 0.02em;
	}
	:global(.mdx-host .ProseMirror h1) {
		border-bottom: 1px solid var(--gold);
		padding-bottom: 0.25rem;
	}
	:global(.dm-heading-controls) {
		display: inline-flex;
		gap: 0.3rem;
		align-items: center;
		margin-right: 0.5rem;
		vertical-align: middle;
		opacity: 0;
		transition: opacity 0.15s ease;
	}
	:global(.mdx-host .ProseMirror h1:hover .dm-heading-controls),
	:global(.mdx-host .ProseMirror h2:hover .dm-heading-controls),
	:global(.mdx-host .ProseMirror h3:hover .dm-heading-controls),
	:global(.mdx-host .ProseMirror h4:hover .dm-heading-controls),
	:global(.mdx-host .ProseMirror h5:hover .dm-heading-controls),
	:global(.mdx-host .ProseMirror h6:hover .dm-heading-controls) {
		opacity: 1;
	}
	:global(.dm-heading-controls button) {
		border: 0;
		background: none;
		cursor: pointer;
		padding: 0;
		/* fixed control size, independent of the heading font size */
		width: 1.5rem;
		height: 1.5rem;
		font-size: 1rem;
		line-height: 1;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		box-sizing: border-box;
		vertical-align: middle;
	}
	:global(.dm-heading-controls .dhc-collapse) {
		color: #6b7280;
	}
	:global(.dm-heading-controls .dhc-vis) {
		border: 1px solid var(--gold);
		background: var(--parchment-deep);
		border-radius: 4px;
	}
	:global(.dice-dec) {
		border: 1px solid var(--gold);
		background: var(--parchment-deep);
		color: var(--accent);
		border-radius: 4px;
		padding: 0 0.35rem;
		font-weight: 600;
		cursor: pointer;
		white-space: nowrap;
	}
	:global(.dice-dec:hover) {
		background: var(--rule);
	}
	:global(.wiki-dec) {
		color: var(--accent);
		border-bottom: 1px solid var(--gold);
		cursor: pointer;
	}
	:global(.map-widget) {
		margin: 0.75rem 0;
	}
	:global(.collapsed-child) {
		display: none !important;
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
		box-shadow: 0 6px 24px rgba(43, 35, 23, 0.25);
		padding: 0.25rem;
		display: flex;
		flex-direction: column;
		gap: 2px;
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
