<script lang="ts">
	import { onMount, tick } from 'svelte';
	import type { RollData } from '$lib/types';

	let {
		campaignId,
		dm = false,
		initial = []
	}: { campaignId: string; dm?: boolean; initial?: RollData[] } = $props();

	let rolls = $state<RollData[]>([...initial]);
	let open = $state(true);
	let expression = $state('');
	let roller = $state('');
	let secret = $state(false);
	let errorMsg = $state('');
	let listEl: HTMLDivElement | undefined = $state();

	onMount(() => {
		roller = dm ? 'DM' : (localStorage.getItem('dnd-roller-name') ?? '');
		scrollToEnd();
	});

	async function scrollToEnd() {
		await tick();
		listEl?.scrollTo({ top: listEl.scrollHeight });
	}

	/** Append a roll arriving over SSE (deduped against our own POST echoes). */
	export function addRoll(roll: RollData) {
		if (rolls.some((r) => r.id === roll.id)) return;
		rolls = [...rolls, roll];
		scrollToEnd();
	}

	async function submit(e: Event) {
		e.preventDefault();
		errorMsg = '';
		const expr = expression.trim();
		if (!expr) return;
		if (!dm && roller.trim()) localStorage.setItem('dnd-roller-name', roller.trim());
		const res = await fetch(`/c/${campaignId}/roll`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ roller: roller || (dm ? 'DM' : ''), expression: expr, secret })
		});
		if (res.ok) {
			addRoll((await res.json()) as RollData);
			expression = '';
		} else {
			errorMsg = 'Invalid expression';
		}
	}
</script>

<div class="roll-log" class:open>
	<button type="button" class="header" onclick={() => (open = !open)}>
		🎲 Rolls {open ? '▾' : '▴'}
	</button>
	{#if open}
		<div class="list" bind:this={listEl}>
			{#if rolls.length === 0}
				<p class="empty">No rolls yet.</p>
			{/if}
			{#each rolls as r (r.id)}
				<div class="roll" class:secret={r.secret}>
					<span class="who">{r.roller}{r.secret ? ' 🤫' : ''}</span>
					<span class="total">{r.result}</span>
					<span class="detail">{r.breakdown}</span>
				</div>
			{/each}
		</div>
		<form class="input" onsubmit={submit}>
			{#if !dm}
				<input class="name" placeholder="Name" bind:value={roller} maxlength="40" />
			{/if}
			<input class="expr" placeholder="2d6+3" bind:value={expression} maxlength="100" />
			{#if dm}
				<label class="secret-toggle" title="Hide from players">
					<input type="checkbox" bind:checked={secret} /> 🤫
				</label>
			{/if}
			<button type="submit">Roll</button>
		</form>
		{#if errorMsg}<p class="error">{errorMsg}</p>{/if}
	{/if}
</div>

<style>
	.roll-log {
		position: fixed;
		bottom: 1rem;
		right: 1rem;
		width: 18rem;
		background: #fff;
		border: 1px solid #d1d5db;
		border-radius: 8px;
		box-shadow: 0 4px 14px rgba(0, 0, 0, 0.12);
		font-family: system-ui, sans-serif;
		font-size: 0.85rem;
		z-index: 50;
	}
	.header {
		width: 100%;
		text-align: left;
		padding: 0.5rem 0.75rem;
		border: 0;
		background: none;
		font-weight: 600;
		cursor: pointer;
	}
	.list {
		max-height: 14rem;
		overflow-y: auto;
		padding: 0 0.75rem;
	}
	.empty {
		color: #9ca3af;
		margin: 0.4rem 0;
	}
	.roll {
		display: grid;
		grid-template-columns: 1fr auto;
		gap: 0 0.5rem;
		padding: 0.35rem 0;
		border-top: 1px solid #f3f4f6;
	}
	.roll.secret {
		background: #fdf4ff;
	}
	.who {
		font-weight: 600;
		color: #374151;
	}
	.total {
		font-weight: 700;
		color: #5b21b6;
	}
	.detail {
		grid-column: 1 / -1;
		color: #6b7280;
		font-size: 0.78rem;
	}
	.input {
		display: flex;
		gap: 0.3rem;
		padding: 0.5rem 0.75rem;
		border-top: 1px solid #e5e7eb;
	}
	.input input {
		border: 1px solid #d1d5db;
		border-radius: 5px;
		padding: 0.3rem 0.4rem;
		font-size: 0.85rem;
		min-width: 0;
	}
	.name {
		flex: 1;
	}
	.expr {
		flex: 1.4;
	}
	.secret-toggle {
		display: flex;
		align-items: center;
		gap: 0.15rem;
		cursor: pointer;
	}
	.input button {
		border: 0;
		background: #5b21b6;
		color: #fff;
		border-radius: 5px;
		padding: 0.3rem 0.7rem;
		cursor: pointer;
	}
	.error {
		color: #dc2626;
		padding: 0 0.75rem 0.5rem;
		margin: 0;
	}
</style>
