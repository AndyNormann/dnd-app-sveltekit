<script lang="ts">
	import { enhance } from '$app/forms';

	let { form, data }: { form?: { error?: string } | null; data: { configured: boolean } } =
		$props();
</script>

<svelte:head><title>DM login</title></svelte:head>

<main>
	<h1>DM login</h1>
	{#if !data.configured}
		<p class="warn">
			⚠ No <code>DM_PASSCODE</code> is configured — DM access is currently open. Set the env
			var on your host to enable protection.
		</p>
	{/if}
	{#if form?.error}<p class="error">{form.error}</p>{/if}
	<form method="POST" use:enhance>
		<input
			type="password"
			name="passcode"
			placeholder="DM passcode"
			autocomplete="current-password"
			autofocus
		/>
		<button type="submit">Log in</button>
	</form>
	<a href="/" class="back">← back</a>
</main>

<style>
	main {
		max-width: 24rem;
		margin: 4rem auto;
		padding: 0 1rem;
		font-family: var(--font-body);
		text-align: center;
	}
	h1 {
		font-family: var(--font-display);
		color: var(--accent);
	}
	.warn,
	.error {
		color: var(--accent-soft);
		margin: 1rem 0;
	}
	form {
		display: flex;
		gap: 0.5rem;
		margin: 1rem 0;
	}
	input {
		flex: 1;
		padding: 0.6rem 0.75rem;
		border: 1px solid var(--rule);
		border-radius: 6px;
		font-size: 1rem;
	}
	button {
		padding: 0.6rem 1.2rem;
		border: 1px solid var(--accent);
		border-radius: 6px;
		background: var(--accent);
		color: var(--parchment-light);
		font-family: var(--font-ui);
		cursor: pointer;
	}
	.back {
		color: var(--ink-soft);
	}
</style>
