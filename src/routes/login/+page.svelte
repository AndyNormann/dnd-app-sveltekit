<script lang="ts">
	import { enhance } from '$app/forms';

	let { form, data }: { form?: { error?: string } | null; data: { configured: boolean } } =
		$props();
</script>

<svelte:head><title>DM login</title></svelte:head>

<main>
	<div class="panel sheet">
		<h1>Log in</h1>
		<p class="sub">Enter the DM passcode to continue.</p>
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
		<a href="/" class="back">← Back</a>
	</div>
</main>

<style>
	main {
		min-height: 100vh;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 1rem;
		font-family: var(--font-body);
	}
	.panel {
		width: 100%;
		max-width: 24rem;
		padding: 2.4rem 2.2rem 1.9rem;
	}
	h1 {
		font-family: var(--font-display);
		font-size: 1.6rem;
		letter-spacing: -0.01em;
		margin: 0 0 0.3rem;
	}
	.sub {
		font-size: 0.9rem;
		color: var(--ink-soft);
		margin: 0;
	}
	.warn {
		color: var(--accent);
		margin: 1rem 0;
		font-size: 0.85rem;
		border: 1px dashed var(--paper-rule);
		border-radius: var(--radius-sm);
		padding: 0.6rem;
		background: rgba(0, 0, 0, 0.03);
	}
	.error {
		color: var(--danger);
		margin: 1rem 0;
	}
	form {
		display: flex;
		gap: 0.5rem;
		margin: 1.2rem 0;
	}
	input {
		flex: 1;
	}
	button {
		padding: 0.6rem 1.4rem;
		border: 1px solid var(--accent);
		border-radius: var(--radius-sm);
		background: var(--accent);
		color: var(--parchment-light);
		font-size: 0.95rem;
		font-family: var(--font-ui);
		cursor: pointer;
	}
	button:hover {
		background: var(--accent-soft);
		border-color: var(--accent-soft);
	}
	.back {
		color: var(--ink-soft);
		text-decoration: none;
		font-size: 0.9rem;
	}
	.back:hover {
		color: var(--accent);
	}
</style>
