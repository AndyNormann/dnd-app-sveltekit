<script lang="ts">
	import { onMount } from 'svelte';
	import CombatBoard from '$lib/components/CombatBoard.svelte';
	import Initiative from '$lib/components/Initiative.svelte';
	import CombatLog from '$lib/components/CombatLog.svelte';
	import type { PageData } from './$types';
	import type { CharacterRow, Monster, CombatUnit, CombatDrawing, BoardConfig } from '$lib/server/db';

	let { data }: { data: PageData } = $props();

	let title = $state(data.title);
	let connected = $state(false);
	let units = $state<CombatUnit[]>(data.units);
	let drawings = $state<CombatDrawing[]>(data.drawings);
	let boardConfig = $state<BoardConfig>(data.boardConfig);
	let characters = $state<CharacterRow[]>(data.characters);
	let monsters = $state<Monster[]>(data.monsters);
	let combatLog: CombatLog;
	let initiative: Initiative;
	let board: CombatBoard;
	let activeName = $state('');
	let round = $state(data.initiativeRound);

	let showRoster = $state(false);
	let showMonsters = $state(false);
	let charName = $state('');
	let charPlayer = $state('');
	let charSpeed = $state('30');
	let charInit = $state('0');
	let charHp = $state('');
	let charColor = $state('#1b6ca8');
	let enemyName = $state('');
	let enemyInit = $state('0');
	let enemyHp = $state('');
	let enemyColor = $state('#a33');
	let monName = $state('');
	let monSpeed = $state('30');
	let monInit = $state('0');
	let monHp = $state('');
	let monColor = $state('#a33');
	let editingMonId = $state<string | null>(null);
	let encMonId = $state('');
	let encCount = $state('1');
	let errorMsg = $state('');
	let toast = $state<string | null>(null);
	let toastTimer: ReturnType<typeof setTimeout>;

	function showToast(msg: string) {
		toast = msg;
		clearTimeout(toastTimer);
		toastTimer = setTimeout(() => (toast = null), 2000);
	}

	function linkFor(c: CharacterRow) {
		return `${location.origin}/p/${c.link_token}`;
	}
	function copyLink(c: CharacterRow) {
		navigator.clipboard?.writeText(linkFor(c)).then(
			() => showToast(`Link for ${c.name} copied`),
			() => showToast('Could not copy link')
		);
	}

	async function addCharacter(e: Event) {
		e.preventDefault();
		errorMsg = '';
		if (!charName.trim()) return;
		const res = await fetch(`/c/${data.campaignId}/characters`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				name: charName,
				player_name: charPlayer,
				speed: charSpeed,
				init_bonus: charInit,
				max_hp: charHp,
				color: charColor
			})
		});
		if (!res.ok) return;
		const ch = (await res.json()) as CharacterRow;
		characters = [...characters, ch];
		charName = '';
		charPlayer = '';
		charSpeed = '30';
		charInit = '0';
		charHp = '';
		showRoster = true;
		showToast(`Created ${ch.name}`);
	}

	async function deleteCharacter(id: string) {
		await fetch(`/c/${data.campaignId}/characters/${id}`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ action: 'delete' })
		});
		characters = characters.filter((c) => c.id !== id);
	}

	async function addPlayerToBoard(characterId: string) {
		errorMsg = '';
		const res = await fetch(`/c/${data.campaignId}/combat/units`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ action: 'add-player', character_id: characterId })
		});
		if (!res.ok) errorMsg = 'Could not add to board';
	}

	async function addMonster(e: Event) {
		e.preventDefault();
		errorMsg = '';
		if (!monName.trim()) return;
		const res = await fetch(`/c/${data.campaignId}/monsters`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				name: monName,
				speed: monSpeed,
				init_bonus: monInit,
				max_hp: monHp,
				color: monColor
			})
		});
		if (!res.ok) return;
		const m = (await res.json()) as Monster;
		monsters = [...monsters, m];
		monName = '';
		monSpeed = '30';
		monInit = '0';
		monHp = '';
		showMonsters = true;
		showToast(`Created ${m.name}`);
	}

	function startEditMonster(m: Monster) {
		editingMonId = m.id;
		monName = m.name;
		monSpeed = String(m.speed);
		monInit = String(m.init_bonus);
		monHp = String(m.max_hp);
		monColor = m.color;
	}

	async function saveMonsterEdit(e: Event) {
		e.preventDefault();
		errorMsg = '';
		if (!editingMonId || !monName.trim()) return;
		const res = await fetch(`/c/${data.campaignId}/monsters/${editingMonId}`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				action: 'update',
				name: monName,
				speed: monSpeed,
				init_bonus: monInit,
				max_hp: monHp,
				color: monColor
			})
		});
		if (!res.ok) return;
		const updated = (await res.json()) as Monster;
		monsters = monsters.map((m) => (m.id === updated.id ? updated : m));
		cancelEditMonster();
		showToast('Saved');
	}

	function cancelEditMonster() {
		editingMonId = null;
		monName = '';
		monSpeed = '30';
		monInit = '0';
		monHp = '';
	}

	async function deleteMonster(id: string) {
		await fetch(`/c/${data.campaignId}/monsters/${id}`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ action: 'delete' })
		});
		monsters = monsters.filter((m) => m.id !== id);
	}

	async function spawnMonster(id: string, count: number) {
		errorMsg = '';
		const res = await fetch(`/c/${data.campaignId}/combat/units`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ action: 'add-monster', monster_id: id, count })
		});
		if (!res.ok) errorMsg = 'Could not add monsters';
		else showToast(`Added to board`);
	}

	function addEncounter(e: Event) {
		e.preventDefault();
		if (!encMonId) return;
		spawnMonster(encMonId, Math.floor(Number(encCount)) || 1);
	}

	async function addEnemy(e: Event) {
		e.preventDefault();
		errorMsg = '';
		if (!enemyName.trim()) return;
		const res = await fetch(`/c/${data.campaignId}/combat/units`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				action: 'add-enemy',
				name: enemyName,
				init_bonus: enemyInit,
				max_hp: enemyHp,
				color: enemyColor
			})
		});
		if (!res.ok) return;
		enemyName = '';
		enemyInit = '0';
		enemyHp = '';
	}

	function rollInitiative() {
		errorMsg = '';
		fetch(`/c/${data.campaignId}/initiative`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ action: 'roll' })
		});
	}

	function clearBoard() {
		errorMsg = '';
		fetch(`/c/${data.campaignId}/combat/units`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ action: 'clear' })
		});
		fetch(`/c/${data.campaignId}/combat/drawings`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ action: 'clear' })
		});
		showToast('Board cleared');
	}

	onMount(() => {
		const es = new EventSource(`/c/${data.campaignId}/events`);
		es.onopen = () => (connected = true);
		es.onerror = () => (connected = false);
		es.onmessage = (e) => {
			const ev = JSON.parse(e.data);
			switch (ev.type) {
				case 'initiative-updated': {
					initiative?.applyEntries(ev.entries, ev.round);
					const active = ev.entries.find((x: { active: number }) => x.active === 1)?.unit_id ?? null;
					board?.setActiveUnitId(active);
					activeName = ev.entries.find((x: { active: number }) => x.active === 1)?.name ?? '';
					round = ev.round;
					break;
				}
				case 'combat-units-updated':
					units = ev.units;
					board?.applyUnits(ev.units);
					break;
				case 'combat-log':
					combatLog?.add(ev.entry);
					break;
				case 'combat-drawings-updated':
					drawings = ev.drawings;
					board?.applyDrawings(ev.drawings);
					break;
				case 'board-config-updated':
					boardConfig = ev.config;
					board?.applyConfig(ev.config);
					break;
				case 'characters-updated':
					refreshCharacters();
					break;
				case 'monsters-updated':
					refreshMonsters();
					break;
				case 'title-changed':
					title = ev.title;
					break;
			}
		};
		return () => es.close();
	});

	function onKeydown(e: KeyboardEvent) {
		// N / Space advances the turn (DM only)
		if (e.key === 'n' || e.key === 'N' || e.key === ' ') {
			// ignore when typing in an input
			const tag = (e.target as HTMLElement)?.tagName;
			if (tag === 'INPUT' || tag === 'TEXTAREA') return;
			e.preventDefault();
			initiative?.advance();
		}
	}

	async function refreshCharacters() {
		const res = await fetch(`/c/${data.campaignId}/characters`);
		if (res.ok) characters = await res.json();
	}

	async function refreshMonsters() {
		const res = await fetch(`/c/${data.campaignId}/monsters`);
		if (res.ok) monsters = await res.json();
	}
</script>

<svelte:head><title>{title} — Combat</title></svelte:head>

<svelte:window onkeydown={onKeydown} />

<header class="bar">
	<a href="/" class="back">←</a>
	<span class="conn" class:on={connected} title={connected ? 'Realtime connected' : 'Realtime disconnected'}></span>
	<h1>{title}</h1>
	<nav class="tabs">
		<a href={`/c/${data.campaignId}`} class="tab">Notes</a>
		<a href={`/c/${data.campaignId}/combat`} class="tab" class:active={true}>Combat</a>
	</nav>
	<div class="spacer"></div>
	<button type="button" class:on={showRoster} onclick={() => (showRoster = !showRoster)}>Characters</button>
	<button type="button" class:on={showMonsters} onclick={() => (showMonsters = !showMonsters)}>Monsters</button>
	<a href={`/c/${data.campaignId}/play/combat`} target="_blank" rel="noreferrer">Spectate</a>
	<form method="POST" action="/logout" class="logout">
		<button type="submit" title="Log out as DM">Log out</button>
	</form>
</header>

<main class="combat">
	{#if showRoster}
		<section class="panel roster">
			<h2>Characters</h2>
			<form class="add-char" onsubmit={addCharacter}>
				<input class="nm" placeholder="Character" bind:value={charName} maxlength="60" />
				<input class="pn" placeholder="Player name" bind:value={charPlayer} maxlength="60" />
				<input class="num" placeholder="Speed" title="Speed (ft)" bind:value={charSpeed} maxlength="4" />
				<input class="num" placeholder="Init+" title="Init bonus" bind:value={charInit} maxlength="4" />
				<input class="num" placeholder="Max HP" bind:value={charHp} maxlength="6" />
				<input class="color" type="color" bind:value={charColor} title="Token color" />
				<button type="submit">Add</button>
			</form>
			{#if characters.length === 0}
				<p class="empty">No characters yet. Create one, then send them their link.</p>
			{/if}
			<ul class="char-list">
				{#each characters as c (c.id)}
					<li>
						<span class="dot" style="background:{c.color}"></span>
						<span class="cname">{c.name}</span>
						<span class="cmeta">{c.player_name ? c.player_name + ' · ' : ''}{c.speed}ft · init {c.init_bonus >= 0 ? '+' : ''}{c.init_bonus} · {c.hp}/{c.max_hp}hp</span>
						<button type="button" class="tiny" title="Add to board" aria-label="Add to board" onclick={() => addPlayerToBoard(c.id)}>⚔</button>
						<button type="button" class="tiny" title="Copy player link" aria-label="Copy player link" onclick={() => copyLink(c)}>🔗</button>
						<button type="button" class="tiny" title="Delete" aria-label="Delete" onclick={() => deleteCharacter(c.id)}>✕</button>
					</li>
				{/each}
			</ul>
		</section>
	{/if}

	{#if showMonsters}
		<section class="panel monsters">
			<h2>Monsters</h2>
			<form class="add-char" onsubmit={editingMonId ? saveMonsterEdit : addMonster}>
				<input class="nm" placeholder="Monster name" bind:value={monName} maxlength="60" />
				<input class="num" placeholder="Speed" title="Speed (ft)" bind:value={monSpeed} maxlength="4" />
				<input class="num" placeholder="Init+" title="Init bonus" bind:value={monInit} maxlength="4" />
				<input class="num" placeholder="Max HP" bind:value={monHp} maxlength="6" />
				<input class="color" type="color" bind:value={monColor} title="Token color" />
				{#if editingMonId}
					<button type="submit">Save</button>
					<button type="button" onclick={cancelEditMonster}>Cancel</button>
				{:else}
					<button type="submit">Add</button>
				{/if}
			</form>
			{#if monsters.length === 0}
				<p class="empty">No monsters yet. Add reusable monster templates, then drop them into encounters.</p>
			{/if}
			<ul class="char-list">
				{#each monsters as m (m.id)}
					<li>
						<span class="dot" style="background:{m.color}"></span>
						<span class="cname">{m.name}</span>
						<span class="cmeta">{m.speed}ft · init {m.init_bonus >= 0 ? '+' : ''}{m.init_bonus} · {m.max_hp}hp</span>
						<button type="button" class="tiny" title="Add to board" aria-label="Add to board" onclick={() => spawnMonster(m.id, 1)}>⚔</button>
						<button type="button" class="tiny" title="Edit" aria-label="Edit" onclick={() => startEditMonster(m)}>✎</button>
						<button type="button" class="tiny" title="Delete" aria-label="Delete" onclick={() => deleteMonster(m.id)}>✕</button>
					</li>
				{/each}
			</ul>
		</section>
	{/if}

	<section class="panel board">
		{#if activeName}
			<div class="turn-status">Round <b>{round}</b> · {activeName}'s turn <kbd>N</kbd></div>
		{/if}
		<CombatBoard
			bind:this={board}
			campaignId={data.campaignId}
			dm
			initialUnits={units}
			initialDrawings={drawings}
			initialConfig={boardConfig}
			activeUnitId={data.activeUnitId}
		/>
	</section>

	<section class="panel setup">
		<button type="button" class="big" onclick={rollInitiative}>🎲 Roll initiative</button>
		<form class="add-encounter" onsubmit={addEncounter}>
			<select class="nm enc-select" bind:value={encMonId} aria-label="Monster to add">
				<option value="">Pick monster…</option>
				{#each monsters as m (m.id)}
					<option value={m.id}>{m.name}</option>
				{/each}
			</select>
			<input class="num" placeholder="Count" title="How many" bind:value={encCount} maxlength="2" />
			<button type="submit">Add encounter</button>
		</form>
		<form class="add-enemy" onsubmit={addEnemy}>
			<input class="nm" placeholder="Enemy name" bind:value={enemyName} maxlength="60" />
			<input class="num" placeholder="Init+" bind:value={enemyInit} maxlength="4" />
			<input class="num" placeholder="HP" bind:value={enemyHp} maxlength="6" />
			<input class="color" type="color" bind:value={enemyColor} title="Enemy color" />
			<button type="submit">Add enemy</button>
		</form>
		<button type="button" class="big danger" onclick={clearBoard}>🗑 Clear board</button>
	</section>

	{#if errorMsg}<p class="error">{errorMsg}</p>{/if}

	<section class="panel order">
		<Initiative
			bind:this={initiative}
			campaignId={data.campaignId}
			dm
			initial={data.initiative}
			initialRound={data.initiativeRound}
			units={units}
		/>
	</section>

	<section class="panel log">
		<CombatLog bind:this={combatLog} initial={data.logs} />
	</section>
</main>

{#if toast}<div class="toast">{toast}</div>{/if}

<style>
	.bar {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.6rem 1rem;
		background: var(--parchment-light);
		border-bottom: 2px solid var(--rule);
		font-family: system-ui, sans-serif;
	}
	.bar h1 {
		font-family: var(--font-display);
		font-size: 1.1rem;
		margin: 0;
		color: var(--accent);
	}
	.back {
		text-decoration: none;
		font-size: 1.2rem;
		color: var(--ink-soft);
	}
	.spacer {
		flex: 1;
	}
	.tabs {
		display: inline-flex;
		gap: 0.25rem;
		margin-left: 0.5rem;
	}
	.tab {
		text-decoration: none;
		font-size: 0.85rem;
		padding: 0.35rem 0.7rem;
		border: 1px solid var(--rule);
		border-radius: 6px;
		color: var(--ink-soft);
		background: var(--parchment-light);
	}
	.tab.active {
		color: var(--accent);
		border-color: var(--gold);
		background: var(--parchment-deep);
	}
	.conn {
		width: 0.6rem;
		height: 0.6rem;
		border-radius: 50%;
		background: transparent;
		border: 1.5px solid #c33;
		flex: none;
	}
	.conn.on {
		background: #3a9b45;
		border-color: #3a9b45;
	}
	.bar button,
	.bar a[target] {
		font-size: 0.85rem;
		padding: 0.4rem 0.7rem;
		border: 1px solid var(--rule);
		border-radius: 6px;
		background: var(--parchment-light);
		cursor: pointer;
		text-decoration: none;
		color: var(--ink-soft);
	}
	.bar button.on {
		color: var(--accent);
		border-color: var(--gold);
		background: var(--parchment-deep);
	}
	.logout {
		margin: 0;
	}
	.logout button {
		border: 1px solid var(--accent-soft);
		color: var(--accent-soft);
	}
	.combat {
		max-width: 68rem;
		margin: 1rem auto;
		padding: 0 1rem;
	}
	.panel {
		background: var(--parchment-light);
		border: 1px solid var(--rule);
		border-radius: 8px;
		padding: 0.9rem;
		margin-bottom: 1rem;
	}
	.panel h2 {
		font-family: var(--font-display);
		color: var(--accent);
		margin: 0 0 0.6rem;
		font-size: 1rem;
	}
	.turn-status {
		font-family: var(--font-display);
		font-size: 0.95rem;
		font-weight: 600;
		color: var(--ink);
		margin-bottom: 0.6rem;
		padding: 0.4rem 0.7rem;
		background: var(--parchment-deep);
		border: 1px solid var(--gold);
		border-radius: 6px;
		display: inline-block;
	}
	.turn-status kbd {
		font-family: inherit;
		font-size: 0.7rem;
		color: var(--ink-soft);
		border: 1px solid var(--rule);
		border-radius: 4px;
		padding: 0.05rem 0.35rem;
		margin-left: 0.4rem;
		background: var(--parchment-light);
	}
	.add-char,
	.add-enemy,
	.add-encounter {
		display: flex;
		gap: 0.35rem;
		flex-wrap: wrap;
		margin-bottom: 0.6rem;
	}
	.add-char input,
	.add-enemy input,
	.add-encounter input,
	.add-encounter select {
		border: 1px solid var(--rule);
		border-radius: 5px;
		padding: 0.3rem 0.4rem;
		font-size: 0.85rem;
		min-width: 0;
		background: var(--parchment-deep);
		color: var(--ink);
	}
	.add-char .nm,
	.add-enemy .nm,
	.add-encounter .nm {
		flex: 1 1 10rem;
	}
	.add-char .pn {
		flex: 1 1 8rem;
	}
	.add-char .num,
	.add-enemy .num,
	.add-encounter .num {
		width: 3.4rem;
	}
	.add-encounter .enc-select {
		flex: 1 1 10rem;
	}
	.add-char input.color,
	.add-enemy input.color,
	.add-encounter input.color {
		width: 2.4rem;
		padding: 0.1rem;
	}
	.add-char button,
	.add-enemy button,
	.add-encounter button {
		border: 0;
		background: var(--accent);
		color: var(--parchment-light);
		border-radius: 5px;
		padding: 0.3rem 0.7rem;
		cursor: pointer;
	}
	.empty {
		color: var(--ink-soft);
		font-style: italic;
		font-size: 0.9rem;
	}
	.char-list {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.char-list li {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.3rem 0;
		border-top: 1px solid var(--rule);
	}
	.char-list .dot {
		width: 0.9rem;
		height: 0.9rem;
		border-radius: 50%;
		flex: none;
	}
	.char-list .cname {
		font-weight: 600;
		min-width: 6rem;
	}
	.char-list .cmeta {
		flex: 1;
		color: var(--ink-soft);
		font-size: 0.8rem;
	}
	.tiny {
		border: 1px solid var(--rule);
		background: var(--parchment-light);
		border-radius: 4px;
		cursor: pointer;
		padding: 0.1rem 0.3rem;
		font-size: 0.8rem;
	}
	.setup {
		display: flex;
		gap: 0.6rem;
		align-items: center;
		flex-wrap: wrap;
	}
	.big {
		border: 0;
		background: var(--accent);
		color: var(--parchment-light);
		border-radius: 6px;
		padding: 0.5rem 0.9rem;
		cursor: pointer;
		font-family: var(--font-display);
		font-weight: 600;
	}
	.big.danger {
		background: var(--accent-soft);
	}
	.add-enemy {
		margin: 0;
		flex: 1;
	}
	.error {
		color: var(--danger);
		font-size: 0.9rem;
	}
	.toast {
		position: fixed;
		right: 1.25rem;
		bottom: 1.25rem;
		z-index: 2000;
		padding: 0.6rem 1rem;
		background: var(--parchment-light);
		border: 1px solid var(--gold);
		border-left: 4px solid #3a9b45;
		border-radius: 6px;
		box-shadow: var(--shadow-lg);
		font-family: var(--font-body);
		color: var(--ink);
	}
</style>
