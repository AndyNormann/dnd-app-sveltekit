<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head><title>D&D Campaigns</title></svelte:head>

<main>
	<h1>Campaigns</h1>

	<form method="POST" action="?/create" use:enhance class="create">
		<input name="title" placeholder="New campaign title" autocomplete="off" />
		<button type="submit">Create</button>
	</form>

	{#if data.campaigns.length === 0}
		<p class="empty">No campaigns yet. Create one to get started.</p>
	{:else}
		<ul class="list">
			{#each data.campaigns as c (c.id)}
				<li>
					<a href={`/c/${c.id}`} class="title">{c.title}</a>
					<a href={`/c/${c.id}/play`} class="play">player view</a>
				</li>
			{/each}
		</ul>
	{/if}
</main>

<style>
	main {
		max-width: 42rem;
		margin: 3rem auto;
		padding: 0 1rem;
		font-family: system-ui, sans-serif;
	}
	h1 {
		margin-bottom: 1.5rem;
	}
	.create {
		display: flex;
		gap: 0.5rem;
		margin-bottom: 2rem;
	}
	.create input {
		flex: 1;
		padding: 0.6rem 0.75rem;
		border: 1px solid #ccc;
		border-radius: 6px;
		font-size: 1rem;
	}
	.create button {
		padding: 0.6rem 1.2rem;
		border: 0;
		border-radius: 6px;
		background: #5b21b6;
		color: white;
		font-size: 1rem;
		cursor: pointer;
	}
	.list {
		list-style: none;
		padding: 0;
	}
	.list li {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		padding: 0.8rem 0;
		border-bottom: 1px solid #eee;
	}
	.title {
		font-size: 1.1rem;
		font-weight: 600;
		text-decoration: none;
		color: #1f2937;
	}
	.play {
		font-size: 0.85rem;
		color: #6b7280;
	}
	.empty {
		color: #6b7280;
	}
</style>
