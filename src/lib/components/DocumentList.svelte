<script lang="ts">
	import type { DocumentSummary } from '$lib/server/db';

	let {
		documents = [],
		activeId = '',
		campaignId,
		dm = false,
		base = `/c/${campaignId}`,
		onDeleted = () => {},
		onRenamed = (_title: string) => {}
	}: {
		documents?: DocumentSummary[];
		activeId?: string;
		campaignId: string;
		dm?: boolean;
		base?: string;
		onDeleted?: () => void;
		onRenamed?: (title: string) => void;
	} = $props();

	let editingId = $state<string | null>(null);
	let draftTitle = $state('');

	function beginRename(d: DocumentSummary) {
		editingId = d.id;
		draftTitle = d.title;
	}

	async function finishRename(d: DocumentSummary) {
		const title = draftTitle.trim();
		if (!title || title === d.title) { editingId = null; return; }
		const res = await fetch(`/c/${campaignId}/documents/${d.id}`, {
			method: 'POST', headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ action: 'rename', title })
		});
		if (res.ok) onRenamed(title);
		editingId = null;
	}

	let dragId = $state<string | null>(null);

	async function create() {
		const res = await fetch(`/c/${campaignId}/documents`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({})
		});
		if (!res.ok) return;
		const { id } = await res.json();
		location.href = `${base}?doc=${id}`;
	}

	async function toggleShare(e: Event, d: DocumentSummary) {
		e.preventDefault();
		e.stopPropagation();
		await fetch(`/c/${campaignId}/documents/${d.id}`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ action: 'share', shared: d.shared !== 1 })
		});
	}

	async function remove(e: Event, d: DocumentSummary) {
		e.preventDefault();
		e.stopPropagation();
		if (!confirm(`Delete document “${d.title}”?`)) return;
		const res = await fetch(`/c/${campaignId}/documents/${d.id}`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ action: 'delete' })
		});
		if (res.ok) onDeleted();
	}

	async function drop(e: DragEvent, targetId: string) {
		e.preventDefault();
		if (!dragId || dragId === targetId) return;
		const from = documents.findIndex((d) => d.id === dragId);
		const to = documents.findIndex((d) => d.id === targetId);
		if (from < 0 || to < 0) return;
		await fetch(`/c/${campaignId}/documents/${dragId}`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ action: 'move', to })
		});
		dragId = null;
	}
</script>

<nav class="docs" aria-label="Documents">
	{#if dm}
		<div class="docs-head">
			<span class="docs-title">Documents</span>
			<button type="button" class="add" title="New document" aria-label="New document" onclick={create}>+</button>
		</div>
	{/if}
	<ul class="doc-list">
		{#each documents as d (d.id)}
			<li
				class="doc"
				class:active={d.id === activeId}
				draggable={dm}
				ondragstart={() => (dragId = d.id)}
				ondragover={(e) => e.preventDefault()}
				ondrop={(e) => drop(e, d.id)}
			>
				{#if dm && editingId === d.id}
					<input class="doc-rename" bind:value={draftTitle} onblur={() => finishRename(d)} onkeydown={(e) => { if (e.key === 'Enter') finishRename(d); if (e.key === 'Escape') editingId = null; }} aria-label={`Rename ${d.title}`} autofocus />
				{:else}
					<a class="doc-link" href={`${base}?doc=${d.id}`} title={d.title}>
						<span class="doc-name">{d.title}</span>
					</a>
				{/if}
				{#if dm}
					<span class="doc-actions">
						{#if editingId !== d.id}
							<button type="button" class="rename" title="Rename document" aria-label={`Rename ${d.title}`} onclick={(e) => { e.preventDefault(); e.stopPropagation(); beginRename(d); }}>✎</button>
						{/if}
						<button
							type="button"
							class="share"
							class:on={d.shared === 1}
							title={d.shared === 1 ? 'Shared with players — click to hide' : 'Hidden from players — click to share'}
							aria-label={d.shared === 1 ? 'Hide from players' : 'Share with players'}
							aria-pressed={d.shared === 1}
							onclick={(e) => toggleShare(e, d)}
							>{d.shared === 1 ? '👁' : '🙈'}</button
						>
						<button
							type="button"
							class="del"
							title="Delete document"
							aria-label={`Delete ${d.title}`}
							onclick={(e) => remove(e, d)}
							>✕</button
						>
					</span>
				{/if}
			</li>
		{/each}
	</ul>
	{#if documents.length === 0}
		<p class="docs-empty">{dm ? 'No documents yet — create one with +.' : 'No shared documents yet.'}</p>
	{/if}
</nav>

<style>
	.docs {
		font-family: var(--font-ui);
	}
	.docs-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.3rem 0.5rem 0.4rem;
	}
	.docs-title {
		font-family: var(--font-display);
		font-weight: 700;
		text-transform: uppercase;
		font-size: 0.72rem;
		letter-spacing: 0.08em;
		color: var(--gold);
	}
	.add {
		border: 1px solid var(--rule);
		background: var(--parchment-light);
		color: var(--ink-soft);
		border-radius: 5px;
		width: 1.5rem;
		height: 1.5rem;
		cursor: pointer;
		line-height: 1;
	}
	.add:hover {
		color: var(--accent);
		border-color: var(--gold);
	}
	.doc-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
	}
	.doc {
		display: flex;
		align-items: center;
		border-radius: 6px;
		transition: background 0.12s ease;
	}
	.doc:hover {
		background: var(--parchment-light);
	}
	.doc.active {
		background: var(--parchment-deep);
	}
	.doc.active .doc-link {
		color: var(--accent);
	}
	.doc-link {
		flex: 1;
		min-width: 0;
		text-decoration: none;
		color: var(--ink-soft);
		padding: 0.4rem 0.5rem;
		font-size: 0.9rem;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.doc-link:hover {
		color: var(--ink);
	}
	.doc-rename {
		min-width: 0;
		width: 100%;
		padding: 0.25rem 0.35rem;
		border: 1px solid var(--accent);
		border-radius: 4px;
		background: var(--parchment-light);
		color: var(--ink);
		font: inherit;
	}
	.rename { color: var(--ink-soft); }
	.rename:hover { color: var(--accent); }
	.doc-actions {
		display: inline-flex;
		gap: 0.1rem;
		padding-right: 0.25rem;
		opacity: 0;
		transition: opacity 0.12s ease;
	}
	.doc:hover .doc-actions,
	.doc.active .doc-actions {
		opacity: 1;
	}
	.doc-actions button {
		border: 0;
		background: none;
		color: var(--ink-soft);
		cursor: pointer;
		font-size: 0.85rem;
		padding: 0.15rem 0.25rem;
		border-radius: 4px;
	}
	.doc-actions button:hover {
		color: var(--ink);
		background: var(--parchment-deep);
	}
	.doc-actions .share.on {
		color: var(--gold);
	}
	.doc-actions .del:hover {
		color: var(--danger);
	}
	.docs-empty {
		color: var(--ink-soft);
		font-size: 0.85rem;
		font-style: italic;
		padding: 0.3rem 0.5rem;
	}
</style>
