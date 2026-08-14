<script lang="ts">
	import { onMount } from 'svelte';
	import type { MilkdownHandle } from './milkdown/editor';
	import type { HeadingMeta } from './milkdown/interactive';
	import type { MapData, TokenData, PingData } from '$lib/types';

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
	}
	.loading {
		position: sticky;
		top: 40%;
		text-align: center;
		color: var(--ink-soft);
		font-family: var(--font-ui);
		font-size: 0.9rem;
	}
	:global(.mdx-host .ProseMirror) {
		min-height: 100%;
		outline: none;
		padding: 1rem 1.75rem 30vh 4rem;
		font-family: var(--font-body);
		font-size: 1.35rem;
		line-height: 1.45;
		color: var(--ink);
	}
	:global(.mdx-host .ProseMirror p) {
		margin: 0.55em 0;
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
		color: var(--ink);
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
		padding-bottom: 0.25em;
		border-bottom: 2px solid var(--gold);
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
	:global(.dm-heading-controls) {
		position: absolute;
		z-index: 5; /* above the section box when it pads into the gutter */
		/* left is set inline per heading (depth compensation); this centers vertically */
		top: 50%;
		transform: translateY(-50%);
		display: inline-flex;
		align-items: center;
		white-space: nowrap;
	}
	:global(.dm-heading-controls .dhc-btns) {
		display: inline-flex;
		gap: 0.25rem;
		align-items: center;
	}
	:global(.dm-heading-controls button) {
		border: 0;
		background: none;
		cursor: pointer;
		padding: 0;
		/* fixed control size, independent of the heading font size */
		width: 1.38rem;
		height: 1.38rem;
		font-size: 1.02rem;
		line-height: 1;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		box-sizing: border-box;
		vertical-align: middle;
	}
	:global(.dm-heading-controls .dhc-collapse) {
		color: #94845f;
	}
	:global(.dm-heading-controls .dhc-vis) {
		color: var(--ink-soft);
		border: 1px solid var(--rule);
		background: var(--parchment-deep);
		border-radius: 4px;
	}
	:global(.dm-heading-controls .dhc-vis.on) {
		color: var(--gold);
		border-color: var(--gold);
		background: var(--section-hl, rgba(111, 143, 245, 0.08));
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
		/* keep the map width-compact so it reads as a block, but let it render at its
		   natural height — no internal scrollbar, so page scrolling is never trapped */
		margin: 0.75rem 0 1.5rem;
		max-width: 640px;
	}
	:global(.mdx-host .ProseMirror .section-hl) {
		/* marker only — the actual box is the measured .section-box overlay, so
		   highlighting never adds padding/border and never shifts content */
	}
	:global(.mdx-host .section-box) {
		position: absolute;
		pointer-events: none;
		z-index: 1; /* above the editor text; heading controls sit higher so they stay on top */
		background: var(--section-hl, rgba(111, 143, 245, 0.08));
		border: none;
		border-radius: 6px;
		/* a gentle shade: no border, no hard shadow — just a faint wash so it
		   reads as a soft highlight rather than a drawn box */
		/* glide smoothly when the highlight moves between sections, and fade in/out */
		transition: left 0.15s ease, top 0.15s ease, width 0.15s ease, height 0.15s ease,
			opacity 0.17s ease;
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
		box-shadow: var(--shadow-lg);
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
