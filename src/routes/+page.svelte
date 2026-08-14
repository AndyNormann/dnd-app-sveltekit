<script lang="ts">
	import { enhance } from '$app/forms';
	import Seal from '$lib/components/Seal.svelte';
	import TypeSwitcher from '$lib/components/TypeSwitcher.svelte';
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
			e.preventDefault(); // don't POST an empty backup
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

<svelte:head><title>D&D Campaigns</title></svelte:head>

<main class="table">
	<header class="crest-band">
		<div class="crest-left"></div>
		<div class="crest">
			<div class="crest-sigil"><Seal size={52} /></div>
			<div class="crest-txt">
				<h1>The War Table</h1>
				<span class="tagline">Campaigns of the realm</span>
			</div>
		</div>
		<div class="crest-right">
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
		<TypeSwitcher />
	</header>
	<div class="ornament" aria-hidden="true"><span>✦ ✦ ✦</span></div>

	<div class="row">
		<form method="POST" action="?/create" use:enhance class="create sheet">
			<input name="title" placeholder="Name your campaign…" autocomplete="off" />
			<button type="submit" class="btn-wax">Seal &amp; Create</button>
		</form>

		<form method="GET" action="/" class="search">
			<input name="q" placeholder="Search the archives…" bind:value={q} />
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
		<details class="backups sheet">
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
						<p class="snippet sheet-ink-soft">{r.snippet}</p>
					</li>
				{/each}
			</ul>
		{/if}
	{:else if data.campaigns.length === 0}
		<p class="empty">The table lies bare. Create a campaign to begin.</p>
	{:else}
		<ul class="grid">
			{#each data.campaigns as c, i (c.id)}
				<li class="sheet card dogear" style={`--rot:${(i % 5) - 2}deg`}>
					<a href={`/c/${c.id}`} class="title">{c.title}</a>
					<span class="meta">
						<span class="time sheet-ink-soft">Edited {relTime(c.updated_at || c.created_at)}</span>
						<span class="counts sheet-ink-soft">{c.maps} map{c.maps === 1 ? '' : 's'} · {c.rolls} roll{c.rolls === 1 ? '' : 's'}</span>
					</span>
					<span class="actions">
						<a href={`/c/${c.id}/play`} class="play" title="Open the player view">Open player view</a>
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
		padding: 0 1.5rem 5rem;
	}
	/* the table surface: a broad parchment-cloth tablecloth over the oak, with a
	   generous warm centre glow and dark wood margins */
	.table {
		position: relative;
		max-width: 58rem;
		margin: 1.5rem auto;
		background:
			linear-gradient(180deg, rgba(212, 178, 120, 0.10), transparent 30%),
			rgba(34, 26, 15, 0.55);
		border: 1px solid var(--rule);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-lg);
		padding: 2rem 2rem 2.5rem;
	}
	/* heraldic crest band across the top of the tablecloth */
	.crest-band {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding-bottom: 1.2rem;
		border-bottom: 1px solid var(--rule);
		position: relative;
	}
	.crest {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 1rem;
	}
	.crest-sigil {
		flex-shrink: 0;
	}
	.crest-txt {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		line-height: 1;
	}
	.crest-txt h1 {
		margin: 0;
		font-family: var(--font-display);
		font-weight: 700;
		letter-spacing: 0.08em;
		color: var(--gold);
		text-shadow: 0 2px 10px rgba(0, 0, 0, 0.6);
		font-size: 1.9rem;
	}
	.tagline {
		font-size: 0.72rem;
		font-family: var(--font-ui);
		letter-spacing: 0.32em;
		text-transform: uppercase;
		color: var(--ink-soft);
		margin-top: 0.5rem;
	}
	.crest-left,
	.crest-right {
		flex-shrink: 0;
		min-width: 6rem;
	}
	.crest-right {
		display: flex;
		justify-content: flex-end;
	}
	.ornament {
		margin: 1.4rem 0 1.6rem;
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
		border-radius: 6px;
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
		font-weight: 700;
		letter-spacing: 0.04em;
		padding: 0.22rem 0.5rem;
		border-radius: 99px;
		border: 1px solid var(--rule);
		color: var(--ink-soft);
	}
	.auth-pill.on {
		color: #3a120c;
		background: var(--accent);
		border-color: var(--accent);
	}
	.row {
		display: flex;
		flex-direction: column;
		gap: 0.8rem;
		margin-bottom: 1.8rem;
	}
	/* the campaign create sheet — a blank parchment waiting for a title */
	.create {
		display: flex;
		gap: 0.6rem;
		padding: 0.9rem 0.9rem 0.9rem 1.1rem;
	}
	.create input {
		flex: 1;
		padding: 0.55rem 0.6rem;
		border: none;
		border-bottom: 1px solid var(--paper-rule);
		border-radius: 0;
		background: transparent;
		color: var(--paper-ink);
		font-size: 1.05rem;
		font-family: var(--font-body);
	}
	.create input::placeholder {
		color: var(--paper-ink-soft);
	}
	.create input:focus {
		outline: none;
		border-bottom-color: #7a5c14;
	}
	.create .btn-wax {
		flex-shrink: 0;
		padding: 0.55rem 1.3rem;
	}
	/* search — a slim parchment strip laid on the table */
	.search {
		display: flex;
		gap: 0.5rem;
		background: rgba(0, 0, 0, 0.25);
		border: 1px solid var(--rule);
		border-radius: 8px;
		padding: 0.4rem 0.4rem 0.4rem 0.7rem;
	}
	.search input {
		flex: 1;
		padding: 0.45rem 0.5rem;
		border: none;
		background: transparent;
		color: var(--ink);
		font-size: 0.95rem;
		font-family: var(--font-body);
	}
	.search input::placeholder {
		color: var(--ink-soft);
	}
	.search button {
		padding: 0.45rem 1rem;
		border: 1px solid var(--gold);
		border-radius: 6px;
		background: var(--parchment-light);
		color: var(--gold);
		font-size: 0.88rem;
		font-family: var(--font-ui);
		cursor: pointer;
	}
	.search button:hover {
		background: var(--gold);
		color: var(--parchment-deep);
	}
	.import {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
	.import-label {
		font-size: 0.9rem;
		color: var(--ink-soft);
		display: inline-flex;
		gap: 0.4rem;
		align-items: center;
	}
	.import button {
		padding: 0.4rem 0.9rem;
		border: 1px solid var(--rule);
		border-radius: 6px;
		background: var(--parchment-light);
		color: var(--ink-soft);
		cursor: pointer;
	}
	.import-error {
		color: var(--danger);
		margin: 0;
	}
	.grid {
		list-style: none;
		padding: 0;
		margin: 0;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(16rem, 1fr));
		gap: 1.1rem;
		padding: 0.5rem;
	}
	.card {
		display: flex;
		flex-direction: column;
		gap: 0.8rem;
		padding: 1.2rem 1.3rem 1rem;
		transform: rotate(var(--rot, 0deg));
		transition: transform 0.18s ease, box-shadow 0.18s ease;
	}
	.card:hover {
		transform: rotate(0deg) translateY(-3px);
		box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.3), inset 0 0 40px rgba(110, 80, 30, 0.08), 0 14px 30px rgba(0, 0, 0, 0.6);
	}
	.title {
		font-size: 1.2rem;
		font-family: var(--font-display);
		font-weight: 700;
		text-decoration: none;
		color: var(--paper-ink);
	}
	.title:hover {
		color: #7a5c14;
	}
	.meta {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		font-size: 0.82rem;
	}
	.play {
		font-size: 0.88rem;
		color: #7a5c14;
		text-decoration: none;
	}
	.play:hover {
		text-decoration: underline;
	}
	.actions {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		border-top: 1px solid var(--paper-rule);
		padding-top: 0.6rem;
	}
	.delete {
		border: 0;
		background: none;
		color: var(--paper-ink-soft);
		cursor: pointer;
		font-size: 0.9rem;
		padding: 0.2rem;
	}
	.delete:hover {
		color: var(--danger);
	}
	.empty {
		color: var(--ink-soft);
		font-style: italic;
		text-align: center;
		padding: 2rem 0;
	}
	.results {
		list-style: none;
		padding: 0;
		margin: 0;
		display: grid;
		gap: 1rem;
		grid-template-columns: repeat(auto-fill, minmax(16rem, 1fr));
	}
	.result {
		padding: 1rem 1.1rem;
	}
	.snippet {
		color: var(--paper-ink-soft);
		font-size: 0.9rem;
		margin: 0.4rem 0;
	}
	.backups {
		margin-bottom: 1.6rem;
		padding: 1rem 1.2rem;
	}
	.bhead {
		font-family: var(--font-display);
		font-weight: 700;
		font-size: 1rem;
		color: var(--paper-ink);
		cursor: pointer;
	}
	.restore-msg {
		color: #7a5c14;
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
		background: rgba(0, 0, 0, 0.12);
		border: 1px solid var(--paper-rule);
		border-radius: 4px;
	}
	.bname {
		font-size: 0.82rem;
		color: var(--paper-ink);
		word-break: break-all;
	}
	.bmeta {
		font-size: 0.78rem;
		color: var(--paper-ink-soft);
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
		border-radius: 4px;
		background: transparent;
		color: var(--paper-ink-soft);
		cursor: pointer;
		text-decoration: none;
	}
	.bactions a:hover,
	.bactions button:hover {
		border-color: #7a5c14;
		color: var(--paper-ink);
	}
	.bactions .bdel {
		color: #7a5c14;
	}
</style>
