<script lang="ts">
	import { enhance } from '$app/forms';
	import Seal from '$lib/components/Seal.svelte';

	let { form, data }: { form?: { error?: string } | null; data: { configured: boolean } } =
		$props();
</script>

<svelte:head><title>DM login</title></svelte:head>

<main>
	<div class="panel filigree">
		<div class="crest">
			<Seal size={74} />
			<h1>DM login</h1>
		</div>
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
			<button type="submit" class="btn-wax">Log in</button>
		</form>
		<div class="ornament" aria-hidden="true"><span>✦</span></div>
		<a href="/" class="back">← back to the war table</a>
	</div>
</main>

<style>
	main {
		max-width: 24rem;
		margin: 4rem auto;
		padding: 0 1rem;
		font-family: var(--font-body);
		text-align: center;
	}
	.panel {
		background: linear-gradient(180deg, rgba(220, 178, 90, 0.06), transparent 40%), var(--parchment-light);
		border: 1px solid var(--rule);
		border-radius: 10px;
		box-shadow: var(--shadow-lg);
		padding: 2rem 1.8rem 1.6rem;
	}
	.crest {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.9rem;
		margin-bottom: 0.5rem;
	}
	h1 {
		font-family: var(--font-display);
		color: var(--accent);
		letter-spacing: 0.06em;
		margin: 0;
	}
	.warn {
		color: var(--accent-soft);
		margin: 1rem 0;
	}
	.error {
		color: var(--danger);
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
	.ornament {
		margin: 1.2rem 0 0.8rem;
	}
	.back {
		color: var(--ink-soft);
		text-decoration: none;
	}
	.back:hover {
		color: var(--accent);
	}
</style>
