<script lang="ts">
	import { onMount } from 'svelte';
	import type { CombatUnit, CombatDrawing, BoardConfig } from '$lib/server/db';

	let {
		campaignId,
		dm = false,
		characterId = null,
		initialUnits = [],
		initialDrawings = [],
		initialConfig,
		activeUnitId = null
	}: {
		campaignId: string;
		dm?: boolean;
		characterId?: string | null;
		initialUnits?: CombatUnit[];
		initialDrawings?: CombatDrawing[];
		initialConfig: BoardConfig;
		activeUnitId?: string | null;
	} = $props();

	const CELL = 40;
	const COLORS = ['#222', '#c0392b', '#2980b9', '#27ae60', '#8e44ad', '#d68910', '#7f8c8d'];

	let units = $state<CombatUnit[]>(initialUnits);
	let drawings = $state<CombatDrawing[]>(initialDrawings);
	let config = $state<BoardConfig>(initialConfig);
	let tool = $state<'draw' | 'erase' | 'measure' | 'dmg'>(dm ? 'draw' : 'measure');
	let color = $state('#222');
	let errorMsg = $state('');
	let selectedId = $state<string | null>(null);
	let hpAmount = $state('');
	let dmgError = $state('');

	let canvas: HTMLCanvasElement | undefined = $state();
	let measureCanvas: HTMLCanvasElement | undefined = $state();
	let boardEl: HTMLDivElement | undefined = $state();

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
	const isMyTurn = $derived(!!myUnit && myUnit.id === activeId);

	export function setActiveUnitId(id: string | null) {
		activeId = id;
	}
	const budgetCells = $derived(myUnit ? Math.floor(myUnit.speed / (config.grid_scale || 5)) : 0);
	const usedCells = $derived(config.combat_movement_used);

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

	function toCell(e: { clientX: number; clientY: number }): [number, number] {
		const rect = boardEl?.getBoundingClientRect();
		if (!rect) return [0, 0];
		return [(e.clientX - rect.left) / CELL, (e.clientY - rect.top) / CELL];
	}

	function boardTheme() {
	// board colours follow the active theme's CSS vars
	const cs = getComputedStyle(document.documentElement);
	return {
		bg: cs.getPropertyValue('--board-bg').trim() || '#2d261c',
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

	$effect(() => {
		redraw();
		redrawMeasure();
	});

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') selectedId = null;
	}

	function onPointerDown(e: PointerEvent) {
		const pos = toCell(e);
		if (tool === 'dmg') {
			// clicking empty board clears the selection
			selectedId = null;
			return;
		}
		if (tool === 'measure') {
			measureStart = pos;
			measureEnd = pos;
			redrawMeasure();
			return;
		}
		if (dm && (tool === 'draw' || tool === 'erase')) {
			drawing = true;
			currentPoints = [pos];
			redraw();
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
			redrawMeasure();
		}
	}
	function onPointerUp() {
		if (drawing) {
			if (currentPoints.length >= 1 && (tool === 'draw' || tool === 'erase')) postStroke(tool, currentPoints);
			drawing = false;
			currentPoints = [];
			redraw();
		} else if (measureStart) {
			measureStart = null;
			measureEnd = null;
			redrawMeasure();
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
			if (tool === 'dmg') {
				// damage tool: select the token (players only their own), don't drag
				if (!dm && u.id !== myUnit?.id) return;
				selectedId = selectedId === u.id ? null : u.id;
				hpAmount = '';
				dmgError = '';
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
			grabOffset = {
				x: e.clientX - (r?.left ?? 0) - u.x * CELL,
				y: e.clientY - (r?.top ?? 0) - u.y * CELL
			};
			dragCost = null;
			errorMsg = '';
			// keep the token exactly where it is when grabbed (no jump), then snap as it moves
			dragTemp = { ...dragTemp, [u.id]: { x: u.x, y: u.y } };
			window.addEventListener('mousemove', onDragMove);
			window.addEventListener('mouseup', onDragEnd);
		};
	}

	function clampToBudget(
		target: { x: number; y: number },
		origin: { x: number; y: number },
		steps: number
	): { x: number; y: number } {
		let tx = origin.x;
		let ty = origin.y;
		const cx = Math.sign(target.x - origin.x);
		const cy = Math.sign(target.y - origin.y);
		for (let i = 0; i < steps; i++) {
			const rx = Math.abs(target.x - tx);
			const ry = Math.abs(target.y - ty);
			if (rx === 0 && ry === 0) break;
			if (rx >= ry) {
				if (rx !== 0) tx += cx;
				else if (ry !== 0) ty += cy;
			} else {
				if (ry !== 0) ty += cy;
				else if (rx !== 0) tx += cx;
			}
		}
		return {
			x: Math.max(0, Math.min(config.grid_cols - 1, tx)),
			y: Math.max(0, Math.min(config.grid_rows - 1, ty))
		};
	}

	function manhattan(a: { x: number; y: number }, b: { x: number; y: number }) {
		return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
	}

	function onDragMove(e: MouseEvent) {
		if (!draggingId || !dragStart || !grabOffset) return;
		const r = boardEl?.getBoundingClientRect();
		const tx = (e.clientX - (r?.left ?? 0)) - grabOffset.x;
		const ty = (e.clientY - (r?.top ?? 0)) - grabOffset.y;
		let cell = {
			x: Math.max(0, Math.min(config.grid_cols - 1, Math.round(tx / CELL))),
			y: Math.max(0, Math.min(config.grid_rows - 1, Math.round(ty / CELL)))
		};
		if (!dm) {
			// player: clamp to the speed budget and report cost/remaining live
			const allowed = Math.max(0, budgetCells - usedCells);
			const cost = manhattan(cell, dragStart);
			if (cost > allowed) cell = clampToBudget(cell, dragStart, allowed);
			dragCost = manhattan(cell, dragStart);
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
			const cost = manhattan(cell, unit);
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
			// keep the local budget accurate even if the SSE config broadcast hasn't landed yet
			const body = (await res.json().catch(() => ({}))) as { used?: number };
			if (typeof body.used === 'number') {
				config = { ...config, combat_movement_used: body.used };
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
			{#if myUnit}
				<span class="budget"
					>Turn: <b>{myUnit.name}</b> · moved {Math.min(usedCells, budgetCells)}/{budgetCells} cells</span
				>
			{/if}
		</div>
	{/if}

	<div
		class="board"
		bind:this={boardEl}
		style="width:{config.grid_cols * CELL}px;height:{config.grid_rows * CELL}px"
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
				<div class="hp-pop" style="left:{px}px;top:{Math.max(0, su.y * CELL + 44)}px">
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
					{#if dmgError}<div class="err">{dmgError}</div>{/if}
				</div>
			{/if}
		{/if}
	</div>

	{#if errorMsg}<p class="error">{errorMsg}</p>{/if}
</div>

<style>
	.board-wrap {
		font-family: system-ui, sans-serif;
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
		border-radius: 5px;
		padding: 0.3rem 0.6rem;
		cursor: pointer;
		font-size: 0.85rem;
		color: var(--ink-soft);
	}
	.toolbar button.on {
		color: var(--accent);
		border-color: var(--gold);
		background: var(--parchment-deep);
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
		background: var(--board-bg, #2d261c);
		border-radius: 4px;
		overflow: hidden;
		touch-action: none;
		cursor: crosshair;
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
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.4);
	}
	.token.active .dot {
		box-shadow: 0 0 0 2px var(--gold), 0 1px 3px rgba(0, 0, 0, 0.4);
	}
	.token.sel .dot {
		box-shadow: 0 0 0 2px var(--accent), 0 1px 3px rgba(0, 0, 0, 0.4);
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
		top: -4px;
		left: 50%;
		transform: translateX(-50%);
		font-size: 0.6rem;
		pointer-events: none;
		filter: drop-shadow(0 1px 1px rgba(0, 0, 0, 0.4));
	}
	.label {
		position: absolute;
		top: 0;
		left: 50%;
		transform: translateX(-50%);
		font-size: 0.55rem;
		line-height: 1.1;
		color: var(--ink);
		background: rgba(255, 255, 255, 0.85);
		padding: 0 0.15rem;
		border-radius: 3px;
		white-space: nowrap;
		max-width: 44px;
		overflow: hidden;
		text-overflow: ellipsis;
		pointer-events: none;
	}
	.hp {
		position: absolute;
		bottom: 0;
		left: 50%;
		transform: translateX(-50%);
		font-size: 0.55rem;
		line-height: 1.1;
		color: var(--accent);
		background: rgba(255, 255, 255, 0.85);
		padding: 0 0.15rem;
		border-radius: 3px;
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
		background: #c0392b;
		box-shadow: 0 1px 4px rgba(0, 0, 0, 0.35);
		animation: rise 1.3s ease-out forwards;
	}
	.floating.heal {
		background: #27ae60;
	}
	.hp-pop {
		position: absolute;
		z-index: 6;
		width: 9.5rem;
		background: var(--parchment-light);
		border: 1px solid var(--gold);
		border-radius: 8px;
		padding: 0.5rem;
		box-shadow: 0 4px 16px rgba(43, 35, 23, 0.3);
		font-family: system-ui, sans-serif;
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
		color: var(--accent-soft);
		font-size: 0.75rem;
		margin-top: 0.35rem;
	}
	.error {
		color: var(--accent-soft);
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
