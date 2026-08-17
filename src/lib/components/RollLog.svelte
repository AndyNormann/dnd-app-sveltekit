<script lang="ts">
	import { onMount, tick } from 'svelte';
	import type { RollData } from '$lib/types';
	import type { CombatLogEntry } from '$lib/server/db';

	let {
		campaignId,
		dm = false,
		initial = [],
		initialCombat = []
	}: { campaignId: string; dm?: boolean; initial?: RollData[]; initialCombat?: CombatLogEntry[] } = $props();

	let rolls = $state<RollData[]>([...initial]);
	let combat = $state<CombatLogEntry[]>([...initialCombat]);
	let activity = $derived([
		...rolls.map((r) => ({ kind: 'roll' as const, id: r.id, at: r.created_at, value: r })),
		...combat.map((e) => ({ kind: 'combat' as const, id: `combat-${e.id}`, at: e.created_at, value: e }))
	].sort((a, b) => a.at - b.at));
	let open = $state(true);
	let expression = $state('');
	let label = $state('');
	let roller = $state('');
	let secret = $state(false);
	let errorMsg = $state('');
	let undo = $state<{ key: string; snapshot: RollData[] } | null>(null);
	let undoTo: ReturnType<typeof setTimeout> | undefined;
	let listEl: HTMLDivElement | undefined = $state();

	onMount(() => {
		roller = dm ? 'DM' : (localStorage.getItem('dnd-roller-name') ?? '');
		scrollToEnd();
	});

	async function scrollToEnd() {
		await tick();
		const el = listEl;
		if (!el) return;
		// don't yank the list if the user has scrolled up to read older rolls
		if (el.scrollHeight - el.scrollTop - el.clientHeight > 60) return;
		el.scrollTo({ top: el.scrollHeight });
	}

	/** Whether the DM's secret toggle is currently checked (always false for players). */
	export function isSecret(): boolean {
		return dm && secret;
	}

	/** Add a combat event to the same chronological activity stream. */
	export function addCombatLog(entry: CombatLogEntry) {
		combat = [entry, ...combat.filter((e) => e.id !== entry.id)].slice(0, 80);
		scrollToEnd();
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

	/** Reveal a secret roll only after the server confirms it. */
	export async function revealRoll(roll: RollData) {
		errorMsg = '';
		try {
			const res = await fetch(`/c/${campaignId}/roll/${roll.id}`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'reveal' })
			});
			if (!res.ok) throw new Error('reveal failed');
			rolls = rolls.map((r) => (r.id === roll.id ? { ...r, secret: false } : r));
		} catch {
			errorMsg = 'Could not show that roll to players. It is still secret.';
		}
	}

	/** Replace the whole roll list (e.g. on SSE snapshot after a reconnect). */
	export function setRolls(next: RollData[]) {
		rolls = [...next];
		scrollToEnd();
	}

	/** Wipe the roll history for real: POST the DM-only clear, then drop it locally and offer Undo. */
	export async function clearRolls() {
		if (!dm || !confirm('Clear the roll history? This can be undone briefly.')) return;
		const res = await fetch(`/c/${campaignId}/roll`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ action: 'clear' })
		});
		if (!res.ok) return;
		const body = (await res.json()) as { ok: boolean; undoKey?: string };
		if (!body.undoKey) return;
		const snapshot = rolls;
		rolls = [];
		expression = '';
		undo = { key: body.undoKey, snapshot };
		clearTimeout(undoTo);
		undoTo = setTimeout(() => (undo = null), 12000);
	}

	/** Undo a clear within the toast window: restore via the server, then set the list from the response.
	 *  On failure the toast stays so the user can retry. */
	async function undoClear() {
		if (!undo) return;
		const { key } = undo;
		clearTimeout(undoTo);
		let failed = false;
		try {
			const res = await fetch(`/c/${campaignId}/roll`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'undo', key })
			});
			if (res.ok) {
				const body = (await res.json()) as { ok: boolean; rolls?: RollData[] };
				if (body.rolls) rolls = body.rolls;
				else rolls = [];
				scrollToEnd();
			} else {
				failed = true;
			}
		} catch {
			failed = true;
		}
		if (failed) {
			// keep the toast (with a fresh window) so the user can retry
			undoTo = setTimeout(() => (undo = null), 12000);
		} else {
			undo = null;
		}
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
		<div class="headrow">
<button type="button" class="header" aria-expanded={open} onclick={() => (open = !open)}>
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
		Activity {open ? '▾' : '▴'}
	</button>
		{#if dm && rolls.length > 0}
			<button type="button" class="clear" title="Wipe the roll history" onclick={clearRolls}>Clear</button>
		{/if}
	</div>
	{#if undo}
		<div class="undo">
			<span>Rolls cleared</span>
			<button type="button" onclick={undoClear}>Undo</button>
		</div>
	{/if}
	{#if open}
		<div class="list" bind:this={listEl}>
			{#if activity.length === 0}
				<p class="empty">No activity yet.</p>
			{/if}
			{#each activity as item (item.id)}
				{#if item.kind === 'combat'}
					<div class="activity-event">{item.value.text}</div>
				{:else}
					{@const r = item.value}
				<div class="roll" class:secret={r.secret} class:critical={r.breakdown.includes('🎉')} class:fumble={r.breakdown.includes('💀')}>
					{#if r.breakdown.includes('🎉')}<span class="moment" aria-label="Critical hit">Critical hit!</span>{:else if r.breakdown.includes('💀')}<span class="moment" aria-label="Fumble">Fumble!</span>{/if}
					<span class="who">{r.roller}{r.secret ? ' 🤫' : ''}</span>
					<span class="total">{r.result}</span>
					{#if dm && r.secret}
						<button type="button" class="reveal" title="Show to players" aria-label="Show this secret roll to players" onclick={() => revealRoll(r)}>
							👁
						</button>
					{/if}
					{#if r.label}<span class="label">{r.label}</span>{/if}
					<span class="detail">{r.breakdown}</span>
				</div>
				{/if}
			{/each}
		</div>
		<form class="input" onsubmit={submit}>
			<div class="row">
				{#if !dm}
					<input class="name" placeholder="Name" bind:value={roller} maxlength="40" />
				{/if}
				<input class="expr" placeholder="2d6+3" bind:value={expression} maxlength="100" />
				{#if dm}
					<label class="secret-toggle" title="Hide from players">
						<input type="checkbox" bind:checked={secret} />
						<span>{secret ? 'Secret rolls ON' : 'Secret'}</span>
					</label>
				{/if}
				<button type="submit" title="Roll (d20)" aria-label="Roll">⚔</button>
			</div>
			<input class="expr optlabel" placeholder="optional label" bind:value={label} maxlength="80" />
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
		font-family: var(--font-ui);
		font-size: 0.85rem;
		color: var(--ink);
		overflow: hidden;
		box-sizing: border-box;
	}
	.headrow {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.4rem;
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
	.undo {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		padding: 0.4rem 0.75rem;
		background: var(--parchment-deep);
		border-top: 1px solid var(--rule);
		border-bottom: 1px solid var(--rule);
		font-size: 0.82rem;
		color: var(--ink);
	}
	.undo button {
		border: 1px solid var(--accent);
		background: none;
		color: var(--accent);
		border-radius: 5px;
		padding: 0.15rem 0.6rem;
		cursor: pointer;
		font-family: var(--font-display);
		font-weight: 600;
	}
	.undo button:hover {
		background: var(--accent);
		color: var(--parchment-light);
	}
	.clear {
		margin-right: 0.5rem;
		border: 1px solid var(--rule);
		background: var(--parchment-light);
		color: var(--ink-soft);
		border-radius: 4px;
		font-size: 0.72rem;
		padding: 0.15rem 0.45rem;
		cursor: pointer;
	}
	.clear:hover {
		border-color: var(--danger);
		color: var(--danger);
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
	.activity-event {
		padding: 0.35rem 0;
		border-top: 1px solid var(--rule);
		color: var(--ink-soft);
	}
	.roll {
		display: grid;
		grid-template-columns: 1fr auto auto;
		gap: 0 0.5rem;
		align-items: center;
		padding: 0.35rem 0;
		border-top: 1px solid var(--rule);
	}
	.roll:last-child {
		animation: roll-land 1.2s ease-out;
	}
	@keyframes roll-land {
		0% {
			background: var(--parchment-deep);
			box-shadow: inset 2px 0 0 var(--gold);
		}
		100% {
			background: transparent;
			box-shadow: none;
		}
	}
	.roll.secret {
		background: var(--parchment-deep);
	}
	.roll.critical,
	.roll.fumble {
		position: relative;
		animation: roll-land 1.2s ease-out, fate-flash 900ms ease-out;
	}
	.moment {
		grid-column: 1 / -1;
		font-family: var(--font-display);
		font-size: 0.68rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--accent);
	}
	.fumble .moment { color: var(--danger); }
	@keyframes fate-flash {
		0% { text-shadow: 0 0 0 transparent; }
		35% { text-shadow: 0 0 12px color-mix(in srgb, var(--accent) 55%, transparent); }
		100% { text-shadow: 0 0 0 transparent; }
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
		display: block;
		margin: 0 0.55rem 0;
		padding: 0.5rem 0.6rem 0.6rem;
		background: var(--parchment);
		border: 1px solid var(--rule);
		border-radius: var(--radius-sm);
	}
	.input .row {
		display: flex;
		align-items: center;
		gap: 0.3rem;
	}
	.input input {
		border: 1px solid var(--rule);
		background: var(--parchment-light);
		color: var(--ink);
		border-radius: var(--radius-sm);
		padding: 0.32rem 0.45rem;
		font-size: 0.85rem;
		min-width: 0;
	}
	.name {
		flex: 1;
	}
	.expr {
		flex: 1.4;
	}
	.optlabel {
		width: 100%;
		margin-top: 0.4rem;
		box-sizing: border-box;
	}
	.secret-toggle {
		display: flex;
		align-items: center;
		gap: 0.15rem;
		cursor: pointer;
	}
	.input button[type='submit'] {
		flex-shrink: 0;
		padding: 0.32rem 0.8rem;
		border-radius: var(--radius-sm);
		border: 1px solid var(--accent);
		background: var(--accent);
		color: var(--parchment-light);
		font-family: var(--font-ui);
		font-weight: 600;
		font-size: 0.85rem;
		line-height: 1;
		cursor: pointer;
	}
	.input button[type='submit']:hover {
		background: var(--accent-soft);
		border-color: var(--accent-soft);
	}
	.error {
		color: var(--danger);
		padding: 0 0.75rem 0.5rem;
		margin: 0;
	}
</style>
