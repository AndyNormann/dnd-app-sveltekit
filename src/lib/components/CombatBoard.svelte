<script lang="ts">
	import { onMount } from 'svelte';
	import type { CombatUnit, CombatDrawing, BoardConfig } from '$lib/server/db';
	import { rollDice } from '$lib/dice';
	import { clampToBudget, moveBudget, moveCost, isOwnTurn } from '$lib/combatRules';

	let {
		campaignId,
		dm = false,
		characterId = null,
		initialUnits = [],
		initialDrawings = [],
		initialConfig,
		activeUnitId = null,
		onClearBoard = null
	}: {
		campaignId: string;
		dm?: boolean;
		characterId?: string | null;
		initialUnits?: CombatUnit[];
		initialDrawings?: CombatDrawing[];
		initialConfig: BoardConfig;
		activeUnitId?: string | null;
		onClearBoard?: (() => void) | null;
	} = $props();

	const CELL = 40;
	const COLORS = ['#f0c040', '#e74c3c', '#3498db', '#2ecc71', '#9b59b6', '#e67e22', '#95a5a6'];

	let units = $state<CombatUnit[]>(initialUnits);
	let drawings = $state<CombatDrawing[]>(initialDrawings);
	let config = $state<BoardConfig>(initialConfig);
	let tool = $state<'draw' | 'erase' | 'measure' | 'dmg' | 'ping'>(dm ? 'draw' : 'measure');
	let color = $state('#f0c040');
	let errorMsg = $state('');
	let selectedId = $state<string | null>(null);
	let hpAmount = $state('');
	let dmgError = $state('');
	let pings = $state<{ id: string; x: number; y: number; color: string; name: string }[]>([]);
	const PING_MS = 2000;
	// attack helper + conditions (DM popover)
	let atkBonus = $state('0');
	let atkAc = $state('15');
	let dmgDice = $state('1d8');
	let condText = $state('');
	let condErr = $state('');
	const COND_PRESETS = [
		'Concentrating',
		'Prone',
		'Grappled',
		'Stunned',
		'Restrained',
		'Blinded'
	];
	const COND_COLORS: Record<string, string> = {
		Concentrating: '#d68910',
		Prone: '#8e44ad',
		Grappled: '#c0392b',
		Stunned: '#e67e22',
		Restrained: '#7f8c8d',
		Blinded: '#2c3e50',
		Poisoned: '#27ae60',
		Frightened: '#2980b9'
	};

	let canvas: HTMLCanvasElement | undefined = $state();
	let measureCanvas: HTMLCanvasElement | undefined = $state();
	let boardEl: HTMLDivElement | undefined = $state();
	let viewportEl: HTMLDivElement | undefined = $state();
	let zoom = $state(
		typeof localStorage !== 'undefined' ? (parseFloat(localStorage.getItem('dnd-board-zoom') || '') || 1) : 1
	); // board zoom for small screens (layout-affecting CSS `zoom`)

	function clampZoom(z: number) {
		zoom = Math.max(0.3, Math.min(3, Math.round(z * 100) / 100));
		try {
			localStorage.setItem('dnd-board-zoom', String(zoom));
		} catch {}
	}
	function fitZoom() {
		if (!viewportEl) return;
		const fit = (viewportEl.clientWidth - 8) / (config.grid_cols * CELL);
		clampZoom(fit < 1 ? fit : 1);
	}
	function undoLastStroke() {
		// optimistic local remove (SSE reconciles with the server list)
		drawings = drawings.slice(0, -1);
		fetch(`/c/${campaignId}/combat/drawings`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ action: 'undo' })
		});
	}

	let drawing = $state(false);
	let currentPoints: [number, number][] = [];
	let measureStart: [number, number] | null = null;
	let measureEnd: [number, number] | null = null;

	let draggingId: string | null = null;
	let dragTemp = $state<Record<string, { x: number; y: number }>>({});
	let dragStart = $state<{ x: number; y: number } | null>(null);
	let grabOffset = $state<{ x: number; y: number } | null>(null);
	let dragCost = $state<number | null>(null);
	let activeId = $state<string | null>(activeUnitId);
	// floating HP chips + baseline for delta detection
	let floating = $state<Record<string, { delta: number; x: number; y: number; key: number }>>({});
	const prevHp = new Map<string, number>(initialUnits.map((u) => [u.id, u.hp]));

	const myUnit = $derived(units.find((u) => u.character_id === characterId) ?? null);
	const isMyTurn = $derived(isOwnTurn(myUnit?.id, activeId));

	export function setActiveUnitId(id: string | null) {
		activeId = id;
	}
	const budgetCells = $derived(myUnit ? moveBudget(myUnit.speed, config.grid_scale || 5) : 0);
	const usedCells = $derived(myUnit ? myUnit.movement_used : 0);

	export function applyUnits(next: CombatUnit[]) {
		units = next;
		dragTemp = {};
		// float a chip on any HP change (local apply, SSE, or another client)
		for (const u of next) {
			const prev = prevHp.get(u.id);
			if (prev != null && prev !== u.hp) {
				const delta = u.hp - prev;
				const key = Date.now() + Math.random();
				floating = { ...floating, [u.id]: { delta, x: u.x, y: u.y, key } };
				setTimeout(() => {
					floating = Object.fromEntries(
						Object.entries(floating).filter(([, v]) => v.key !== key)
					);
				}, 1400);
			}
			prevHp.set(u.id, u.hp);
		}
	}
	export function applyDrawings(next: CombatDrawing[]) {
		drawings = next;
	}
	export function applyConfig(next: BoardConfig) {
		config = next;
	}

	/** Show a transient ping marker on the board (from the DM or a player). */
	export function applyPing(ping: { id: string; x: number; y: number; color: string; name: string }) {
		if (pings.some((p) => p.id === ping.id)) return;
		pings = [...pings, ping];
		setTimeout(() => {
			pings = pings.filter((p) => p.id !== ping.id);
		}, PING_MS);
	}

	async function sendPing(x: number, y: number) {
		await fetch(`/c/${campaignId}/combat/ping`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ x, y })
		});
	}

	function toCell(e: { clientX: number; clientY: number }): [number, number] {
		const rect = boardEl?.getBoundingClientRect();
		if (!rect) return [0, 0];
		// derive cell size from the live rect so it stays correct at any zoom/scale
		return [
			(e.clientX - rect.left) / (rect.width / config.grid_cols),
			(e.clientY - rect.top) / (rect.height / config.grid_rows)
		];
	}

	function boardTheme() {
	// board colours follow the active theme's CSS vars
	const cs = getComputedStyle(document.documentElement);
	return {
		bg: cs.getPropertyValue('--board-bg').trim() || '#222222',
		grid: cs.getPropertyValue('--board-grid').trim() || 'rgba(255,255,255,0.08)'
	};
}

	function redraw() {
		const ctx = canvas?.getContext('2d');
		if (!ctx || !canvas) return;
		const cols = config.grid_cols;
		const rows = config.grid_rows;
		canvas.width = cols * CELL;
		canvas.height = rows * CELL;
		ctx.clearRect(0, 0, canvas.width, canvas.height);
		const th = boardTheme();
		ctx.fillStyle = th.bg;
		ctx.fillRect(0, 0, canvas.width, canvas.height);
		for (const d of drawings) {
			ctx.strokeStyle = d.mode === 'erase' ? th.bg : d.color;
			ctx.fillStyle = d.mode === 'erase' ? th.bg : d.color;
			ctx.lineWidth = d.width;
			ctx.lineCap = 'round';
			ctx.lineJoin = 'round';
			if (d.points.length === 1) {
				ctx.beginPath();
				ctx.arc(d.points[0][0] * CELL, d.points[0][1] * CELL, d.width, 0, Math.PI * 2);
				ctx.fill();
				continue;
			}
			ctx.beginPath();
			d.points.forEach(([x, y], i) => {
				if (i === 0) ctx.moveTo(x * CELL, y * CELL);
				else ctx.lineTo(x * CELL, y * CELL);
			});
			ctx.stroke();
		}
		ctx.strokeStyle = th.grid;
		ctx.lineWidth = 1;
		for (let i = 0; i <= cols; i++) {
			ctx.beginPath();
			ctx.moveTo(i * CELL + 0.5, 0);
			ctx.lineTo(i * CELL + 0.5, rows * CELL);
			ctx.stroke();
		}
		for (let j = 0; j <= rows; j++) {
			ctx.beginPath();
			ctx.moveTo(0, j * CELL + 0.5);
			ctx.lineTo(cols * CELL, j * CELL + 0.5);
			ctx.stroke();
		}
	}

	function redrawMeasure() {
		const ctx = measureCanvas?.getContext('2d');
		if (!ctx || !measureCanvas) return;
		const cols = config.grid_cols;
		const rows = config.grid_rows;
		measureCanvas.width = cols * CELL;
		measureCanvas.height = rows * CELL;
		ctx.clearRect(0, 0, measureCanvas.width, measureCanvas.height);
		if (!measureStart || !measureEnd) return;
		const [ax, ay] = measureStart;
		const [bx, by] = measureEnd;
		const cells = Math.hypot(bx - ax, by - ay);
		const feet = Math.round(cells * config.grid_scale);
		ctx.strokeStyle = '#c0392b';
		ctx.lineWidth = 2;
		ctx.setLineDash([5, 4]);
		ctx.beginPath();
		ctx.moveTo(ax * CELL + CELL / 2, ay * CELL + CELL / 2);
		ctx.lineTo(bx * CELL + CELL / 2, by * CELL + CELL / 2);
		ctx.stroke();
		ctx.setLineDash([]);
		ctx.font = '12px system-ui, sans-serif';
		ctx.fillStyle = '#c0392b';
		const mx = ((ax + bx) / 2) * CELL;
		const my = ((ay + by) / 2) * CELL;
		ctx.fillText(`${feet} ft · ${cells.toFixed(1)} cells`, mx + 6, my - 6);
	}

	let rafRedraw = 0;
	let rafMeasure = 0;
	/** Coalesce full board repaints to one per animation frame (measure / draw / drag). */
	function scheduleRedraw() {
		if (rafRedraw) return;
		rafRedraw = requestAnimationFrame(() => {
			rafRedraw = 0;
			redraw();
		});
	}
	function scheduleRedrawMeasure() {
		if (rafMeasure) return;
		rafMeasure = requestAnimationFrame(() => {
			rafMeasure = 0;
			redrawMeasure();
		});
	}

	$effect(() => {
		scheduleRedraw();
		scheduleRedrawMeasure();
	});

	onMount(() => {
		if (!localStorage.getItem('dnd-board-zoom')) fitZoom();
	});

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') selectedId = null;
	}

	function onPointerDown(e: PointerEvent) {
		const pos = toCell(e);
		if (tool === 'ping') {
			// free-floating: ping anywhere, in board pixel coordinates (not grid-snapped)
			const r = canvas?.getBoundingClientRect();
			sendPing(e.clientX - (r?.left ?? 0), e.clientY - (r?.top ?? 0));
			return;
		}
		if (tool === 'dmg') {
			// clicking empty board clears the selection
			selectedId = null;
			return;
		}
		if (tool === 'measure') {
			measureStart = pos;
			measureEnd = pos;
			scheduleRedrawMeasure();
			return;
		}
		if (dm && (tool === 'draw' || tool === 'erase')) {
			drawing = true;
			currentPoints = [pos];
			scheduleRedraw();
			e.preventDefault();
		}
	}
	function onPointerMove(e: PointerEvent) {
		const pos = toCell(e);
		if (drawing) {
			currentPoints.push(pos);
			// live draw current stroke
			const ctx = canvas?.getContext('2d');
			if (ctx && currentPoints.length > 1) {
				ctx.strokeStyle = tool === 'erase' ? boardTheme().bg : color;
				ctx.lineWidth = 4;
				ctx.lineCap = 'round';
				ctx.lineJoin = 'round';
				ctx.beginPath();
				currentPoints.forEach(([x, y], i) => {
					if (i === 0) ctx.moveTo(x * CELL, y * CELL);
					else ctx.lineTo(x * CELL, y * CELL);
				});
				ctx.stroke();
			}
		} else if (measureStart) {
			measureEnd = pos;
			scheduleRedrawMeasure();
		}
	}
	function onPointerUp() {
		if (drawing) {
			if (currentPoints.length >= 1 && (tool === 'draw' || tool === 'erase')) {
				postStroke(tool, currentPoints);
				// Optimistically keep the finished stroke visible: redraw() paints from
				// `drawings`, which only updates after the SSE round-trip, so without this
				// the stroke vanishes until the next stroke triggers a repaint.
				drawings = [
					...drawings,
					{
						id: `local-${Date.now()}-${currentPoints.length}`,
						campaign_id: campaignId,
						color,
						width: 4,
						mode: tool,
						points: currentPoints,
						created_at: Date.now()
					}
				];
			}
			drawing = false;
			currentPoints = [];
			scheduleRedraw();
		} else if (measureStart) {
			measureStart = null;
			measureEnd = null;
			scheduleRedrawMeasure();
		}
	}

	async function applyHpDelta(delta: number) {
			const id = selectedId;
			if (!id) return;
			dmgError = '';
			const res = await fetch(`/c/${campaignId}/combat/units/${id}`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'hp', hp: (unitById(id)?.hp ?? 0) + delta })
			});
			if (!res.ok) dmgError = 'Could not apply';
		}
	function unitById(id: string) {
		return units.find((u) => u.id === id) ?? null;
	}
	function conditionsList(u: CombatUnit): string[] {
		return (u.conditions ?? '')
			.split(',')
			.map((s) => s.trim())
			.filter(Boolean);
	}
	function condColor(name: string) {
		return COND_COLORS[name] ?? '#5d6d7e';
	}
	async function applyHpSet() {
		const id = selectedId;
		const n = parseInt(hpAmount, 10);
		if (!id || isNaN(n)) return;
		dmgError = '';
		const res = await fetch(`/c/${campaignId}/combat/units/${id}`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ action: 'hp', hp: n })
		});
		if (!res.ok) dmgError = 'Could not apply';
		hpAmount = '';
	}

	async function rollAttack() {
		const id = selectedId;
		if (!id) return;
		const unit = unitById(id);
		if (!unit) return;
		dmgError = '';
		const bonus = parseInt(atkBonus, 10) || 0;
		const ac = parseInt(atkAc, 10) || 10;
		const die = rollDice('1d20');
		if (!die) return;
		const raw = die.total; // 1..20
		const total = raw + bonus;
		let outcome = total >= ac ? 'Hit' : 'Miss';
		if (raw === 20) outcome = 'Crit';
		else if (raw === 1) outcome = 'Fumble';
		const note = raw === 20 ? ' (nat 20)' : raw === 1 ? ' (nat 1)' : '';
		const res = await fetch(`/c/${campaignId}/combat/log`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ text: `${unit.name} attacks → ${total} vs AC ${ac} — ${outcome}${note}` })
		});
		if (!res.ok) dmgError = 'Could not log attack';
	}

	async function rollDamage() {
		const id = selectedId;
		if (!id) return;
		const unit = unitById(id);
		if (!unit) return;
		dmgError = '';
		const r = rollDice(dmgDice.trim() || '1d8');
		if (!r) {
			dmgError = 'Invalid damage dice';
			return;
		}
		const res = await fetch(`/c/${campaignId}/combat/units/${id}`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ action: 'hp', hp: (unit.hp ?? 0) - r.total })
		});
		if (!res.ok) dmgError = 'Could not apply damage';
	}

	function toggleCond(name: string) {
		const cur = condText.split(',').map((s) => s.trim()).filter(Boolean);
		condText = (cur.includes(name) ? cur.filter((c) => c !== name) : [...cur, name]).join(', ');
	}

	async function saveConditions() {
		const id = selectedId;
		if (!id) return;
		condErr = '';
		const conds = condText.split(',').map((s) => s.trim()).filter(Boolean);
		const res = await fetch(`/c/${campaignId}/combat/units/${id}`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ action: 'conditions', conditions: conds.join(',') })
		});
		if (!res.ok) condErr = 'Could not save conditions';
	}

	async function postStroke(mode: 'draw' | 'erase', points: [number, number][]) {
		errorMsg = '';
		const res = await fetch(`/c/${campaignId}/combat/drawings`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ color, width: 4, mode, points })
		});
		if (!res.ok) errorMsg = 'Could not save drawing';
	}

	function tokenPos(u: CombatUnit) {
		const t = dragTemp[u.id];
		return t ?? { x: u.x, y: u.y };
	}

	function startDrag(u: CombatUnit) {
		return (e: MouseEvent) => {
			e.preventDefault();
			e.stopPropagation();
			if (tool === 'ping') return; // ping tool: no dragging
			if (tool === 'dmg') {
				// damage tool: select the token (players only their own), don't drag
				if (!dm && u.id !== myUnit?.id) return;
				const selecting = selectedId !== u.id;
				selectedId = selecting ? u.id : null;
				hpAmount = '';
				dmgError = '';
				condText = selecting ? conditionsList(u).join(', ') : '';
				return;
			}
			if (dm) {
				draggingId = u.id;
			} else {
				if (u.id !== myUnit?.id) return;
				if (!isMyTurn) {
					errorMsg = "It isn't your turn yet.";
					return;
				}
				draggingId = u.id;
			}
			dragStart = { x: u.x, y: u.y };
			const r = boardEl?.getBoundingClientRect();
			const cw = (r?.width ?? config.grid_cols * CELL) / config.grid_cols;
			const ch = (r?.height ?? config.grid_rows * CELL) / config.grid_rows;
			// grab offset in cells (zoom-proof), so the token doesn't jump on grab
			grabOffset = {
				x: (e.clientX - (r?.left ?? 0)) / cw - u.x,
				y: (e.clientY - (r?.top ?? 0)) / ch - u.y
			};
			dragCost = null;
			errorMsg = '';
			// keep the token exactly where it is when grabbed (no jump), then snap as it moves
			dragTemp = { ...dragTemp, [u.id]: { x: u.x, y: u.y } };
			window.addEventListener('mousemove', onDragMove);
			window.addEventListener('mouseup', onDragEnd);
		};
	}

	function onDragMove(e: MouseEvent) {
		if (!draggingId || !dragStart || !grabOffset) return;
		const c = toCell(e);
		let cell = {
			x: Math.max(0, Math.min(config.grid_cols - 1, Math.round(c[0] - grabOffset.x))),
			y: Math.max(0, Math.min(config.grid_rows - 1, Math.round(c[1] - grabOffset.y)))
		};
		if (!dm) {
			// player: clamp to the speed budget and report cost/remaining live
			const allowed = Math.max(0, budgetCells - usedCells);
			const cost = moveCost(cell, dragStart);
			if (cost > allowed) cell = clampToBudget(cell, dragStart, allowed, { cols: config.grid_cols, rows: config.grid_rows });
			dragCost = moveCost(cell, dragStart);
		}
		dragTemp = { ...dragTemp, [draggingId]: cell };
	}

	async function onDragEnd() {
		const id = draggingId;
		draggingId = null;
		dragStart = null;
		grabOffset = null;
		dragCost = null;
		window.removeEventListener('mousemove', onDragMove);
		window.removeEventListener('mouseup', onDragEnd);
		if (id === null) return;
		const cell = dragTemp[id];
		if (!cell) {
			dragTemp = {};
			return;
		}
		const unit = units.find((x) => x.id === id);
		if (!unit) {
			dragTemp = {};
			return;
		}
		if (!dm) {
			const cost = moveCost(cell, unit);
			if (usedCells + cost > budgetCells) {
				errorMsg = `Movement limit reached (max ${budgetCells} cells this turn)`;
				dragTemp = {};
				return;
			}
		}
		errorMsg = '';
		const res = await fetch(`/c/${campaignId}/combat/units/${id}`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ action: 'move', x: cell.x, y: cell.y })
		});
		if (!res.ok) {
			if (res.status === 409) errorMsg = 'Movement limit reached';
			else if (res.status === 401) errorMsg = 'Not your turn';
			else errorMsg = 'Move failed';
			dragTemp = {};
		} else {
			// keep the local budget accurate even if the SSE units broadcast hasn't landed yet
			const body = (await res.json().catch(() => ({}))) as { used?: number };
			if (typeof body.used === 'number') {
				const used = body.used;
				units = units.map((u) => (u.id === id ? { ...u, movement_used: used } : u));
			}
			dragTemp = {};
		}
	}
</script>

<svelte:window onkeydown={onKeydown} />

<div class="board-wrap">
	{#if dm}
		<div class="toolbar">
			<button type="button" class:on={tool === 'draw'} onclick={() => (tool = 'draw')}>✏️ Draw</button>
			<button type="button" class:on={tool === 'erase'} onclick={() => (tool = 'erase')}>🧽 Erase</button>
			<button type="button" class:on={tool === 'measure'} onclick={() => (tool = 'measure')}>📏 Measure</button>
			<button type="button" class:on={tool === 'dmg'} onclick={() => (tool = 'dmg')}>💔 HP</button>
			<button type="button" class:on={tool === 'ping'} onclick={() => (tool = 'ping')}>📌 Ping</button>
			<button type="button" onclick={undoLastStroke}>↩ Undo</button>
			{#if onClearBoard}
				<button type="button" class="danger" onclick={onClearBoard}>🗑 Clear board</button>
			{/if}
			<span class="colors">
				{#each COLORS as c}
					<button
						type="button"
						class="swatch"
						class:sel={color === c}
						style="background:{c}"
						onclick={() => {
							color = c;
							if (tool !== 'measure') tool = tool === 'erase' ? 'erase' : 'draw';
						}}
						aria-label={c}
					></button>
				{/each}
			</span>
		</div>
	{:else}
		<div class="toolbar">
			<button type="button" class:on={tool === 'measure'} onclick={() => (tool = 'measure')}>📏 Measure</button>
			<button type="button" class:on={tool === 'dmg'} onclick={() => (tool = 'dmg')}>💔 HP</button>
			<button type="button" class:on={tool === 'ping'} onclick={() => (tool = 'ping')}>📌 Ping</button>
			{#if myUnit}
				<span class="budget"
					>Turn: <b>{myUnit.name}</b> · moved {Math.min(usedCells, budgetCells)}/{budgetCells} cells</span
				>
			{/if}
		</div>
	{/if}

	<div class="zoombar">
		<button type="button" onclick={() => clampZoom(zoom - 0.25)} aria-label="Zoom out">−</button>
		<span class="zval">{Math.round(zoom * 100)}%</span>
		<button type="button" onclick={() => clampZoom(zoom + 0.25)} aria-label="Zoom in">+</button>
		<button type="button" onclick={fitZoom} aria-label="Fit board to width">Fit</button>
	</div>
	<div class="board-viewport" bind:this={viewportEl}>
	<div
		class="board"
		bind:this={boardEl}
		style="width:{config.grid_cols * CELL}px;height:{config.grid_rows * CELL}px;zoom:{zoom}"
		onpointerdown={onPointerDown}
		onpointermove={onPointerMove}
		onpointerup={onPointerUp}
		onpointerleave={onPointerUp}
	>
		<canvas class="grid" bind:this={canvas}></canvas>
		<canvas class="measure" bind:this={measureCanvas}></canvas>
		{#each units as u (u.id)}
			{@const pos = tokenPos(u)}
			<div
				class="token"
				class:player={u.kind === 'player'}
				class:myturn={u.id === myUnit?.id}
				class:active={u.id === activeId}
				class:dead={u.alive === 0}
				class:sel={u.id === selectedId}
				style="left:{pos.x * CELL}px;top:{pos.y * CELL}px"
				onmousedown={startDrag(u)}
				onpointerdown={(e) => e.stopPropagation()}
				title={u.name}
			>
				<span class="dot" style="background:{u.color}"></span>
				{#if u.alive === 0}<span class="skull">💀</span>{/if}
				<span class="label">{u.name}</span>
				{#if dm || u.id === myUnit?.id}<span class="hp">{u.hp}{u.max_hp ? `/${u.max_hp}` : ''}</span>{/if}
				{#each conditionsList(u) as c, i}
					<span class="cond" style="--cc:{condColor(c)}; bottom: calc(1.2rem + {i} * 1.05rem)">{c}</span>
				{/each}
			</div>
		{/each}
		{#each pings as p (p.id)}
			<div
				class="ping"
				style="left:{p.x}px;top:{p.y}px;--pc:{p.color}"
				title="{p.name} is here"
			>
				<span class="ring"></span>
				<span class="lbl">{p.name}</span>
			</div>
		{/each}
		{#if draggingId && dragTemp[draggingId]}
			{@const d = dragTemp[draggingId]}
			<div class="snap-hl" style="left:{d.x * CELL}px;top:{d.y * CELL}px"></div>
		{/if}
		{#if !dm && draggingId && dragCost != null && dragTemp[draggingId]}
			{@const d = dragTemp[draggingId]}
			{@const rem = Math.max(0, budgetCells - usedCells - dragCost)}
			<div class="drag-feedback" style="left:{d.x * CELL + 4}px;top:{d.y * CELL + 40}px">
				−{dragCost} cell{dragCost === 1 ? '' : 's'} · {rem} left
			</div>
		{/if}
		{#each Object.entries(floating) as [id, f]}
			<div
				class="floating"
				class:heal={f.delta > 0}
				class:down={f.delta < 0}
				style="left:{f.x * CELL + 20}px;top:{f.y * CELL - 2}px"
			>
				{f.delta > 0 ? '+' + f.delta : f.delta}
			</div>
		{/each}
		{#if selectedId && tool === 'dmg'}
			{@const su = unitById(selectedId)}
			{#if su}
				{@const px = Math.max(0, Math.min(config.grid_cols * CELL - 150, su.x * CELL + 44))}
				{@const popH = 170}
				{@const ty = su.y * CELL + 44 + popH > config.grid_rows * CELL ? Math.max(0, su.y * CELL - popH) : su.y * CELL + 44}
				<div class="hp-pop" style="left:{px}px;top:{Math.max(0, ty)}px" onpointerdown={(e) => e.stopPropagation()}>
					<div class="hpn">{su.name} · <b>{su.hp}{su.max_hp ? `/${su.max_hp}` : ''}</b></div>
					<div class="btns">
						<button type="button" onclick={() => applyHpDelta(-1)}>−1</button>
						<button type="button" onclick={() => applyHpDelta(-5)}>−5</button>
						<button type="button" onclick={() => applyHpDelta(1)}>+1</button>
						<button type="button" onclick={() => applyHpDelta(5)}>+5</button>
					</div>
					<form class="set" onsubmit={(e) => { e.preventDefault(); applyHpSet(); }}>
						<input bind:value={hpAmount} inputmode="numeric" placeholder="Set HP" />
						<button type="submit">Set</button>
					</form>
					{#if dm}
						<div class="atk">
							<div class="row">
								<input class="num" bind:value={atkBonus} inputmode="numeric" placeholder="Atk+" title="Attack bonus" />
								<span class="vs">vs</span>
								<input class="num" bind:value={atkAc} inputmode="numeric" placeholder="AC" title="Target AC" />
								<button type="button" onclick={rollAttack}>⚔ Attack</button>
							</div>
							<div class="row">
								<input class="dice" bind:value={dmgDice} placeholder="1d8" title="Damage dice" />
								<button type="button" onclick={rollDamage}>💥 Damage</button>
							</div>
							<div class="condrow">
								<span class="cl">Conditions</span>
								<div class="chips">
									{#each COND_PRESETS as c}
										<button
											type="button"
											class:on={condText.split(',').map((x) => x.trim()).includes(c)}
											onclick={() => toggleCond(c)}
											>{c}</button
										>
									{/each}
								</div>
								<div class="crow">
									<input class="cd" bind:value={condText} placeholder="Custom, comma-separated…" onchange={saveConditions} />
									<button type="button" onclick={saveConditions}>Save</button>
								</div>
							</div>
							{#if condErr}<div class="err">{condErr}</div>{/if}
						</div>
					{/if}
					{#if dmgError}<div class="err">{dmgError}</div>{/if}
				</div>
			{/if}
		{/if}
	</div>
	</div>

	{#if errorMsg}<p class="error">{errorMsg}</p>{/if}
</div>

<style>
	.board-wrap {
		font-family: var(--font-ui);
	}
	.toolbar {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		margin-bottom: 0.5rem;
		flex-wrap: wrap;
	}
	.toolbar button {
		border: 1px solid var(--rule);
		background: var(--parchment-light);
		border-radius: var(--radius-md);
		padding: 0.3rem 0.6rem;
		cursor: pointer;
		font-size: 0.85rem;
		color: var(--ink-soft);
		transition: background 0.12s ease, border-color 0.12s ease, color 0.12s ease, transform 0.06s ease;
	}
	.toolbar button:hover {
		background: var(--parchment-deep);
		border-color: var(--accent);
		color: var(--ink);
	}
	.toolbar button:active {
		transform: translateY(1px);
	}
	.toolbar button.on {
		color: var(--accent);
		border-color: var(--gold);
		background: var(--parchment-deep);
	}
	.toolbar button.danger {
		color: var(--danger);
		border-color: var(--danger);
	}
	.toolbar button.danger:hover {
		background: var(--danger);
		color: var(--parchment-light);
	}
	.colors {
		display: inline-flex;
		gap: 0.3rem;
		margin-left: 0.3rem;
	}
	.swatch {
		width: 1.3rem;
		height: 1.3rem;
		border-radius: 50%;
		border: 2px solid transparent;
		padding: 0;
	}
	.swatch.sel {
		border-color: var(--gold);
	}
	.budget {
		margin-left: 0.5rem;
		font-size: 0.85rem;
		color: var(--ink-soft);
	}
	.board {
		position: relative;
		border: 2px solid var(--rule);
		background: var(--board-bg, #222222);
		border-radius: var(--radius-md);
		overflow: hidden;
		touch-action: none;
		cursor: crosshair;
		box-shadow: var(--shadow-md);
	}
	.board-viewport {
		overflow: auto;
		max-width: 100%;
		touch-action: pan-x pan-y;
		border-radius: var(--radius-md);
		box-shadow: inset 0 0 26px rgba(0, 0, 0, 0.35);
	}
	.zoombar {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		margin-bottom: 0.4rem;
		flex-wrap: wrap;
	}
	.zoombar button {
		border: 1px solid var(--rule);
		background: var(--parchment-light);
		border-radius: var(--radius-sm);
		padding: 0.15rem 0.5rem;
		cursor: pointer;
		font-size: 0.8rem;
		color: var(--ink-soft);
		transition: background 0.12s ease, border-color 0.12s ease;
	}
	.zoombar button:hover {
		background: var(--parchment-deep);
		border-color: var(--accent);
	}
	.zoombar .zval {
		font-size: 0.8rem;
		color: var(--ink-soft);
		min-width: 2.6rem;
		text-align: center;
	}
	.grid {
		position: absolute;
		inset: 0;
		display: block;
	}
	.measure {
		position: absolute;
		inset: 0;
		display: block;
		pointer-events: none;
	}
	.token {
		position: absolute;
		width: 40px;
		height: 40px;
		pointer-events: auto;
		cursor: grab;
		z-index: 3;
	}
	.token.myturn {
		cursor: grabbing;
	}
	/* The dot is the position anchor: its centre is pinned to the cell centre (20,20)
	   for a 30px dot in a 40px cell, independent of the label/HP readouts. */
	.dot {
		position: absolute;
		top: 5px;
		left: 5px;
		width: 30px;
		height: 30px;
		box-sizing: border-box;
		border: 2px solid #fff;
		border-radius: 50%;
		box-shadow: 0 2px 6px rgba(0, 0, 0, 0.55);
	}
	/* players get an indigo identity ring so the party reads at a glance */
	.token.player .dot {
		box-shadow: 0 2px 6px rgba(0, 0, 0, 0.55), 0 0 0 2px var(--token-ring);
	}
	.token.player.sel .dot {
		box-shadow: 0 2px 6px rgba(0, 0, 0, 0.55), 0 0 0 3px var(--accent);
	}
	.token.active .dot {
		box-shadow: 0 0 0 2px var(--gold), 0 2px 6px rgba(0, 0, 0, 0.55);
	}
	.token.sel .dot {
		box-shadow: 0 0 0 2px var(--accent), 0 2px 6px rgba(0, 0, 0, 0.55);
	}
	.token.dead .dot {
		filter: grayscale(1) brightness(0.75);
		opacity: 0.55;
	}
	.token.dead .label {
		opacity: 0.55;
		text-decoration: line-through;
	}
	.skull {
		position: absolute;
		top: 2px;
		right: 2px;
		left: auto;
		transform: none;
		z-index: 4;
		font-size: 0.7rem;
		pointer-events: none;
		filter: drop-shadow(0 1px 1px rgba(0, 0, 0, 0.4));
	}
	.label {
		position: absolute;
		top: 0;
		left: 50%;
		transform: translateX(-50%);
		font-size: 0.65rem;
		line-height: 1.1;
		color: var(--parchment-deep);
		background: rgba(255, 255, 255, 0.88);
		padding: 0 0.15rem;
		border-radius: 3px;
		white-space: nowrap;
		max-width: 92px;
		overflow: hidden;
		text-overflow: ellipsis;
		pointer-events: none;
	}
	.hp {
		position: absolute;
		bottom: 0;
		left: 50%;
		transform: translateX(-50%);
		font-size: 0.65rem;
		line-height: 1.1;
		color: var(--parchment-deep);
		background: rgba(255, 255, 255, 0.88);
		padding: 0 0.2rem;
		border-radius: 3px;
		white-space: nowrap;
		min-width: 1.4rem;
		text-align: center;
		pointer-events: none;
	}
	.snap-hl {
		position: absolute;
		z-index: 2;
		width: 40px;
		height: 40px;
		box-sizing: border-box;
		border: 2px solid var(--gold);
		background: rgba(212, 175, 55, 0.14);
		border-radius: 3px;
		pointer-events: none;
	}
	.ping {
		position: absolute;
		width: 1.5rem;
		height: 1.5rem;
		transform: translate(-50%, -50%);
		pointer-events: none;
		z-index: 20;
		animation: ping-fade 2s ease-out forwards;
	}
	.ping .ring {
		position: absolute;
		inset: -0.5rem;
		border-radius: 50%;
		border: 2px solid var(--pc, #f0c040);
		animation: ping-ring 0.8s ease-out infinite;
	}
	.ping .lbl {
		position: absolute;
		top: 1.6rem;
		left: 50%;
		transform: translateX(-50%);
		font-size: 0.7rem;
		line-height: 1.1;
		white-space: nowrap;
		color: #fff;
		background: var(--pc, #f0c040);
		padding: 0.05rem 0.35rem;
		border-radius: 3px;
		font-family: var(--font-ui);
	}
	@keyframes ping-fade {
		0% {
			opacity: 1;
		}
		80% {
			opacity: 1;
		}
		100% {
			opacity: 0;
		}
	}
	@keyframes ping-ring {
		from {
			opacity: 0.9;
			transform: scale(0.3);
		}
		to {
			opacity: 0;
			transform: scale(1.5);
		}
	}
	.drag-feedback {
		position: absolute;
		z-index: 4;
		padding: 0.15rem 0.4rem;
		background: var(--accent);
		color: var(--parchment-light);
		border-radius: 4px;
		font-size: 0.72rem;
		font-weight: 600;
		white-space: nowrap;
		pointer-events: none;
		box-shadow: 0 1px 4px rgba(0, 0, 0, 0.3);
	}
	.floating {
		position: absolute;
		z-index: 5;
		transform: translateX(-50%) translateY(0);
		font-size: 0.85rem;
		font-weight: 700;
		padding: 0.05rem 0.3rem;
		border-radius: 4px;
		pointer-events: none;
		color: var(--parchment-light);
		background: var(--danger);
		box-shadow: 0 1px 4px rgba(0, 0, 0, 0.35);
		animation: rise 1.3s ease-out forwards;
	}
	.floating.heal {
		background: var(--success);
	}
	.hp-pop {
		position: absolute;
		z-index: 6;
		width: 9.5rem;
		background: var(--parchment-light);
		border: 1px solid var(--gold);
		border-radius: 8px;
		padding: 0.5rem;
		box-shadow: var(--shadow-lg);
		font-family: var(--font-ui);
	}
	.hp-pop .hpn {
		font-size: 0.85rem;
		font-weight: 600;
		margin-bottom: 0.4rem;
		color: var(--ink);
	}
	.hp-pop .btns {
		display: flex;
		gap: 0.3rem;
		flex-wrap: wrap;
		margin-bottom: 0.4rem;
	}
	.hp-pop .btns button {
		flex: 1;
		min-width: 1.9rem;
		border: 1px solid var(--rule);
		background: var(--parchment-light);
		border-radius: 4px;
		padding: 0.25rem 0;
		cursor: pointer;
		font-size: 0.8rem;
	}
	.hp-pop .set {
		display: flex;
		gap: 0.3rem;
	}
	.hp-pop .set input {
		flex: 1;
		min-width: 0;
		border: 1px solid var(--rule);
		border-radius: 4px;
		padding: 0.2rem 0.35rem;
		font-size: 0.8rem;
	}
	.hp-pop .set button {
		border: 0;
		background: var(--accent);
		color: var(--parchment-light);
		border-radius: 4px;
		padding: 0.25rem 0.6rem;
		cursor: pointer;
	}
	.hp-pop .err {
		color: var(--danger);
		font-size: 0.75rem;
		margin-top: 0.35rem;
	}
	.cond {
		position: absolute;
		bottom: 1.2rem;
		left: 50%;
		transform: translateX(-50%);
		font-size: 0.55rem;
		line-height: 1;
		white-space: nowrap;
		color: #fff;
		background: var(--cc, #5d6d7e);
		border-radius: 3px;
		padding: 0.08rem 0.22rem;
		pointer-events: none;
		z-index: 4;
	}
	.hp-pop .atk {
		margin-top: 0.4rem;
		padding-top: 0.4rem;
		border-top: 1px solid var(--rule);
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}
	.hp-pop .row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.3rem;
		align-items: center;
	}
	.hp-pop .num {
		flex: 1 1 2.2rem;
		min-width: 0;
		box-sizing: border-box;
	}
	.hp-pop .dice {
		flex: 1;
		min-width: 0;
	}
	.hp-pop .row input,
	.hp-pop .condrow input {
		border: 1px solid var(--rule);
		border-radius: 4px;
		padding: 0.2rem 0.35rem;
		font-size: 0.8rem;
	}
	.hp-pop .vs {
		color: var(--ink-soft);
		font-size: 0.8rem;
	}
	.hp-pop .row button,
	.hp-pop .crow button {
		border: 0;
		background: var(--accent);
		color: var(--parchment-light);
		border-radius: 4px;
		padding: 0.25rem 0.6rem;
		cursor: pointer;
		font-size: 0.8rem;
	}
	.hp-pop .condrow {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}
	.hp-pop .cl {
		font-size: 0.75rem;
		color: var(--ink-soft);
	}
	.hp-pop .chips {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem;
	}
	.hp-pop .chips button {
		border: 1px solid var(--rule);
		background: var(--parchment-light);
		border-radius: 4px;
		padding: 0.15rem 0.4rem;
		cursor: pointer;
		font-size: 0.72rem;
		color: var(--ink);
	}
	.hp-pop .chips button.on {
		background: var(--accent);
		border-color: var(--accent);
		color: var(--parchment-light);
	}
	.hp-pop .crow {
		display: flex;
		gap: 0.3rem;
	}
	.hp-pop .cd {
		flex: 1;
		min-width: 0;
	}
	.error {
		color: var(--danger);
		font-size: 0.85rem;
		margin: 0.4rem 0 0;
	}
	@keyframes rise {
		from {
			transform: translateX(-50%) translateY(0);
			opacity: 1;
		}
		to {
			transform: translateX(-50%) translateY(-18px);
			opacity: 0;
		}
	}
</style>
