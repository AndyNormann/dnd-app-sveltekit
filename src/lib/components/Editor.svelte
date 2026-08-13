<script lang="ts">
	import { onMount } from 'svelte';
	import { EditorView, keymap, lineNumbers } from '@codemirror/view';
	import { EditorState } from '@codemirror/state';
	import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
	import { markdown } from '@codemirror/lang-markdown';

	let { value = $bindable(''), onchange }: { value: string; onchange?: (v: string) => void } =
		$props();

	let host: HTMLDivElement;
	let view: EditorView | undefined;

	onMount(() => {
		view = new EditorView({
			parent: host,
			state: EditorState.create({
				doc: value,
				extensions: [
					lineNumbers(),
					history(),
					keymap.of([...defaultKeymap, ...historyKeymap]),
					markdown(),
					EditorView.lineWrapping,
					EditorView.updateListener.of((u) => {
						if (u.docChanged) {
							value = u.state.doc.toString();
							onchange?.(value);
						}
					})
				]
			})
		});

		return () => view?.destroy();
	});

	/** Replace the document contents (e.g. after server canonicalizes ids). */
	export function setValue(next: string) {
		if (!view || next === view.state.doc.toString()) return;
		view.dispatch({
			changes: { from: 0, to: view.state.doc.length, insert: next }
		});
	}
</script>

<div class="cm-host" bind:this={host}></div>

<style>
	.cm-host {
		height: 100%;
		overflow: auto;
		font-size: 0.95rem;
	}
	:global(.cm-host .cm-editor) {
		height: 100%;
	}
	:global(.cm-host .cm-scroller) {
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
	}
	/* dark theme for the raw-markdown source editor (matches the dark parchment scheme) */
	:global(.cm-host .cm-editor) {
		background: var(--parchment-light);
		color: var(--ink);
	}
	:global(.cm-host .cm-content) {
		caret-color: var(--accent-soft);
	}
	:global(.cm-host .cm-gutters) {
		background: var(--parchment-deep);
		color: var(--ink-soft);
		border-right: 1px solid var(--rule);
	}
	:global(.cm-host .cm-activeLine) {
		background: rgba(200, 161, 61, 0.06);
	}
	:global(.cm-host .cm-activeLineGutter) {
		background: rgba(200, 161, 61, 0.08);
		color: var(--gold);
	}
	:global(.cm-host .cm-selectionBackground),
	:global(.cm-host ::selection) {
		background: rgba(192, 82, 72, 0.35);
	}
	:global(.cm-host .cm-cursor) {
		border-left-color: var(--accent-soft);
	}
	:global(.cm-host .cm-cursor-secondary) {
		border-left-color: var(--accent-soft);
	}
	:global(.cm-host span.cm-heading) {
		color: var(--gold);
		font-weight: 600;
	}
	:global(.cm-host span.cm-header),
	:global(.cm-host span.cm-strong) {
		color: var(--gold);
	}
	:global(.cm-host span.cm-em) {
		color: var(--accent-soft);
	}
	:global(.cm-host span.cm-link),
	:global(.cm-host span.cm-url) {
		color: var(--accent-soft);
	}
	:global(.cm-host span.cm-quote) {
		color: var(--ink-soft);
	}
	:global(.cm-host span.cm-comment) {
		color: var(--ink-soft);
	}
	:global(.cm-host span.cm-meta) {
		color: var(--ink-soft);
	}
</style>
