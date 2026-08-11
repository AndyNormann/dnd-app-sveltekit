<script lang="ts">
	import { enhance } from '$app/forms';
	import favicon from '$lib/assets/favicon.svg';
	import type { PageData } from './$types';

	let { data, form }: { data: PageData; form?: { error?: string } | null } = $props();

	let q = $state(data.query);
</script>

<svelte:head><title>D&D Campaigns</title></svelte:head>

<main>
	<h1><img class="logo" src={favicon} alt="" /> Campaigns</h1>

	<form method="POST" action="?/create" use:enhance class="create">
		<input name="title" placeholder="New campaign title" autocomplete="off" />
		<button type="submit">Create</button>
	</form>

	<form method="POST" action="?/import" use:enhance class="import" enctype="multipart/form-data">
		<label class="import-label">Restore backup
			<input type="file" name="file" accept=".json,application/json" />
		</label>
		<button type="submit">Import</button>
	</form>
	{#if form?.error}<p class="import-error">{form.error}</p>{/if}

	<form method="GET" action="/" class="search">
		<input name="q" placeholder="Search campaigns &amp; notes…" bind:value={q} />
		<button type="submit">Search</button>
	</form>

	{#if data.query}
		{#if data.results.length === 0}
			<p class="empty">No matches for “{data.query}”.</p>
		{:else}
			<ul class="results">
				{#each data.results as r (r.id)}
					<li class="card">
						<a href={`/c/${r.id}`} class="title">{r.title}</a>
						<p class="snippet">{r.snippet}</p>
						<a href={`/c/${r.id}/play`} class="play">player view</a>
					</li>
				{/each}
			</ul>
		{/if}
	{:else if data.campaigns.length === 0}
		<p class="empty">No campaigns yet. Create one to get started.</p>
	{:else}
		<ul class="grid">
			{#each data.campaigns as c (c.id)}
				<li class="card">
					<a href={`/c/${c.id}`} class="title">{c.title}</a>
					<span class="actions">
						<a href={`/c/${c.id}/play`} class="play">player view</a>
						<form
							method="POST"
							action="?/delete"
							use:enhance={({ cancel }) => {
								if (!confirm(`Delete "${c.title}"? This removes its maps and rolls too.`)) cancel();
							}}
						>
							<input type="hidden" name="id" value={c.id} />
							<button type="submit" class="delete" title="Delete campaign">✕</button>
						</form>
					</span>
				</li>
			{/each}
		</ul>
	{/if}
</main>

<style>
	main {
		max-width: 46rem;
		margin: 3rem auto;
		padding: 0 1rem;
		font-family: var(--font-body);
	}
	h1 {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		margin-bottom: 1.5rem;
		font-family: var(--font-display);
		font-weight: 700;
		color: var(--accent);
		letter-spacing: 0.03em;
	}
	.logo {
		width: 2.2rem;
		height: 2.2rem;
	}
	.create {
		display: flex;
		gap: 0.5rem;
		margin-bottom: 2rem;
	}
	.create input {
		flex: 1;
		padding: 0.6rem 0.75rem;
		border: 1px solid var(--rule);
		border-radius: 6px;
		font-size: 1rem;
		font-family: var(--font-body);
		background: var(--parchment-light);
		color: var(--ink);
	}
	.create button {
		padding: 0.6rem 1.4rem;
		border: 1px solid var(--accent);
		border-radius: 6px;
		background: var(--accent);
		color: var(--parchment-light);
		font-size: 0.95rem;
		font-family: var(--font-display);
		cursor: pointer;
	}
	.create button:hover {
		background: var(--accent-soft);
	}
	.search {
		display: flex;
		gap: 0.5rem;
		margin-bottom: 1.5rem;
	}
	.search input {
		flex: 1;
		padding: 0.6rem 0.75rem;
		border: 1px solid var(--rule);
		border-radius: 6px;
		font-size: 1rem;
		font-family: var(--font-body);
		background: var(--parchment-light);
		color: var(--ink);
	}
	.search button {
		padding: 0.6rem 1.2rem;
		border: 1px solid var(--accent);
		border-radius: 6px;
		background: var(--accent);
		color: var(--parchment-light);
		font-family: var(--font-display);
		cursor: pointer;
	}
	.snippet {
		color: var(--ink-soft);
		font-size: 0.9rem;
		margin: 0.4rem 0;
	}
	.import {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-bottom: 1.5rem;
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
		color: var(--accent-soft);
		margin: 0 0 1rem;
	}
	.grid {
		list-style: none;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(15rem, 1fr));
		gap: 1rem;
	}
	.card {
		display: flex;
		flex-direction: column;
		gap: 0.8rem;
		padding: 1.1rem 1.2rem 0.9rem;
		background: var(--parchment-light);
		border: 1px solid var(--rule);
		border-top: 3px solid var(--gold);
		border-radius: 6px;
		box-shadow: 0 1px 4px rgba(43, 35, 23, 0.08);
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
	.play {
		font-size: 0.9rem;
		color: var(--ink-soft);
	}
	.actions {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
	}
	.delete {
		border: 0;
		background: none;
		color: var(--rule);
		cursor: pointer;
		font-size: 0.9rem;
		padding: 0.2rem;
	}
	.delete:hover {
		color: var(--accent);
	}
	.empty {
		color: var(--ink-soft);
		font-style: italic;
	}
</style>
