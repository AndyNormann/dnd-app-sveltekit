<script lang="ts">
	import { onMount } from 'svelte';
	import Editor from '$lib/components/Editor.svelte';
	import RenderedDoc from '$lib/components/RenderedDoc.svelte';
	import RollLog from '$lib/components/RollLog.svelte';
	import Outline from '$lib/components/Outline.svelte';
	import { parseHeadings, renderForDM } from '$lib/markdown';
	import type { RollData } from '$lib/types';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let content = $state(data.content);
	let title = $state(data.title);
	let editingTitle = $state(false);
	let saveState = $state<'idle' | 'saving' | 'saved' | 'error'>('idle');
	let showOutline = $state(true);
	let showEditor = $state(true);
	let editor: Editor | undefined = $state();
	let rollLog: RollLog;

	const uiKey = `dnd-ui-${data.campaignId}`;

	function persistUi() {
		localStorage.setItem(uiKey, JSON.stringify({ showOutline, showEditor }));
	}

	function toggleOutline() {
		showOutline = !showOutline;
		persistUi();
	}

	function toggleEditor() {
		showEditor = !showEditor;
		persistUi();
	}

	function onKeydown(e: KeyboardEvent) {
		if (!(e.ctrlKey || e.metaKey)) return;
		if (e.key === '\\') {
			e.preventDefault();
			toggleEditor();
		} else if (e.key === '.') {
			e.preventDefault();
			toggleOutline();
		}
	}

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
	const outlineItems = $derived(
		parseHeadings(previewSource).map((h) => ({ id: h.id, level: h.level, text: h.text }))
	);

	function onEdit(v: string) {
		content = v;
		clearTimeout(previewTimer);
		previewTimer = setTimeout(() => (previewSource = v), 200);
		clearTimeout(saveTimer);
		saveTimer = setTimeout(save, 600);
	}

	async function save() {
		saveState = 'saving';
		try {
			const res = await fetch(`/c/${data.campaignId}/content`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ content })
			});
			if (!res.ok) {
				saveState = 'error';
				return;
			}
			const { content: canonical } = (await res.json()) as { content: string };
			// resync editor if the server injected heading ids
			if (canonical !== content) {
				content = canonical;
				editor?.setValue(canonical);
				previewSource = canonical;
			}
			saveState = 'saved';
		} catch {
			saveState = 'error';
		}
	}

	async function saveTitle() {
		editingTitle = false;
		const next = title.trim();
		if (!next || next === data.title) {
			title = data.title;
			return;
		}
		const res = await fetch(`/c/${data.campaignId}/title`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ title: next })
		});
		if (res.ok) data.title = next;
		else title = data.title;
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

	onMount(() => {
		// restore panel visibility
		try {
			const saved = JSON.parse(localStorage.getItem(uiKey) ?? '{}');
			if (typeof saved.showOutline === 'boolean') showOutline = saved.showOutline;
			if (typeof saved.showEditor === 'boolean') showEditor = saved.showEditor;
		} catch {
			// corrupt localStorage entry; keep defaults
		}
		// listen for rolls made by players (and co-DM tabs)
		const es = new EventSource(`/c/${data.campaignId}/events`);
		es.onmessage = (e) => {
			const ev = JSON.parse(e.data);
			if (ev.type === 'roll') rollLog?.addRoll(ev.roll as RollData);
		};
		return () => es.close();
	});
</script>

<svelte:window onkeydown={onKeydown} />

<svelte:head><title>{title} — DM</title></svelte:head>

<header class="bar">
	<a href="/" class="back">←</a>
	<button
		type="button"
		class="toggle"
		class:on={showOutline}
		title="Toggle outline (Ctrl+.)"
		onclick={toggleOutline}>☰</button
	>
	<button
		type="button"
		class="toggle"
		class:on={showEditor}
		title="Toggle markdown editor (Ctrl+\)"
		onclick={toggleEditor}>✎</button
	>
	{#if editingTitle}
		<!-- svelte-ignore a11y_autofocus -->
		<input
			class="title-input"
			bind:value={title}
			onblur={saveTitle}
			onkeydown={(e) => {
				if (e.key === 'Enter') saveTitle();
				if (e.key === 'Escape') {
					title = data.title;
					editingTitle = false;
				}
			}}
			autofocus
		/>
	{:else}
		<h1>
			<button type="button" class="title-btn" title="Rename" onclick={() => (editingTitle = true)}>
				{title}
			</button>
		</h1>
	{/if}
	<span class="save-state" class:error={saveState === 'error'}>
		{#if saveState === 'saving'}Saving…{:else if saveState === 'saved'}Saved{:else if saveState === 'error'}Save
			failed{/if}
	</span>
	<div class="spacer"></div>
	<label class="upload">
		Add map
		<input type="file" accept="image/*" onchange={uploadMap} hidden />
	</label>
	<button onclick={() => navigator.clipboard?.writeText(playerUrl())}>Copy player link</button>
	<a href={`/c/${data.campaignId}/play`} target="_blank" rel="noreferrer">Open player view</a>
</header>

<div class="layout" class:no-rail={!showOutline}>
	{#if showOutline}
		<aside class="rail">
			<Outline items={outlineItems} />
		</aside>
	{/if}
	<div class="split" class:solo={!showEditor}>
		{#if showEditor}
			<section class="pane source">
				<Editor bind:this={editor} bind:value={content} onchange={onEdit} />
			</section>
		{/if}
		<section class="pane preview" class:full={!showEditor}>
			<RenderedDoc
				html={previewHtml}
				dm
				campaignId={data.campaignId}
				maps={data.maps}
				meta={metaRecord}
				onroll={(r) => rollLog?.addRoll(r)}
			/>
		</section>
	</div>
</div>

<RollLog bind:this={rollLog} campaignId={data.campaignId} dm initial={data.rolls} />

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
	.title-btn {
		font: inherit;
		font-weight: 700;
		border: 0;
		background: none;
		cursor: text;
		padding: 0;
	}
	.title-input {
		font-size: 1.05rem;
		font-weight: 700;
		padding: 0.15rem 0.3rem;
		border: 1px solid #c4b5fd;
		border-radius: 5px;
	}
	.save-state {
		font-size: 0.78rem;
		color: #9ca3af;
		min-width: 4.5rem;
	}
	.save-state.error {
		color: #dc2626;
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
	.toggle {
		font-size: 0.95rem;
		padding: 0.25rem 0.55rem;
		border: 1px solid #d1d5db;
		border-radius: 6px;
		background: #fff;
		color: #9ca3af;
		cursor: pointer;
	}
	.toggle.on {
		color: #5b21b6;
		border-color: #c4b5fd;
		background: #f5f3ff;
	}
	.layout {
		display: grid;
		grid-template-columns: 13rem 1fr;
		height: calc(100vh - 3.2rem);
	}
	.layout.no-rail {
		grid-template-columns: 1fr;
	}
	.rail {
		border-right: 1px solid #e5e7eb;
		overflow-y: auto;
		padding: 0.25rem;
	}
	.split {
		display: grid;
		grid-template-columns: 1fr 1fr;
		min-width: 0;
	}
	.split.solo {
		grid-template-columns: 1fr;
	}
	.preview.full {
		max-width: 60rem;
		width: 100%;
		margin: 0 auto;
	}
	.pane {
		overflow: auto;
		height: 100%;
		min-width: 0;
	}
	.source {
		border-right: 1px solid #e5e7eb;
	}
	.preview {
		padding: 1rem 1.5rem;
		font-family: system-ui, sans-serif;
	}
</style>
