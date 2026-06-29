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
</style>
