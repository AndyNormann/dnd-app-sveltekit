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
	/* the raw-markdown source editor is also written on the parchment page */
	:global(.cm-host .cm-editor) {
		background: var(--paper);
		color: var(--paper-ink);
		background-image: repeating-linear-gradient(
			transparent 0,
			transparent 1.9rem,
			rgba(90, 70, 20, 0.06) 1.9rem,
			rgba(90, 70, 20, 0.06) calc(1.9rem + 1px)
		);
	}
	:global(.cm-host .cm-content) {
		caret-color: #7a5c14;
	}
	:global(.cm-host .cm-gutters) {
		background: rgba(122, 92, 20, 0.07);
		color: var(--paper-ink-soft);
		border-right: 1px solid var(--paper-rule);
	}
	:global(.cm-host .cm-activeLine) {
		background: rgba(122, 92, 20, 0.06);
	}
	:global(.cm-host .cm-activeLineGutter) {
		background: rgba(122, 92, 20, 0.10);
		color: #7a5c14;
	}
	:global(.cm-host .cm-selectionBackground),
	:global(.cm-host ::selection) {
		background: rgba(212, 161, 60, 0.35);
	}
	:global(.cm-host .cm-cursor) {
		border-left-color: #7a5c14;
	}
	:global(.cm-host .cm-cursor-secondary) {
		border-left-color: #7a5c14;
	}
	:global(.cm-host span.cm-heading) {
		color: #7a5c14;
		font-weight: 600;
	}
	:global(.cm-host span.cm-header),
	:global(.cm-host span.cm-strong) {
		color: #7a5c14;
	}
	:global(.cm-host span.cm-em) {
		color: #8a6d1a;
	}
	:global(.cm-host span.cm-link),
	:global(.cm-host span.cm-url) {
		color: #7a5c14;
	}
	:global(.cm-host span.cm-quote) {
		color: var(--paper-ink-soft);
	}
	:global(.cm-host span.cm-comment) {
		color: var(--paper-ink-soft);
	}
	:global(.cm-host span.cm-meta) {
		color: var(--paper-ink-soft);
	}
</style>
