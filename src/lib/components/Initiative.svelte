<script lang="ts">
	import type { InitEntry, CombatUnit } from '$lib/server/db';

	let {
		campaignId,
		dm = false,
		initial = [],
		initialRound = 1,
		units = [],
		viewerUnitId = null
	}: {
		campaignId: string;
		dm?: boolean;
		initial?: InitEntry[];
		initialRound?: number;
		units?: CombatUnit[];
		viewerUnitId?: string | null;
	} = $props();

	let entries = $state<InitEntry[]>([...initial]);
	let round = $state(initialRound);
	let open = $state(true);

	/** Apply the latest list + round from the server (SSE). */
	export function applyEntries(next: InitEntry[], nextRound: number = round) {
		entries = [...next];
		round = nextRound;
	}

	async function post(url: string, payload: unknown) {
		await fetch(url, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(payload)
		});
	}

	function setActive(entry: InitEntry) {
		post(`/c/${campaignId}/initiative/${entry.id}`, { action: 'update', active: true });
	}
	function setHp(entry: InitEntry, delta: number) {
		const unit = units.find((u) => u.id === entry.unit_id);
		const targetHp = Math.max(0, (unit ? unit.hp : entry.hp) + delta);
		if (unit) {
			post(`/c/${campaignId}/combat/units/${unit.id}`, { action: 'hp', hp: targetHp });
		} else {
			post(`/c/${campaignId}/initiative/${entry.id}`, { action: 'update', hp: targetHp });
		}
	}
	function remove(entry: InitEntry) {
		post(`/c/${campaignId}/initiative/${entry.id}`, { action: 'remove' });
	}
	function nextTurn() {
		post(`/c/${campaignId}/initiative`, { action: 'next' });
	}
	/** Advance to the next combatant (keyboard shortcut). */
	export function advance() {
		nextTurn();
	}
	function clear() {
		post(`/c/${campaignId}/initiative`, { action: 'clear' });
	}
</script>

<div class="initiative" class:open>
	<button type="button" class="header" onclick={() => (open = !open)}>
		⚔ Initiative · Round {round} {open ? '▾' : '▴'}
	</button>
	{#if open}
		<div class="list">
			{#if entries.length === 0}
				<p class="empty">No combatants yet.</p>
			{/if}
			{#each entries as e (e.id)}
				{@const unit = units.find((u) => u.id === e.unit_id)}
				<div class="entry" class:active={e.active === 1} class:dead={!!unit && unit.alive === 0}>
					{#if dm}
						<button type="button" class="play" title="It's their turn" aria-label="Set active turn" onclick={() => setActive(e)}>▶</button>
						<button type="button" class="rm" title="Remove" aria-label="Remove" onclick={() => remove(e)}>✕</button>
					{/if}
					<span class="nm">{e.name}</span>
					{#if unit && unit.alive === 0}<span class="down">💀 down</span>{/if}
					<span class="in">({e.init})</span>
					{#if dm}
						<span class="hp">
							<button type="button" onclick={() => setHp(e, -1)}>−</button>
							{unit ? unit.hp : e.hp}{unit && unit.max_hp ? `/${unit.max_hp}` : ''}
							<button type="button" onclick={() => setHp(e, 1)}>+</button>
						</span>
					{:else if e.unit_id === viewerUnitId && unit}
						<span class="hp">{unit.hp}{unit.max_hp ? `/${unit.max_hp}` : ''}</span>
					{/if}
				</div>
			{/each}
		</div>
		{#if dm}
			<div class="actions">
				<button type="button" onclick={nextTurn}>Next ▸</button>
				<button type="button" onclick={clear}>Clear</button>
			</div>
		{/if}
	{/if}
</div>

<style>
	.initiative {
		width: 100%;
		background: var(--parchment-light);
		border: 1px solid var(--rule);
		border-top: 3px solid var(--gold);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-md);
		font-family: system-ui, sans-serif;
		font-size: 0.9rem;
		color: var(--ink);
		overflow: hidden;
	}
	.header {
		width: 100%;
		text-align: left;
		padding: 0.6rem 0.85rem;
		border: 0;
		background: none;
		font-family: var(--font-display);
		font-weight: 600;
		font-size: 1.05rem;
		color: var(--accent);
		cursor: pointer;
	}
	.list {
		max-height: none;
		overflow-y: auto;
		padding: 0 0.5rem;
	}
	.empty {
		color: var(--ink-soft);
		text-align: center;
		padding: 1rem 0.4rem;
		font-style: normal;
	}
	.empty::before {
		content: '⚔️';
		display: block;
		font-size: 1.4rem;
		opacity: 0.7;
		margin-bottom: 0.3rem;
	}
	.entry {
		display: flex;
		align-items: center;
		gap: 0.3rem;
		padding: 0.3rem 0.2rem;
		border-top: 1px solid var(--rule);
		transition: background 0.15s ease;
	}
	.entry.active {
		background: rgba(111, 143, 245, 0.10);
		box-shadow: inset 3px 0 0 var(--accent);
	}
	.entry.dead {
		opacity: 0.5;
	}
	.entry.dead .nm {
		text-decoration: line-through;
	}
	.down {
		color: var(--danger);
		font-size: 0.72rem;
		background: rgba(226, 93, 84, 0.12);
		border: 1px solid rgba(226, 93, 84, 0.35);
		border-radius: 999px;
		padding: 0 0.4rem;
	}
	.nm {
		flex: 1;
		font-weight: 600;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.in {
		color: var(--ink-soft);
	}
	.hp {
		display: inline-flex;
		align-items: center;
		gap: 0.15rem;
	}
	.hp button {
		border: 1px solid var(--rule);
		background: var(--parchment-light);
		border-radius: 3px;
		cursor: pointer;
		width: 1.1rem;
	}
	.play {
		border: 0;
		background: none;
		cursor: pointer;
		color: var(--accent);
		border-radius: var(--radius-sm);
		transition: background 0.12s ease;
	}
	.play:hover {
		background: rgba(111, 143, 245, 0.15);
	}
	.rm {
		border: 0;
		background: none;
		cursor: pointer;
		color: var(--ink-soft);
		border-radius: var(--radius-sm);
		transition: color 0.12s ease, background 0.12s ease;
	}
	.rm:hover {
		color: var(--danger);
		background: rgba(226, 93, 84, 0.12);
	}
	.actions {
		display: flex;
		gap: 0.3rem;
		padding: 0 0.5rem 0.5rem;
	}
	.actions button {
		flex: 1;
		border: 1px solid var(--accent-soft);
		background: var(--parchment-deep);
		color: var(--ink);
		font-weight: 600;
		border-radius: var(--radius-md);
		padding: 0.4rem;
		cursor: pointer;
		transition: background 0.12s ease, border-color 0.12s ease, color 0.12s ease, transform 0.06s ease;
	}
	.actions button:hover {
		background: rgba(111, 143, 245, 0.14);
		border-color: var(--accent);
		color: var(--accent-soft);
	}
	.actions button:active {
		transform: translateY(1px);
	}
</style>
