<script lang="ts">
	import { enhance } from '$app/forms';
	import Seal from '$lib/components/Seal.svelte';

	let { form, data }: { form?: { error?: string } | null; data: { configured: boolean } } =
		$props();
</script>

<svelte:head><title>DM login</title></svelte:head>

<main class="table">
	<div class="panel sheet dogear">
		<div class="crest">
			<Seal size={70} />
			<h1 class="sheet-ink">The DM's Seal</h1>
			<p class="sub sheet-ink-soft">Press your passcode to unseal the war table</p>
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
			<button type="submit" class="btn-wax">Unseal</button>
		</form>
		<div class="ornament" aria-hidden="true"><span>✦</span></div>
		<a href="/" class="back">← back to the war table</a>
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
		padding: 2.2rem 2rem 1.8rem;
		text-align: center;
	}
	.crest {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.9rem;
		margin-bottom: 0.5rem;
	}
	.crest .seal {
		filter: drop-shadow(0 3px 6px rgba(0, 0, 0, 0.4));
	}
	h1 {
		font-family: var(--font-display);
		font-size: 1.7rem;
		letter-spacing: 0.06em;
		margin: 0;
	}
	.sub {
		font-size: 0.85rem;
		font-style: italic;
		margin: 0;
	}
	.warn {
		color: #8a6d1a;
		margin: 1rem 0;
		font-size: 0.85rem;
		border: 1px dashed var(--paper-rule);
		border-radius: 6px;
		padding: 0.6rem;
		background: rgba(0, 0, 0, 0.04);
	}
	.error {
		color: #a8362c;
		margin: 1rem 0;
	}
	form {
		display: flex;
		gap: 0.5rem;
		margin: 1.2rem 0;
	}
	input {
		flex: 1;
		padding: 0.6rem 0.75rem;
		border: 1px solid var(--paper-rule);
		border-radius: 4px;
		background: rgba(255, 255, 255, 0.4);
		color: var(--paper-ink);
		font-size: 1rem;
		font-family: var(--font-body);
	}
	input::placeholder {
		color: var(--paper-ink-soft);
	}
	form .btn-wax {
		padding: 0.6rem 1.4rem;
	}
	.ornament {
		margin: 1.2rem 0 0.8rem;
	}
	.back {
		color: var(--paper-ink-soft);
		text-decoration: none;
	}
	.back:hover {
		color: #7a5c14;
	}
</style>
