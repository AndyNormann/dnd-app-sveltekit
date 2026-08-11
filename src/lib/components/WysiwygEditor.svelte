<script lang="ts">
	import { onMount } from 'svelte';
	import type { MilkdownHandle } from './milkdown/editor';
	import type { HeadingMeta } from './milkdown/interactive';

	let {
		value = $bindable(''),
		onchange,
		campaignId,
		isSecret,
		meta
	}: {
		value: string;
		onchange?: (v: string) => void;
		campaignId: string;
		isSecret?: () => boolean;
		meta?: Map<string, HeadingMeta>;
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
		padding: 1rem 1.75rem 3rem;
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
	}
	:global(.dm-heading-controls button) {
		border: 0;
		background: none;
		cursor: pointer;
		padding: 0;
		font-size: 0.8em;
	}
	:global(.dm-heading-controls .dhc-collapse) {
		color: #6b7280;
	}
	:global(.dm-heading-controls .dhc-share) {
		cursor: pointer;
	}
	:global(.dm-heading-controls .dhc-handout) {
		border: 1px solid var(--gold);
		background: var(--parchment-deep);
		border-radius: 4px;
		font-size: 0.8em;
		padding: 0 0.25rem;
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
</style>
