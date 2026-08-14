<script lang="ts">
	import { onMount } from 'svelte';
	import Editor from '$lib/components/Editor.svelte';
	import WysiwygEditor from '$lib/components/WysiwygEditor.svelte';
	import RollLog from '$lib/components/RollLog.svelte';
	import DocumentList from '$lib/components/DocumentList.svelte';
	import A11yLive from '$lib/components/A11yLive.svelte';
	import TypeSwitcher from '$lib/components/TypeSwitcher.svelte';
	import { parseHeadings } from '$lib/markdown';
	import { applyFeedEvent, type FeedHandlers } from '$lib/feed';
	import type { DocumentSummary } from '$lib/server/db';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let documents = $state<DocumentSummary[]>(data.documents);
	let doc = $state(data.document);
	let content = $state(doc?.content ?? '');
	let docTitle = $state(doc?.title ?? '');
	let rev = $state(doc?.rev ?? 0);
	let editingTitle = $state(false);
	let saveState = $state<'idle' | 'saving' | 'saved' | 'error' | 'conflict'>('idle');
	let connected = $state(false);
	let offline = $state(false);
	let queued = $state(false);
	let toast = $state<{ msg: string; type: 'ok' | 'err' } | null>(null);
	let toastTimer: ReturnType<typeof setTimeout>;
	function showToast(msg: string, type: 'ok' | 'err' = 'ok') {
		toast = { msg, type };
		clearTimeout(toastTimer);
		toastTimer = setTimeout(() => (toast = null), 2600);
	}
	let showOutline = $state(true);
	let outlineW = $state(13); // rem, outline rail width
	let rollsW = $state(19); // rem, rolls rail width
	let sourceMode = $state(false);
	let more = $state(false);
	let editor: Editor | undefined = $state();
	let wysiwyg: WysiwygEditor | undefined = $state();
	let rollLog: RollLog;
	const uiKey = `dnd-ui-${data.campaignId}`;

	let find = $state('');
	let a11y: A11yLive;

	const findResults = $derived.by(() => {
		const q = find.trim().toLowerCase();
		if (!q) return [];
		const sections: { level: number; title: string; body: string; idx: number }[] = [];
		let cur: { level: number; title: string; body: string; idx: number } | null = null;
		let idx = 0;
		for (const line of content.split('\n')) {
			const m = /^(#{1,6})\s+(.*)$/.exec(line);
			if (m) {
				cur = { level: m[1].length, title: m[2].replace(/<!--.*?-->/g, '').trim(), body: '', idx };
				idx++;
				sections.push(cur);
			} else if (cur) {
				cur.body += line + ' ';
			}
		}
		return sections.filter((s) => `${s.title} ${s.body}`.toLowerCase().includes(q));
	});

	function scrollEditorToHeading(i: number) {
		const els = document.querySelectorAll('.mdx-host .ProseMirror h1,h2,h3,h4,h5,h6');
		(els[i] as HTMLElement | undefined)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
	}

	const outlineItems = $derived(
		parseHeadings(content).map((h) => ({ id: h.id, level: h.level, text: h.text }))
	);

	// Re-sync state when navigating to a different document (same route, new ?doc=).
	// The Milkdown editor is a mounted component that doesn't react to a prop
	// change, so push the newly-selected document's content into it explicitly.
	// `prevDocId` is deliberately non-reactive so this effect only tracks
	// `data.document` and never re-runs from its own `doc`/`content` writes.
	let prevDocId: string | undefined;
	$effect(() => {
		const d = data.document;
		const was = prevDocId;
		prevDocId = d?.id ?? undefined;
		doc = d;
		content = d?.content ?? '';
		docTitle = d?.title ?? '';
		rev = d?.rev ?? 0;
		if (d && d.id !== was) {
			queueMicrotask(() => {
				// only push if we're still on this document
				if (doc?.id === d.id) (sourceMode ? editor : wysiwyg)?.setValue(d.content ?? '');
			});
		}
	});

	function persistUi() {
		localStorage.setItem(uiKey, JSON.stringify({ showOutline, outlineW, rollsW }));
	}
	function toggleOutline() {
		showOutline = !showOutline;
		persistUi();
	}
	function toggleSource() {
		sourceMode = !sourceMode;
	}

	function startResize(side: 'outline' | 'rolls') {
		return (e: MouseEvent) => {
			e.preventDefault();
			const startX = e.clientX;
			const startW = side === 'outline' ? outlineW : rollsW;
			const onMove = (ev: MouseEvent) => {
				const delta = ev.clientX - startX;
				if (side === 'outline') {
					outlineW = Math.max(6, Math.min(34, startW + delta / 16));
				} else {
					rollsW = Math.max(14, Math.min(44, startW - delta / 16));
				}
			};
			const onUp = () => {
				window.removeEventListener('mousemove', onMove);
				window.removeEventListener('mouseup', onUp);
				persistUi();
			};
			window.addEventListener('mousemove', onMove);
			window.addEventListener('mouseup', onUp);
		};
	}

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			more = false;
			return;
		}
		if (!(e.ctrlKey || e.metaKey)) return;
		if (e.key === '\\') {
			e.preventDefault();
			toggleSource();
		} else if (e.key === '.') {
			e.preventDefault();
			toggleOutline();
		}
	}

	let saveTimer: ReturnType<typeof setTimeout> | undefined;

	function onEdit(v: string) {
		content = v;
		clearTimeout(saveTimer);
		saveTimer = setTimeout(save, 600);
	}

	async function save(force = false) {
		if (!doc) return;
		saveState = 'saving';
		try {
			const res = await fetch(`/c/${data.campaignId}/documents/${doc.id}/content`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ content, rev, force })
			});
			if (res.status === 409) {
				saveState = 'conflict';
				showToast('Out of sync — reload to avoid overwriting', 'err');
				return;
			}
			if (!res.ok) {
				if (!navigator.onLine) {
					queued = true;
					saveState = 'idle';
					return;
				}
				saveState = 'error';
				showToast('Save failed', 'err');
				return;
			}
			const { rev: nextRev } = (await res.json()) as { rev: number };
			rev = nextRev;
			queued = false;
			saveState = 'saved';
			clearTimeout(savedTimer);
			savedTimer = setTimeout(() => (saveState = 'idle'), 1800);
		} catch {
			if (!navigator.onLine) {
				queued = true;
				saveState = 'idle';
				return;
			}
			saveState = 'error';
			showToast('Save failed', 'err');
		}
	}

	function flushQueuedSave() {
		if (queued) {
			queued = false;
			save();
		}
	}

	let savedTimer: ReturnType<typeof setTimeout>;

	function flushPendingSave() {
		if (!saveTimer) return;
		if (!doc) return;
		clearTimeout(saveTimer);
		saveTimer = undefined;
		navigator.sendBeacon(
			`/c/${data.campaignId}/documents/${doc.id}/content`,
			new Blob([JSON.stringify({ content, rev })], { type: 'application/json' })
		);
	}

	async function saveTitle() {
		const d = doc;
		if (!d) return;
		editingTitle = false;
		const next = docTitle.trim();
		if (!next || next === d.title) {
			docTitle = d.title;
			return;
		}
		const res = await fetch(`/c/${data.campaignId}/documents/${d.id}`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ action: 'rename', title: next })
		});
		if (res.ok) {
			doc = { ...d, title: next };
			documents = documents.map((x) => (x.id === d.id ? { ...x, title: next } : x));
		} else {
			docTitle = d.title;
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
			if (!data.maps.some((m: { id: string }) => m.id === map.id)) {
				data.maps = [...data.maps, map];
			}
			if (sourceMode) {
				// raw source: append a directive (CodeMirror has no caret block-insert)
				const insert = `\n\n::map{id=${map.id}}\n`;
				const next = content + insert;
				content = next;
				editor?.setValue(next);
				save();
			} else {
				// WYSIWYG: insert at the caret, matching the /map slash command
				wysiwyg?.insertMap(map.id);
				// the onChange fires async; sync content from the editor and flush the
				// debounced save so a quick reload can't lose the freshly inserted map
				setTimeout(() => {
					const md = wysiwyg?.getMarkdown();
					if (md != null) content = md;
					clearTimeout(saveTimer);
					saveTimer = setTimeout(save, 0);
				}, 0);
			}
		}
		input.value = '';
	}

	function onDeleted() {
		// the current document may have been deleted; go back to the list
		location.href = `/c/${data.campaignId}`;
	}

	onMount(() => {
		try {
			const saved = JSON.parse(localStorage.getItem(uiKey) ?? '{}');
			if (typeof saved.showOutline === 'boolean') showOutline = saved.showOutline;
			if (typeof saved.outlineW === 'number') outlineW = saved.outlineW;
			if (typeof saved.rollsW === 'number') rollsW = saved.rollsW;
		} catch {
			// corrupt localStorage entry; keep defaults
		}
		const es = new EventSource(`/c/${data.campaignId}/events`);
		es.onopen = () => {
			connected = true;
			flushQueuedSave();
		};
		es.onerror = () => (connected = false);
		es.onmessage = (e) => applyFeedEvent(JSON.parse(e.data), feed);
		const feed: FeedHandlers = {
			addRoll: (r) => {
				rollLog?.addRoll(r);
				a11y?.announce(`${r.roller} rolled ${r.expression}`);
			},
			setRolls: (rolls) => rollLog?.setRolls(rolls),
			onDocuments: (ds) => {
				documents = ds;
			},
			applySnapshot: (s) => {
				rollLog?.setRolls(s.rolls);
				data.maps = s.maps;
				wysiwyg?.applyState(s.maps, s.tokens);
			},
			onMapAdded: (m) => {
				if (!data.maps.some((x: { id: string }) => x.id === m.id)) data.maps = [...data.maps, m];
			},
			applyTokens: (mapId, tokens) => wysiwyg?.applyTokens(mapId, tokens),
			applyGrid: (mapId, size) => wysiwyg?.applyGrid(mapId, size),
			applyLayer: (mapId, layer) => wysiwyg?.applyLayer(mapId, layer),
			applyRevealRemoved: (mapId, opId) => wysiwyg?.applyRevealRemoved(mapId, opId),
			applyLayerCleared: (mapId, layer) => wysiwyg?.applyLayerCleared(mapId, layer),
			applyMapPing: (mapId, ping) => wysiwyg?.applyMapPing(mapId, ping)
		};
		const closeMore = (e: PointerEvent) => {
			if (more && !(e.target as HTMLElement).closest('.more')) more = false;
		};
		document.addEventListener('pointerdown', closeMore);
		window.addEventListener('pagehide', flushPendingSave);
		offline = !navigator.onLine;
		const goOnline = () => {
			offline = false;
			flushQueuedSave();
		};
		const goOffline = () => {
			offline = true;
		};
		window.addEventListener('online', goOnline);
		window.addEventListener('offline', goOffline);
		return () => {
			es.close();
			document.removeEventListener('pointerdown', closeMore);
			window.removeEventListener('pagehide', flushPendingSave);
			window.removeEventListener('online', goOnline);
			window.removeEventListener('offline', goOffline);
		};
	});
</script>

<svelte:window onkeydown={onKeydown} />

<A11yLive bind:this={a11y} />

<svelte:head><title>{docTitle} — {data.campaignTitle} — DM</title></svelte:head>

<header class="bar">
	<a href="/" class="back">←</a>
	<span class="conn" class:on={connected} title={connected ? 'Realtime connected' : 'Realtime disconnected'}></span>
	<span class="crumb" title={data.campaignTitle}>{data.campaignTitle}</span>
	<span class="gsep" aria-hidden="true"></span>
	<button
		type="button"
		class="toggle"
		class:on={showOutline}
		title="Toggle document list (Ctrl+.)"
		aria-label="Toggle document list"
		onclick={toggleOutline}>☰</button
	>
	<button
		type="button"
		class="toggle"
		class:on={sourceMode}
		title="Toggle raw markdown source (Ctrl+\)"
		aria-label="Toggle raw markdown source"
		onclick={toggleSource}>✎</button
	>
	<span class="gsep" aria-hidden="true"></span>
	{#if doc}
		{#if editingTitle}
			<!-- svelte-ignore a11y_autofocus -->
			<input
				class="title-input"
				bind:value={docTitle}
				onblur={saveTitle}
				onkeydown={(e) => {
					if (e.key === 'Enter') saveTitle();
					if (e.key === 'Escape') {
						docTitle = doc?.title ?? docTitle;
						editingTitle = false;
					}
				}}
				autofocus
			/>
		{:else}
			<h1>
				<button type="button" class="title-btn" title="Rename document" onclick={() => (editingTitle = true)}>
					{docTitle}
				</button>
			</h1>
		{/if}
	{/if}
	<nav class="tabs">
		<a href={`/c/${data.campaignId}`} class="tab" class:active={true}>Notes</a>
		<a href={`/c/${data.campaignId}/combat`} class="tab">Combat</a>
		<a href={`/c/${data.campaignId}/combat/roster`} class="tab">Roster</a>
	</nav>
	<span class="save-state" class:error={saveState === 'error' || saveState === 'conflict'}>
		{#if offline}Offline · will save when back
		{:else if queued}Queued…
		{:else if saveState === 'saving'}Saving…
		{:else if saveState === 'saved'}Saved ✓
		{:else if saveState === 'conflict'}Out of sync ·
			<button type="button" class="reload" onclick={() => location.reload()}>Reload</button>
			<button type="button" class="reload keep" onclick={() => save(true)}>Keep mine</button>
		{/if}
	</span>
	<div class="spacer"></div>
	<span class="gsep" aria-hidden="true"></span>
	<label class="upload">
		Add map
		<input type="file" accept="image/*" onchange={uploadMap} class="visually-hidden" />
	</label>
	<div class="more">
		<button
			type="button"
			class="toggle"
			class:on={more}
			title="More actions"
			aria-label="More actions"
			aria-haspopup="menu"
			aria-expanded={more}
			onclick={() => (more = !more)}
			>⋮</button
		>
		{#if more}
			<div class="menu" role="menu">
				<a role="menuitem" href={`/c/${data.campaignId}/export`} onclick={() => (more = false)}>Export</a>
				<span class="menu-sep" role="separator"></span>
				<div class="menu-type">
					<span class="menu-label">Typography</span>
					<TypeSwitcher />
				</div>
			</div>
		{/if}
	</div>
	<span class="gsep" aria-hidden="true"></span>
	<form method="POST" action="/logout" class="logout">
		<button type="submit" title="Log out as DM">Log out</button>
	</form>
</header>

<div
	class="layout"
	class:no-rail={!showOutline}
	style={`--outline-w: ${outlineW}rem; --rolls-w: ${rollsW}rem`}
>
	{#if showOutline}
		<aside class="rail">
			<details class="find">
				<summary>Find in this document</summary>
				<input class="find-input" placeholder="Search…" bind:value={find} />
				{#if findResults.length > 0}
					<ul class="find-results">
						{#each findResults as s (s.idx)}
							<li>
								<button type="button" onclick={() => scrollEditorToHeading(s.idx)}>
									<span class="fhash">{'#'.repeat(s.level)}</span> {s.title}
								</button>
							</li>
						{/each}
					</ul>
				{:else if find.trim() !== ''}
					<p class="find-none">No matches</p>
				{/if}
			</details>
			<DocumentList
				campaignId={data.campaignId}
				documents={documents}
				activeId={doc?.id ?? ''}
				dm
				onDeleted={onDeleted}
			/>
		</aside>
		<div
			class="rh rh-outline"
			role="separator"
			aria-orientation="vertical"
			title="Drag to resize document list"
			onmousedown={startResize('outline')}
		></div>
	{/if}
	<div class="split">
		<section class="pane source">
			{#if doc}
				{#if content.trim() === '' && !sourceMode}
					<div class="empty-hint" aria-hidden="true">
						<h2>Start writing…</h2>
						<p>
							Type <code># Heading</code>, roll like <code>2d6+3</code>, link another document with
							<code>[[Quest]]</code> or <code>[[Quest#Step2]]</code>, or press <code>/</code> for a command menu
							(incl. adding a map, or <code>H1/H2/H3</code> to make a heading — typing <code>#</code> stays plain text).
							<span class="khint">Shortcuts: <code>Ctrl+\</code> source · <code>Ctrl+.</code> document list</span>
						</p>
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
						getMaps={() => data.maps}
						getDocuments={() => documents}
						addMap={(m) => {
							if (!data.maps.some((x: { id: string }) => x.id === m.id)) data.maps = [...data.maps, m];
						}}
						onchange={onEdit}
					/>
				{/if}
			{:else}
				<div class="empty-hint">
					<h2>No documents yet</h2>
					<p>Use <code>+</code> in the document list to create your first document.</p>
				</div>
			{/if}
		</section>
	</div>
	<div
		class="rh rh-rolls"
		role="separator"
		aria-orientation="vertical"
		title="Drag to resize rolls"
		onmousedown={startResize('rolls')}
	></div>
	<aside class="rail rolls">
		<RollLog bind:this={rollLog} campaignId={data.campaignId} dm initial={data.rolls} />
	</aside>
</div>

{#if toast}
	<div class="toast" role="status" class:err={toast.type === 'err'}>{toast.msg}</div>
{/if}

<style>
	.visually-hidden {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
		border: 0;
	}
	.visually-hidden:focus {
		position: static;
		width: auto;
		height: auto;
		clip: auto;
		margin: 0;
	}

	.bar {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.6rem 1rem;
		background: var(--parchment-light);
		border-bottom: 2px solid var(--rule);
		font-family: var(--font-ui);
	}
	.bar h1 {
		font-size: 1.1rem;
		margin: 0;
	}
	.crumb {
		color: var(--ink-soft);
		font-size: 0.85rem;
		white-space: nowrap;
		max-width: 10rem;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.title-btn {
		font-family: var(--font-display);
		font-size: 1.05rem;
		font-weight: 700;
		color: var(--accent);
		border: 0;
		background: none;
		cursor: pointer;
		padding: 0;
	}
	.title-btn:hover {
		color: var(--accent-soft);
		text-decoration: underline;
	}
	.title-input {
		font-family: var(--font-display);
		font-size: 1.05rem;
		font-weight: 700;
		color: var(--ink);
		background: var(--parchment-light);
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
		color: var(--danger);
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
	.reload.keep {
		border-color: var(--gold);
		color: var(--gold);
	}
	.back {
		text-decoration: none;
		font-size: 1.2rem;
		color: var(--ink-soft);
	}
	.back:hover {
		color: var(--accent);
	}
	.spacer {
		flex: 1;
	}
	.bar button,
	.bar .upload,
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
		background: var(--parchment-deep);
		border-color: var(--accent);
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
		color: var(--ink-soft);
		cursor: pointer;
	}
	.toggle.on {
		color: var(--accent);
		border-color: var(--gold);
		background: var(--parchment-deep);
	}
	.more {
		position: relative;
	}
	.menu {
		position: absolute;
		top: calc(100% + 0.35rem);
		right: 0;
		z-index: 60;
		min-width: 11rem;
		background: var(--parchment-light);
		border: 1px solid var(--rule);
		border-radius: 8px;
		box-shadow: var(--shadow-md);
		overflow: hidden;
	}
	.menu button,
	.menu a {
		display: block;
		width: 100%;
		text-align: left;
		padding: 0.5rem 0.8rem;
		border: 0;
		background: none;
		font-family: var(--font-body);
		font-size: 0.9rem;
		color: var(--ink);
		text-decoration: none;
		cursor: pointer;
	}
	.menu button:hover,
	.menu a:hover {
		background: var(--parchment-deep);
		color: var(--accent);
	}
	/* visual grouping in the header bar */
	.gsep {
		width: 1px;
		height: 1.35rem;
		background: var(--rule);
		margin: 0 0.15rem;
		flex: none;
	}
	.menu-sep {
		display: block;
		height: 1px;
		background: var(--rule);
		margin: 0.25rem 0;
	}
	.menu-type {
		padding: 0.5rem;
		display: flex;
		flex-direction: column;
		align-items: stretch;
		gap: 0.4rem;
	}
	.menu-label {
		font-family: var(--font-ui);
		font-size: 0.68rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--ink-soft);
	}
	.menu-type :global(.type-switch) {
		justify-content: space-between;
	}
	.layout {
		display: grid;
		grid-template-columns: var(--outline-w, 13rem) 1fr var(--rolls-w, 19rem);
		grid-template-rows: 1fr;
		height: calc(100vh - 3.3rem);
		position: relative;
	}
	.layout.no-rail {
		grid-template-columns: 1fr var(--rolls-w, 19rem);
	}
	.rh {
		position: absolute;
		top: 0;
		bottom: 0;
		width: 8px;
		cursor: col-resize;
		z-index: 5;
	}
	.rh-outline {
		left: var(--outline-w, 13rem);
		margin-left: -4px;
	}
	.rh-rolls {
		right: var(--rolls-w, 19rem);
		margin-right: -4px;
	}
	.rh:hover {
		background: var(--accent-soft);
		opacity: 0.35;
	}
	.rail {
		border-right: 1px solid var(--rule);
		background: var(--parchment);
		overflow-y: auto;
		padding: 0.25rem;
		min-height: 0;
	}
	.rail.rolls {
		border-right: 0;
		border-left: 1px solid var(--rule);
		padding: 0;
		overflow: hidden;
		min-height: 0;
		/* the rolls rail reads as the table's edge: a warm gold-tinted crown
		   fading into parchment */
		background: linear-gradient(180deg, rgba(200, 161, 61, 0.08), transparent 34%), var(--parchment);
	}
	.split {
		display: grid;
		grid-template-columns: 1fr;
		min-width: 0;
		min-height: 0;
	}
	.pane {
		overflow: auto;
		height: 100%;
		min-width: 0;
		min-height: 0;
		box-sizing: border-box;
	}
	.source {
		background: var(--parchment-light);
		position: relative;
	}
	.conn {
		width: 0.6rem;
		height: 0.6rem;
		border-radius: 50%;
		background: transparent;
		border: 1.5px solid var(--danger);
		flex: none;
	}
	.conn.on {
		background: var(--success);
		border-color: var(--success);
	}
	.empty-hint {
		position: absolute;
		inset: 1.5rem auto auto 2rem;
		max-width: 30rem;
		color: var(--ink-soft);
		pointer-events: none;
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
		background: linear-gradient(180deg, rgba(79, 160, 92, 0.10), transparent 60%), var(--parchment-light);
		border: 1px solid var(--rule);
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-lg);
		font-family: var(--font-body);
		font-size: 0.95rem;
		color: var(--ink);
		animation: toast-in 0.18s ease;
	}
	.toast.err {
		border-left-color: var(--danger);
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
	@media (max-width: 900px) {
		.bar {
			gap: 0.4rem;
		}
		.bar .save-state,
		.bar .conn {
			display: none;
		}
	}
	@media (max-width: 56rem) {
		.layout {
			grid-template-columns: 1fr;
			grid-template-rows: auto;
			height: auto;
		}
		.rail,
		.rh {
			display: none;
		}
		.bar {
			flex-wrap: wrap;
		}
		.bar .title-btn {
			flex: 1;
			min-width: 0;
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
		}
		.pane {
			height: calc(100vh - 3.3rem);
		}
	}
	.find {
		font-family: var(--font-ui);
		font-size: 0.82rem;
		padding: 0.25rem 0.5rem;
	}
	.find summary {
		cursor: pointer;
		color: var(--gold);
		font-family: var(--font-display);
		font-weight: 700;
		text-transform: uppercase;
		font-size: 0.7rem;
		letter-spacing: 0.08em;
	}
	.find-input {
		width: 100%;
		margin-top: 0.4rem;
		padding: 0.3rem 0.4rem;
		border: 1px solid var(--rule);
		border-radius: 5px;
		background: var(--parchment-light);
		color: var(--ink);
		font-size: 0.82rem;
		box-sizing: border-box;
	}
	.find-results {
		list-style: none;
		margin: 0.4rem 0 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
	}
	.find-results li {
		margin: 0;
	}
	.find-results button {
		width: 100%;
		text-align: left;
		border: 0;
		background: none;
		color: var(--ink-soft);
		padding: 0.2rem 0.3rem;
		border-radius: 4px;
		cursor: pointer;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.find-results button:hover {
		background: var(--parchment-deep);
		color: var(--accent);
	}
	.fhash {
		color: var(--gold);
	}
	.find-none {
		color: var(--ink-soft);
		font-style: italic;
		margin: 0.4rem 0 0;
	}
</style>
