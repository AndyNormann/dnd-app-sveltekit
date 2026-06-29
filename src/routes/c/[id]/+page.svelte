<script lang="ts">
	import Editor from '$lib/components/Editor.svelte';
	import RenderedDoc from '$lib/components/RenderedDoc.svelte';
	import { renderForDM } from '$lib/markdown';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let content = $state(data.content);
	let editor: Editor;

	// debounced live preview
	let previewSource = $state(data.content);
	let previewTimer: ReturnType<typeof setTimeout>;
	let saveTimer: ReturnType<typeof setTimeout>;

	const metaRecord = $derived(
		Object.fromEntries(
			data.meta.map((m) => [m.heading_id, { shared: m.shared, collapsed: m.collapsed }])
		)
	);

	const previewHtml = $derived(renderForDM(previewSource));

	function onEdit(v: string) {
		content = v;
		clearTimeout(previewTimer);
		previewTimer = setTimeout(() => (previewSource = v), 200);
		clearTimeout(saveTimer);
		saveTimer = setTimeout(save, 600);
	}

	async function save() {
		const res = await fetch(`/c/${data.campaignId}/content`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ content })
		});
		if (res.ok) {
			const { content: canonical } = (await res.json()) as { content: string };
			// resync editor if the server injected heading ids
			if (canonical !== content) {
				content = canonical;
				editor?.setValue(canonical);
				previewSource = canonical;
			}
		}
	}

	function playerUrl() {
		return `${location.origin}/c/${data.campaignId}/play`;
	}

	async function uploadMap(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		const bitmap = await createImageBitmap(file);
		const fd = new FormData();
		fd.append('file', file);
		fd.append('width', String(bitmap.width));
		fd.append('height', String(bitmap.height));
		const res = await fetch(`/c/${data.campaignId}/maps`, { method: 'POST', body: fd });
		if (res.ok) {
			const map = await res.json();
			// append the embed directive + push map into local list
			data.maps = [...data.maps, map];
			const insert = `\n\n::map{id=${map.id}}\n`;
			const next = content + insert;
			content = next;
			editor?.setValue(next);
			previewSource = next;
			save();
		}
		input.value = '';
	}
</script>

<svelte:head><title>{data.title} — DM</title></svelte:head>

<header class="bar">
	<a href="/" class="back">←</a>
	<h1>{data.title}</h1>
	<div class="spacer"></div>
	<label class="upload">
		Add map
		<input type="file" accept="image/*" onchange={uploadMap} hidden />
	</label>
	<button onclick={() => navigator.clipboard?.writeText(playerUrl())}>Copy player link</button>
	<a href={`/c/${data.campaignId}/play`} target="_blank" rel="noreferrer">Open player view</a>
</header>

<div class="split">
	<section class="pane source">
		<Editor bind:this={editor} bind:value={content} onchange={onEdit} />
	</section>
	<section class="pane preview">
		<RenderedDoc
			html={previewHtml}
			dm
			campaignId={data.campaignId}
			maps={data.maps}
			meta={metaRecord}
		/>
	</section>
</div>

<style>
	.bar {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.6rem 1rem;
		border-bottom: 1px solid #e5e7eb;
		font-family: system-ui, sans-serif;
	}
	.bar h1 {
		font-size: 1.1rem;
		margin: 0;
	}
	.back {
		text-decoration: none;
		font-size: 1.2rem;
		color: #374151;
	}
	.spacer {
		flex: 1;
	}
	.bar button,
	.bar .upload,
	.bar a[target] {
		font-size: 0.85rem;
		padding: 0.4rem 0.7rem;
		border: 1px solid #d1d5db;
		border-radius: 6px;
		background: #fff;
		cursor: pointer;
		text-decoration: none;
		color: #374151;
	}
	.split {
		display: grid;
		grid-template-columns: 1fr 1fr;
		height: calc(100vh - 3.2rem);
	}
	.pane {
		overflow: auto;
		height: 100%;
	}
	.source {
		border-right: 1px solid #e5e7eb;
	}
	.preview {
		padding: 1rem 1.5rem;
		font-family: system-ui, sans-serif;
	}
</style>
