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
	let label = $state('');
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

	/** Whether the DM's secret toggle is currently checked (always false for players). */
	export function isSecret(): boolean {
		return dm && secret;
	}

	/** Append a roll arriving over SSE (update in place if it already exists). */
	export function addRoll(roll: RollData) {
		const idx = rolls.findIndex((r) => r.id === roll.id);
		if (idx >= 0) {
			// a revealed secret roll updates the existing (secret) entry in place
			rolls = rolls.map((r) => (r.id === roll.id ? roll : r));
		} else {
			rolls = [...rolls, roll];
		}
		scrollToEnd();
	}

	/** Ask the server to reveal a secret roll to players, then clear its secret flag locally. */
	export async function revealRoll(roll: RollData) {
		await fetch(`/c/${campaignId}/roll/${roll.id}`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ action: 'reveal' })
		});
		rolls = rolls.map((r) => (r.id === roll.id ? { ...r, secret: false } : r));
	}

	/** Replace the whole roll list (e.g. on SSE snapshot after a reconnect). */
	export function setRolls(next: RollData[]) {
		rolls = [...next];
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
			body: JSON.stringify({
				roller: roller || (dm ? 'DM' : ''),
				expression: expr,
				secret,
				label: label.trim()
			})
		});
		if (res.ok) {
			addRoll((await res.json()) as RollData);
			expression = '';
			label = '';
		} else {
			errorMsg = 'Invalid expression';
		}
	}
</script>

<div class="roll-log" class:open>
	<button type="button" class="header" onclick={() => (open = !open)}>
		<svg class="d20" viewBox="0 0 100 100" aria-hidden="true">
			<g fill="none" stroke="currentColor" stroke-width="6" stroke-linejoin="round">
				<polygon points="50,4 89,26 89,74 50,96 11,74 11,26" />
				<polygon points="50,22 76,68 24,68" />
				<line x1="50" y1="4" x2="50" y2="22" />
				<line x1="89" y1="26" x2="50" y2="22" />
				<line x1="11" y1="26" x2="50" y2="22" />
				<line x1="89" y1="26" x2="76" y2="68" />
				<line x1="11" y1="26" x2="24" y2="68" />
				<line x1="89" y1="74" x2="76" y2="68" />
				<line x1="11" y1="74" x2="24" y2="68" />
				<line x1="50" y1="96" x2="76" y2="68" />
				<line x1="50" y1="96" x2="24" y2="68" />
			</g>
		</svg>
		Rolls {open ? '▾' : '▴'}
	</button>
	{#if open}
		<div class="list" bind:this={listEl}>
			{#if rolls.length === 0}
				<p class="empty">No rolls yet.</p>
			{/if}
			{#each rolls as r (r.id)}
				<div class="roll" class:secret={r.secret}>
					<span class="who">{r.roller}{r.secret ? ' 🤫' : ''}</span>
					{#if dm && r.secret}
						<button type="button" class="reveal" title="Show to players" onclick={() => revealRoll(r)}>
							👁
						</button>
					{/if}
					<span class="total">{r.result}</span>
					{#if r.label}<span class="label">{r.label}</span>{/if}
					<span class="detail">{r.breakdown}</span>
				</div>
			{/each}
		</div>
		<form class="input" onsubmit={submit}>
			{#if !dm}
				<input class="name" placeholder="Name" bind:value={roller} maxlength="40" />
			{/if}
			<input class="expr" placeholder="2d6+3" bind:value={expression} maxlength="100" />
			<input class="expr label" placeholder="optional label" bind:value={label} maxlength="80" />
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
		height: 100%;
		display: flex;
		flex-direction: column;
		background: var(--parchment-light);
		border-top: 3px solid var(--gold);
		font-family: system-ui, sans-serif;
		font-size: 0.85rem;
		color: var(--ink);
		overflow: hidden;
		box-sizing: border-box;
	}
	.header {
		width: 100%;
		display: flex;
		align-items: center;
		gap: 0.4rem;
		text-align: left;
		padding: 0.5rem 0.75rem;
		border: 0;
		background: none;
		font-family: var(--font-display);
		font-weight: 600;
		color: var(--accent);
		cursor: pointer;
	}
	.d20 {
		width: 1.1rem;
		height: 1.1rem;
	}
	.list {
		flex: 1;
		overflow-y: auto;
		max-height: none;
		padding: 0 0.75rem;
	}
	.empty {
		color: var(--ink-soft);
		font-style: italic;
		margin: 0.4rem 0;
	}
	.roll {
		display: grid;
		grid-template-columns: 1fr auto;
		gap: 0 0.5rem;
		padding: 0.35rem 0;
		border-top: 1px solid var(--rule);
	}
	.roll:last-child {
		animation: roll-land 1.2s ease-out;
	}
	@keyframes roll-land {
		0% {
			background: var(--parchment-deep);
			box-shadow: inset 3px 0 0 var(--gold);
		}
		100% {
			background: transparent;
			box-shadow: none;
		}
	}
	.roll.secret {
		background: var(--parchment-deep);
	}
	.who {
		font-weight: 600;
		color: var(--ink);
	}
	.reveal {
		border: 1px solid var(--rule);
		background: var(--parchment-light);
		border-radius: 3px;
		cursor: pointer;
		font-size: 0.75rem;
		line-height: 1;
		padding: 0.1rem 0.3rem;
		color: var(--accent);
	}
	.total {
		font-family: var(--font-display);
		font-weight: 700;
		color: var(--accent);
	}
	.detail {
		grid-column: 1 / -1;
		color: var(--ink-soft);
		font-size: 0.78rem;
	}
	.label {
		grid-column: 1 / -1;
		color: var(--accent);
		font-weight: 600;
		font-size: 0.78rem;
	}
	.input {
		display: flex;
		gap: 0.3rem;
		padding: 0.5rem 0.75rem;
		border-top: 1px solid var(--rule);
	}
	.input input {
		border: 1px solid var(--rule);
		background: var(--parchment-deep);
		color: var(--ink);
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
		background: var(--accent);
		color: var(--parchment-light);
		border-radius: 5px;
		padding: 0.3rem 0.7rem;
		cursor: pointer;
	}
	.input button:hover {
		background: var(--accent-soft);
	}
	.error {
		color: var(--accent-soft);
		padding: 0 0.75rem 0.5rem;
		margin: 0;
	}
</style>
