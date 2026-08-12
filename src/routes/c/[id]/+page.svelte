<script lang="ts">
	import { onMount } from 'svelte';
	import Editor from '$lib/components/Editor.svelte';
	import WysiwygEditor from '$lib/components/WysiwygEditor.svelte';
	import RollLog from '$lib/components/RollLog.svelte';
	import Outline from '$lib/components/Outline.svelte';
	import { parseHeadings } from '$lib/markdown';
	import type { RollData } from '$lib/types';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let content = $state(data.content);
	let title = $state(data.title);
	let rev = $state(data.rev);
	let editingTitle = $state(false);
	let saveState = $state<'idle' | 'saving' | 'saved' | 'error' | 'conflict'>('idle');
	let connected = $state(false);
	let toast = $state<{ msg: string; type: 'ok' | 'err' } | null>(null);
	let toastTimer: ReturnType<typeof setTimeout>;
	function showToast(msg: string, type: 'ok' | 'err' = 'ok') {
		toast = { msg, type };
		clearTimeout(toastTimer);
		toastTimer = setTimeout(() => (toast = null), 2600);
	}
	let showOutline = $state(true);
	let sourceMode = $state(false); // false = WYSIWYG, true = raw CodeMirror
	let editor: Editor | undefined = $state();
	let wysiwyg: WysiwygEditor | undefined = $state();
	let rollLog: RollLog;
	const uiKey = `dnd-ui-${data.campaignId}`;

	// shared heading meta for the WYSIWYG heading controls (mutated in place)
	const metaMap = new Map(
		data.meta.map((m) => [m.heading_id, { shared: m.shared, collapsed: !!m.collapsed }])
	);

	function persistUi() {
		localStorage.setItem(uiKey, JSON.stringify({ showOutline }));
	}

	function toggleOutline() {
		showOutline = !showOutline;
		persistUi();
	}

	function toggleSource() {
		sourceMode = !sourceMode;
	}

	function onKeydown(e: KeyboardEvent) {
		if (!(e.ctrlKey || e.metaKey)) return;
		if (e.key === '\\') {
			e.preventDefault();
			toggleSource();
		} else if (e.key === '.') {
			e.preventDefault();
			toggleOutline();
		}
	}

	// debounced save
	let saveTimer: ReturnType<typeof setTimeout> | undefined;

	const outlineItems = $derived(
		parseHeadings(content).map((h) => ({ id: h.id, level: h.level, text: h.text }))
	);

	function onEdit(v: string) {
		content = v;
		clearTimeout(saveTimer);
		saveTimer = setTimeout(save, 600);
	}

	async function save() {
		saveState = 'saving';
		try {
			const res = await fetch(`/c/${data.campaignId}/content`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ content, rev })
			});
			if (res.status === 409) {
				// Another tab/editor saved newer content; refuse to clobber it.
				saveState = 'conflict';
				showToast('Out of sync — reload to avoid overwriting', 'err');
				return;
			}
			if (!res.ok) {
				saveState = 'error';
				showToast('Save failed', 'err');
				return;
			}
			const { content: canonical, rev: nextRev } = (await res.json()) as {
				content: string;
				rev: number;
			};
			rev = nextRev;
			// resync editor if the server injected heading ids
			if (canonical !== content) {
				content = canonical;
				(sourceMode ? editor : wysiwyg)?.setValue(canonical);
			}
			saveState = 'saved';
			clearTimeout(savedTimer);
			savedTimer = setTimeout(() => (saveState = 'idle'), 1800);
			showToast('Saved');
		} catch {
			saveState = 'error';
			showToast('Save failed', 'err');
		}
	}

	let savedTimer: ReturnType<typeof setTimeout>;

	// Flush a pending debounced save if the tab is closed mid-debounce, so edits
	// made in the last ~600ms aren't lost. sendBeacon survives tab close.
	function flushPendingSave() {
		if (!saveTimer) return;
		clearTimeout(saveTimer);
		saveTimer = undefined;
		navigator.sendBeacon(
			`/c/${data.campaignId}/content`,
			new Blob([JSON.stringify({ content, rev })], { type: 'application/json' })
		);
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

	async function copyPlayerLink() {
		try {
			await navigator.clipboard?.writeText(playerUrl());
			showToast('Player link copied');
		} catch {
			showToast('Could not copy link', 'err');
		}
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
			// append the embed directive + push map into local list (deduped vs SSE)
			if (!data.maps.some((m: { id: string }) => m.id === map.id)) {
				data.maps = [...data.maps, map];
			}
			const insert = `\n\n::map{id=${map.id}}\n`;
			const next = content + insert;
			content = next;
			(sourceMode ? editor : wysiwyg)?.setValue(next);
			save();
		}
		input.value = '';
	}

	onMount(() => {
		// restore panel visibility
		try {
			const saved = JSON.parse(localStorage.getItem(uiKey) ?? '{}');
			if (typeof saved.showOutline === 'boolean') showOutline = saved.showOutline;
		} catch {
			// corrupt localStorage entry; keep defaults
		}
		// listen for rolls made by players (and co-DM tabs)
		const es = new EventSource(`/c/${data.campaignId}/events`);
		es.onopen = () => (connected = true);
		es.onerror = () => (connected = false);
		es.onmessage = (e) => {
			const ev = JSON.parse(e.data);
			if (ev.type === 'roll') rollLog?.addRoll(ev.roll as RollData);
			else if (ev.type === 'snapshot') {
				rollLog?.setRolls(ev.rolls);
				data.maps = ev.maps;
				rev = ev.rev;
				wysiwyg?.applyState(ev.maps, ev.tokens);
			} else if (ev.type === 'map-added') {
				if (!data.maps.some((m: { id: string }) => m.id === ev.map.id)) data.maps = [...data.maps, ev.map];
			} else if (ev.type === 'tokens-updated') wysiwyg?.applyTokens(ev.mapId, ev.tokens);
			else if (ev.type === 'grid-updated') wysiwyg?.applyGrid(ev.mapId, ev.grid_size);
			else if (ev.type === 'layer-changed') wysiwyg?.applyLayer(ev.mapId, ev.layer);
			else if (ev.type === 'reveal-undone') wysiwyg?.applyRevealRemoved(ev.mapId, ev.opId);
			else if (ev.type === 'reveals-cleared') wysiwyg?.applyLayerCleared(ev.mapId, ev.layer);
		};
		window.addEventListener('pagehide', flushPendingSave);
		return () => {
			es.close();
			window.removeEventListener('pagehide', flushPendingSave);
		};
	});
</script>

<svelte:window onkeydown={onKeydown} />

<svelte:head><title>{title} — DM</title></svelte:head>

<header class="bar">
	<a href="/" class="back">←</a>
	<span
		class="conn"
		class:on={connected}
		title={connected ? 'Realtime connected' : 'Realtime disconnected'}
	></span>
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
		class:on={sourceMode}
		title="Toggle raw markdown source (Ctrl+\)"
		onclick={toggleSource}>✎</button
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
	<nav class="tabs">
		<a href={`/c/${data.campaignId}`} class="tab" class:active={true}>Notes</a>
		<a href={`/c/${data.campaignId}/combat`} class="tab">Combat</a>
	</nav>
	<span class="save-state" class:error={saveState === 'error' || saveState === 'conflict'}>
		{#if saveState === 'saving'}Saving…
		{:else if saveState === 'saved'}Saved ✓
		{:else if saveState === 'conflict'}Out of sync ·
			<button type="button" class="reload" onclick={() => location.reload()}>Reload</button>
		{/if}
	</span>
	<div class="spacer"></div>
	<label class="upload">
		Add map
		<input type="file" accept="image/*" onchange={uploadMap} hidden />
	</label>
	<button onclick={copyPlayerLink}>Copy player link</button>
	<a href={`/c/${data.campaignId}/export`} class="export">Export</a>
	<a href={`/c/${data.campaignId}/play`} target="_blank" rel="noreferrer">Open player view</a>
	<form method="POST" action="/logout" class="logout">
		<button type="submit" title="Log out as DM">Log out</button>
	</form>
</header>

<div class="layout" class:no-rail={!showOutline}>
	{#if showOutline}
		<aside class="rail">
			<Outline items={outlineItems} />
		</aside>
	{/if}
	<div class="split">
		<section class="pane source">
			{#if content.trim() === '' && !sourceMode}
				<div class="empty-hint" aria-hidden="true">
					<h2>Start writing…</h2>
					<p>Type <code># Heading</code>, roll like <code>2d6+3</code>, link a section with <code>[[Name]]</code>, or press <code>/</code> for a command menu (incl. adding a map).</p>
				</div>
			{/if}
			{#if sourceMode}
				<Editor bind:this={editor} bind:value={content} onchange={onEdit} />
			{:else}
				<WysiwygEditor
					bind:this={wysiwyg}
					value={content}
					campaignId={data.campaignId}
					isSecret={() => rollLog?.isSecret() ?? false}
					meta={metaMap}
					getMaps={() => data.maps}
					addMap={(m) => {
						if (!data.maps.some((x: { id: string }) => x.id === m.id)) data.maps = [...data.maps, m];
					}}
					onchange={onEdit}
				/>
			{/if}
		</section>
	</div>
	<aside class="rail rolls">
		<RollLog bind:this={rollLog} campaignId={data.campaignId} dm initial={data.rolls} />
	</aside>
</div>

{#if toast}
	<div class="toast" class:err={toast.type === 'err'}>{toast.msg}</div>
{/if}

<style>
	.bar {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.6rem 1rem;
		background: var(--parchment-light);
		border-bottom: 2px solid var(--rule);
		font-family: system-ui, sans-serif;
	}
	.bar h1 {
		font-size: 1.1rem;
		margin: 0;
	}
	.title-btn {
		font-family: var(--font-display);
		font-size: 1.05rem;
		font-weight: 700;
		color: var(--accent);
		border: 0;
		background: none;
		cursor: text;
		padding: 0;
	}
	.title-input {
		font-family: var(--font-display);
		font-size: 1.05rem;
		font-weight: 700;
		color: var(--accent);
		background: #fff;
		padding: 0.15rem 0.3rem;
		border: 1px solid var(--gold);
		border-radius: 5px;
	}
	.save-state {
		font-size: 0.78rem;
		color: var(--ink-soft);
		min-width: 4.5rem;
	}
	.save-state.error {
		color: var(--accent);
	}
	.reload {
		margin-left: 0.2rem;
		padding: 0 0.35rem;
		border: 1px solid var(--accent-soft);
		border-radius: 4px;
		background: none;
		color: var(--accent);
		cursor: pointer;
		font-size: 0.78rem;
	}
	.back {
		text-decoration: none;
		font-size: 1.2rem;
		color: var(--ink-soft);
	}
	.spacer {
		flex: 1;
	}
	.bar button,
	.bar .upload,
	.bar .export,
	.bar a[target] {
		font-size: 0.85rem;
		padding: 0.4rem 0.7rem;
		border: 1px solid var(--rule);
		border-radius: 6px;
		background: var(--parchment-light);
		cursor: pointer;
		text-decoration: none;
		color: var(--ink-soft);
	}
	.bar button:hover,
	.bar .upload:hover,
	.bar a[target]:hover {
		border-color: var(--gold);
		color: var(--ink);
	}
	.logout {
		margin: 0;
	}
	.logout button {
		border-color: var(--accent-soft);
		color: var(--accent-soft);
	}
	.toggle {
		font-size: 0.95rem;
		padding: 0.25rem 0.55rem;
		border: 1px solid var(--rule);
		border-radius: 6px;
		background: var(--parchment-light);
		color: var(--rule);
		cursor: pointer;
	}
	.toggle.on {
		color: var(--accent);
		border-color: var(--gold);
		background: var(--parchment-deep);
	}
	.layout {
		display: grid;
		grid-template-columns: 13rem 1fr 19rem;
		height: calc(100vh - 3.3rem);
	}
	.layout.no-rail {
		grid-template-columns: 1fr 19rem;
	}
	.rail {
		border-right: 1px solid var(--rule);
		background: var(--parchment);
		overflow-y: auto;
		padding: 0.25rem;
	}
	.rail.rolls {
		border-right: 0;
		border-left: 1px solid var(--rule);
		padding: 0;
		overflow: hidden;
	}
	.split {
		display: grid;
		grid-template-columns: 1fr;
		min-width: 0;
	}
	.pane {
		overflow: auto;
		height: 100%;
		min-width: 0;
	}
	.source {
		background: #fdfbf5;
		position: relative;
	}
	.conn {
		width: 0.6rem;
		height: 0.6rem;
		border-radius: 50%;
		background: #c33;
		flex: none;
	}
	.conn.on {
		background: #3a9b45;
	}
	.empty-hint {
		position: absolute;
		inset: 1.5rem auto auto 2rem;
		max-width: 30rem;
		color: var(--ink-soft);
		pointer-events: none;
		opacity: 0.7;
	}
	.empty-hint h2 {
		font-family: var(--font-display);
		color: var(--accent-soft);
		margin: 0 0 0.4rem;
	}
	.empty-hint p {
		margin: 0;
		font-size: 0.95rem;
	}
	.empty-hint code {
		background: var(--parchment-deep);
		padding: 0 0.25rem;
		border-radius: 4px;
	}
	.toast {
		position: fixed;
		right: 1.25rem;
		bottom: 1.25rem;
		z-index: 2000;
		padding: 0.6rem 1rem;
		background: var(--parchment-light);
		border: 1px solid var(--gold);
		border-left: 4px solid #3a9b45;
		border-radius: 6px;
		box-shadow: 0 4px 16px rgba(43, 35, 23, 0.25);
		font-family: var(--font-body);
		font-size: 0.95rem;
		color: var(--ink);
		animation: toast-in 0.18s ease;
	}
	.toast.err {
		border-left-color: var(--accent);
	}
	@keyframes toast-in {
		from {
			opacity: 0;
			transform: translateY(8px);
		}
		to {
			opacity: 1;
			transform: none;
		}
	}
	.tabs {
		display: inline-flex;
		gap: 0.25rem;
		margin-left: 0.5rem;
	}
	.tab {
		text-decoration: none;
		font-size: 0.85rem;
		padding: 0.35rem 0.7rem;
		border: 1px solid var(--rule);
		border-radius: 6px;
		color: var(--ink-soft);
		background: var(--parchment-light);
	}
	.tab.active {
		color: var(--accent);
		border-color: var(--gold);
		background: var(--parchment-deep);
	}
</style>
