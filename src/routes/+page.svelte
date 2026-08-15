<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData } from './$types';

	let { data, form }: { data: PageData; form?: { error?: string } | null } = $props();

	let q = $state(data.query);
	let importErr = $state('');
	let restoreMsg = $state('');

	function fmtSize(n: number) {
		return n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
	}
	function fmtBackupTs(ts: number) {
		return new Date(ts).toLocaleString();
	}
	async function restoreBackup(name: string) {
		if (!confirm(`Restore the entire database from “${name}”?\nThis replaces ALL campaigns with the backup. A safety snapshot is taken first.`)) return;
		restoreMsg = 'Restoring…';
		const res = await fetch(`/backups/${encodeURIComponent(name)}/restore`, { method: 'POST' });
		if (!res.ok) {
			restoreMsg = 'Restore failed';
			return;
		}
		restoreMsg = 'Restored — reloading…';
		location.reload();
	}

	function onImport(e: Event) {
		const f = (e.currentTarget as HTMLFormElement).querySelector(
			'input[type=file]'
		) as HTMLInputElement | null;
		if (!f?.files || f.files.length === 0) {
			e.preventDefault();
			importErr = 'Choose a backup file to import.';
		} else {
			importErr = '';
		}
	}

	function relTime(ts: number) {
		if (!ts) return 'just now';
		const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
		if (s < 5) return 'just now';
		if (s < 60) return `${s}s ago`;
		const m = Math.floor(s / 60);
		if (m < 60) return `${m}m ago`;
		const h = Math.floor(m / 60);
		if (h < 24) return `${h}h ago`;
		const d = Math.floor(h / 24);
		if (d < 30) return `${d}d ago`;
		const mo = Math.floor(d / 30);
		return mo < 12 ? `${mo}mo ago` : `${Math.floor(mo / 12)}y ago`;
	}
</script>

<svelte:head><title>Campaigns</title></svelte:head>

<main>
	<header class="top">
		<div class="brand">
			<h1>Campaigns</h1>
			<span class="tagline">Campaign notes</span>
		</div>
		<div class="top-right">
			{#if data.isDM}
				<form method="POST" action="/logout" class="auth">
					<span class="auth-pill on">DM</span>
					<button type="submit" title="Log out as DM">Log out</button>
				</form>
			{:else}
				<a href="/login" class="auth">
					<span class="auth-pill">Player</span>
					<button type="button" title="Log in as DM">Log in</button>
				</a>
			{/if}
		</div>
	</header>

	<div class="row">
		<form method="POST" action="?/create" use:enhance class="create">
			<input name="title" placeholder="New campaign…" autocomplete="off" />
			<button type="submit">Create</button>
		</form>

		<form method="GET" action="/" class="search">
			<input name="q" placeholder="Search…" bind:value={q} />
			<button type="submit" aria-label="Search">Search</button>
		</form>

		<form method="POST" action="?/import" use:enhance class="import" enctype="multipart/form-data" onsubmit={onImport}>
			<label class="import-label">Restore backup
				<input type="file" name="file" accept=".json,application/json" />
			</label>
			<button type="submit">Import</button>
		</form>
		{#if form?.error}<p class="import-error">{form.error}</p>{/if}
		{#if importErr}<p class="import-error">{importErr}</p>{/if}
	</div>

	{#if data.isDM && data.backups && data.backups.length > 0}
		<details class="backups">
			<summary class="bhead">Backups</summary>
			{#if restoreMsg}<p class="restore-msg">{restoreMsg}</p>{/if}
			<ul class="bgrid">
				{#each data.backups as b (b.name)}
					<li class="bcard">
						<span class="bname" title={b.name}>{b.name}</span>
						<span class="bmeta">{fmtBackupTs(b.ts)} · {fmtSize(b.size)}</span>
						<div class="bactions">
							<a href={`/backups/${encodeURIComponent(b.name)}`} class="bdl" title="Download this backup">Download</a>
							<button type="button" class="bdel" onclick={() => restoreBackup(b.name)} title="Restore this backup as the live database">Restore</button>
						</div>
					</li>
				{/each}
			</ul>
		</details>
	{/if}

	{#if data.query}
		{#if data.results.length === 0}
			<p class="empty">No matches for “{data.query}”.</p>
		{:else}
			<ul class="results">
				{#each data.results as r (r.id)}
					<li class="sheet card result">
						<a href={`/c/${r.id}`} class="title">{r.title}</a>
						<p class="snippet">{r.snippet}</p>
					</li>
				{/each}
			</ul>
		{/if}
	{:else if data.campaigns.length === 0}
		<p class="empty">No campaigns yet. Create one to begin.</p>
	{:else}
		<ul class="grid">
			{#each data.campaigns as c (c.id)}
				<li class="card">
					<a href={`/c/${c.id}`} class="title">{c.title}</a>
					<span class="meta">
						<span class="time">Edited {relTime(c.updated_at || c.created_at)}</span>
						<span class="counts">{c.maps} map{c.maps === 1 ? '' : 's'} · {c.rolls} roll{c.rolls === 1 ? '' : 's'}</span>
					</span>
					<span class="actions">
						<a href={`/c/${c.id}/play`} class="play" title="Open the player view">Player view</a>
						<form
							method="POST"
							action="?/delete"
							use:enhance={({ cancel }) => {
								if (!confirm(`Delete "${c.title}"? This removes its maps and rolls too.`)) cancel();
							}}
						>
							<input type="hidden" name="id" value={c.id} />
							<button type="submit" class="delete" title="Delete campaign" aria-label="Delete campaign">✕</button>
						</form>
					</span>
				</li>
			{/each}
		</ul>
	{/if}
</main>

<style>
	main {
		font-family: var(--font-body);
		max-width: 56rem;
		margin: 0 auto;
		padding: 0 1.5rem 5rem;
	}
	.top {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		padding: 1.6rem 0 1.1rem;
		border-bottom: 1px solid var(--rule);
		margin-bottom: 1.4rem;
	}
	.brand h1 {
		margin: 0;
		font-family: var(--font-display);
		font-weight: 700;
		font-size: 1.7rem;
		letter-spacing: -0.01em;
		color: var(--ink);
	}
	.tagline {
		font-size: 0.78rem;
		font-family: var(--font-ui);
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--ink-soft);
	}
	.auth {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		text-decoration: none;
	}
	.auth button {
		border: 1px solid var(--rule);
		background: var(--parchment-light);
		border-radius: var(--radius-sm);
		padding: 0.35rem 0.8rem;
		color: var(--ink-soft);
		cursor: pointer;
		font-size: 0.85rem;
	}
	.auth form,
	.auth-pill {
		margin: 0;
	}
	.auth-pill {
		font-size: 0.75rem;
		font-weight: 600;
		letter-spacing: 0.03em;
		padding: 0.22rem 0.5rem;
		border-radius: 99px;
		border: 1px solid var(--rule);
		color: var(--ink-soft);
	}
	.auth-pill.on {
		color: var(--parchment-light);
		background: var(--accent);
		border-color: var(--accent);
	}
	.row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.8rem;
		margin-bottom: 1.8rem;
	}
	.create {
		display: flex;
		gap: 0.5rem;
		flex: 1 1 20rem;
		padding: 0.4rem;
	}
	.create input {
		flex: 1;
		border: none;
		background: transparent;
		padding: 0.5rem 0.6rem;
		color: var(--ink);
		font-size: 1rem;
		font-family: var(--font-body);
	}
	.create input::placeholder {
		color: var(--ink-soft);
	}
	.create button,
	.search button,
	.import button {
		padding: 0.5rem 1.1rem;
		border: 1px solid var(--accent);
		border-radius: var(--radius-sm);
		background: var(--accent);
		color: var(--parchment-light);
		font-size: 0.9rem;
		font-family: var(--font-ui);
		cursor: pointer;
	}
	.create button:hover,
	.search button:hover,
	.import button:hover {
		background: var(--accent-soft);
		border-color: var(--accent-soft);
	}
	.search {
		display: flex;
		gap: 0.5rem;
		flex: 1 1 18rem;
		align-items: center;
		padding: 0.4rem;
	}
	.search input {
		flex: 1;
		border: none;
		background: transparent;
		padding: 0.45rem 0.5rem;
		color: var(--ink);
		font-size: 0.95rem;
		font-family: var(--font-body);
	}
	.search input::placeholder {
		color: var(--ink-soft);
	}
	.import {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.4rem;
	}
	.import-label {
		font-size: 0.9rem;
		color: var(--ink-soft);
		display: inline-flex;
		gap: 0.4rem;
		align-items: center;
	}
	.import input[type='file'] {
		font-size: 0.8rem;
		padding: 0.3rem;
	}
	.import-error {
		color: var(--danger);
		margin: 0.2rem 0 0;
		width: 100%;
	}
	.grid {
		list-style: none;
		padding: 0;
		margin: 0;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(15rem, 1fr));
		gap: 1rem;
	}
	.card {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		padding: 1.2rem 1.2rem 1rem;
		background: var(--paper);
		border: 1px solid var(--paper-edge);
		border-radius: var(--radius-md);
		box-shadow: var(--paper-shadow);
	}
	.card:hover {
		box-shadow: var(--shadow-md);
	}
	.title {
		font-size: 1.15rem;
		font-family: var(--font-display);
		font-weight: 600;
		text-decoration: none;
		color: var(--ink);
	}
	.title:hover {
		color: var(--accent);
	}
	.meta {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		font-size: 0.82rem;
		color: var(--ink-soft);
	}
	.actions {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		border-top: 1px solid var(--paper-rule);
		padding-top: 0.6rem;
	}
	.play {
		font-size: 0.88rem;
		color: var(--accent);
		text-decoration: none;
	}
	.play:hover {
		text-decoration: underline;
	}
	.delete {
		border: 0;
		background: none;
		color: var(--ink-soft);
		cursor: pointer;
		font-size: 0.9rem;
		padding: 0.2rem;
	}
	.delete:hover {
		color: var(--danger);
	}
	.empty {
		color: var(--ink-soft);
		text-align: center;
		padding: 3rem 0;
	}
	.results {
		list-style: none;
		padding: 0;
		margin: 0;
		display: grid;
		gap: 1rem;
		grid-template-columns: repeat(auto-fill, minmax(15rem, 1fr));
	}
	.result {
		padding: 1rem 1.1rem;
	}
	.snippet {
		color: var(--ink-soft);
		font-size: 0.9rem;
		margin: 0.4rem 0;
	}
	.backups {
		margin-bottom: 1.6rem;
		padding: 1rem 1.2rem;
		background: var(--paper);
		border: 1px solid var(--paper-edge);
		border-radius: var(--radius-md);
	}
	.bhead {
		font-family: var(--font-ui);
		font-weight: 600;
		font-size: 0.95rem;
		color: var(--ink);
		cursor: pointer;
	}
	.restore-msg {
		color: var(--accent);
		font-size: 0.9rem;
		margin: 0.6rem 0 0.4rem;
	}
	.bgrid {
		list-style: none;
		padding: 0;
		margin: 0.8rem 0 0;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(15rem, 1fr));
		gap: 0.6rem;
	}
	.bcard {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		padding: 0.7rem 0.9rem;
		background: var(--parchment);
		border: 1px solid var(--paper-rule);
		border-radius: var(--radius-sm);
	}
	.bname {
		font-size: 0.82rem;
		color: var(--ink);
		word-break: break-all;
	}
	.bmeta {
		font-size: 0.78rem;
		color: var(--ink-soft);
	}
	.bactions {
		display: flex;
		gap: 0.5rem;
	}
	.bactions a,
	.bactions button {
		font-size: 0.8rem;
		padding: 0.25rem 0.6rem;
		border: 1px solid var(--paper-rule);
		border-radius: var(--radius-sm);
		background: transparent;
		color: var(--ink-soft);
		cursor: pointer;
		text-decoration: none;
	}
	.bactions a:hover,
	.bactions button:hover {
		border-color: var(--accent);
		color: var(--accent);
	}
</style>
