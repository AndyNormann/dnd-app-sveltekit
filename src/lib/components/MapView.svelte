<script lang="ts">
	import { onMount } from 'svelte';
	import type { MapData, RevealOp, TokenData } from '$lib/types';

	let {
		map,
		dm = false,
		campaignId
	}: { map: MapData; dm?: boolean; campaignId: string } = $props();

	type Mode = 'off' | 'rect-reveal' | 'rect-erase' | 'brush-reveal' | 'brush-erase';

	let reveals = $state<RevealOp[]>([...map.reveals]);
	let mode = $state<Mode>('off');
	let brushSize = $state(40); // brush radius in display px
	let layer = $state(map.active_layer ?? 0); // fog layer currently shown/edited
	let gridSize = $state(map.grid_size ?? 0); // 0 = grid off
	let tokens = $state<TokenData[]>([]);
	let placingToken = $state(false);
	let dragTokenId = $state<string | null>(null);

	let img: HTMLImageElement;
	let canvas: HTMLCanvasElement;

	// in-progress rect drag in displayed pixels
	let dragging = $state(false);
	let dragRect = $state<{ x: number; y: number; w: number; h: number } | null>(null);
	// in-progress brush stroke, normalized 0..1 coords
	let stroke: [number, number][] = [];

	const isBrushMode = $derived(mode === 'brush-reveal' || mode === 'brush-erase');
	const isErase = $derived(mode === 'rect-erase' || mode === 'brush-erase');

	export const mapId = map.id;

	export function applyOp(op: RevealOp) {
		if (reveals.some((r) => r.id === op.id)) return;
		reveals = [...reveals, op].sort((a, b) => a.seq - b.seq);
		if (!dm) {
			animateOp(op.id);
		} else {
			paint();
		}
	}

	export function applyTokens(next: TokenData[]) {
		tokens = [...next];
	}
	export function applyGrid(grid: number) {
		gridSize = grid;
		paint();
	}
	export function applyLayer(next: number) {
		layer = next;
		paint();
	}

	/** Replace full map state (reconnects / snapshot). */
	export function applyState(mapData: MapData, tokenList: TokenData[]) {
		reveals = [...mapData.reveals];
		gridSize = mapData.grid_size ?? 0;
		layer = mapData.active_layer ?? 0;
		tokens = [...tokenList];
		paint();
	}

	function fogColor() {
		return dm ? 'rgba(0,0,0,0.6)' : '#000';
	}

	function drawOp(
		ctx: CanvasRenderingContext2D,
		w: number,
		h: number,
		kind: 'reveal' | 'hide',
		shape: 'rect' | 'brush',
		op: {
			x?: number;
			y?: number;
			w?: number;
			h?: number;
			path?: [number, number][];
			radius?: number;
		}
	) {
		ctx.globalCompositeOperation = kind === 'reveal' ? 'destination-out' : 'source-over';
		ctx.fillStyle = fogColor();
		ctx.strokeStyle = fogColor();
		if (shape === 'rect') {
			ctx.fillRect((op.x ?? 0) * w, (op.y ?? 0) * h, (op.w ?? 0) * w, (op.h ?? 0) * h);
			return;
		}
		const path = op.path ?? [];
		if (!path.length) return;
		const r = (op.radius ?? 0.02) * w;
		if (path.length === 1) {
			ctx.beginPath();
			ctx.arc(path[0][0] * w, path[0][1] * h, r, 0, Math.PI * 2);
			ctx.fill();
			return;
		}
		ctx.lineWidth = r * 2;
		ctx.lineCap = 'round';
		ctx.lineJoin = 'round';
		ctx.beginPath();
		ctx.moveTo(path[0][0] * w, path[0][1] * h);
		for (const [x, y] of path.slice(1)) ctx.lineTo(x * w, y * h);
		ctx.stroke();
	}

	const FOG_PAD = 24;
	const FOG_BLUR = 6;
	let fogBuffer: HTMLCanvasElement | null = null;
	let anim: { id: number; start: number } | null = null;
	const ANIM_MS = 450;

	function paint() {
		if (!canvas || !img) return;
		const w = img.clientWidth;
		const h = img.clientHeight;
		if (!w || !h) return;
		if (canvas.width !== w || canvas.height !== h) {
			canvas.width = w;
			canvas.height = h;
		}
		if (!fogBuffer) fogBuffer = document.createElement('canvas');
		const bw = w + FOG_PAD * 2;
		const bh = h + FOG_PAD * 2;
		if (fogBuffer.width !== bw || fogBuffer.height !== bh) {
			fogBuffer.width = bw;
			fogBuffer.height = bh;
		}

		const fctx = fogBuffer.getContext('2d')!;
		fctx.setTransform(1, 0, 0, 1, 0, 0);
		fctx.clearRect(0, 0, bw, bh);
		fctx.globalCompositeOperation = 'source-over';
		fctx.fillStyle = fogColor();
		fctx.fillRect(0, 0, bw, bh);
		fctx.translate(FOG_PAD, FOG_PAD);

		// only the active layer's fog is shown
		for (const op of reveals) {
			if (op.layer !== layer) continue;
			if (anim && op.id === anim.id) {
				const t = Math.min(1, (performance.now() - anim.start) / ANIM_MS);
				fctx.globalAlpha = t;
				drawOp(fctx, w, h, op.kind, op.shape ?? 'rect', op);
				fctx.globalAlpha = 1;
			} else {
				drawOp(fctx, w, h, op.kind, op.shape ?? 'rect', op);
			}
		}

		if (dm && stroke.length && isBrushMode) {
			drawOp(fctx, w, h, isErase ? 'hide' : 'reveal', 'brush', {
				path: stroke,
				radius: brushSize / w
			});
		}

		const ctx = canvas.getContext('2d')!;
		ctx.clearRect(0, 0, w, h);
		ctx.globalCompositeOperation = 'source-over';
		ctx.filter = `blur(${FOG_BLUR}px)`;
		ctx.drawImage(fogBuffer, -FOG_PAD, -FOG_PAD);
		ctx.filter = 'none';

		// crisp overlays: DM rect preview + grid
		if (dm && dragRect) {
			ctx.strokeStyle = isErase ? '#ef4444' : '#22c55e';
			ctx.lineWidth = 2;
			ctx.strokeRect(dragRect.x, dragRect.y, dragRect.w, dragRect.h);
		}
		if (gridSize > 0) {
			ctx.strokeStyle = 'rgba(255,255,255,0.35)';
			ctx.lineWidth = 1;
			ctx.beginPath();
			for (let x = gridSize; x < w; x += gridSize) {
				ctx.moveTo(x, 0);
				ctx.lineTo(x, h);
			}
			for (let y = gridSize; y < h; y += gridSize) {
				ctx.moveTo(0, y);
				ctx.lineTo(w, y);
			}
			ctx.stroke();
		}
	}

	function animateOp(id: number) {
		anim = { id, start: performance.now() };
		const tick = () => {
			if (!anim) return;
			paint();
			if (performance.now() - anim.start >= ANIM_MS) {
				anim = null;
				paint();
				return;
			}
			requestAnimationFrame(tick);
		};
		requestAnimationFrame(tick);
	}

	function pointerPos(e: MouseEvent) {
		const rect = img.getBoundingClientRect();
		return {
			x: Math.max(0, Math.min(rect.width, e.clientX - rect.left)),
			y: Math.max(0, Math.min(rect.height, e.clientY - rect.top))
		};
	}

	function onPointerDown(e: PointerEvent) {
		if (!dm || mode === 'off' || placingToken) return;
		e.preventDefault();
		canvas.setPointerCapture(e.pointerId);
		const p = pointerPos(e);
		dragging = true;
		if (isBrushMode) {
			stroke = [[p.x / img.clientWidth, p.y / img.clientHeight]];
			paint();
		} else {
			dragRect = { x: p.x, y: p.y, w: 0, h: 0 };
		}
	}

	function onPointerMove(e: PointerEvent) {
		if (!dragging) return;
		const p = pointerPos(e);
		if (isBrushMode) {
			stroke.push([p.x / img.clientWidth, p.y / img.clientHeight]);
			paint();
		} else if (dragRect) {
			dragRect = { x: dragRect.x, y: dragRect.y, w: p.x - dragRect.x, h: p.y - dragRect.y };
			paint();
		}
	}

	async function onPointerUp(e: PointerEvent) {
		if (!dragging) return;
		dragging = false;
		canvas.releasePointerCapture(e.pointerId);
		if (isBrushMode) {
			await finishStroke();
		} else {
			await finishRect();
		}
	}

	async function finishStroke() {
		const path = stroke;
		stroke = [];
		if (!path.length || !img.clientWidth) {
			paint();
			return;
		}
		const payload = {
			kind: isErase ? 'hide' : 'reveal',
			shape: 'brush',
			path,
			radius: Math.min(0.25, Math.max(0.001, brushSize / img.clientWidth)),
			layer
		};
		await postOp(payload);
	}

	async function finishRect() {
		if (!dragRect) return;
		const w = img.clientWidth;
		const h = img.clientHeight;
		let { x, y, w: rw, h: rh } = dragRect;
		if (rw < 0) {
			x += rw;
			rw = -rw;
		}
		if (rh < 0) {
			y += rh;
			rh = -rh;
		}
		dragRect = null;

		if (rw < 4 || rh < 4) {
			paint();
			return;
		}

		// snap to grid when enabled
		if (gridSize > 0) {
			const cell = gridSize;
			const x0 = Math.round(x / cell) * cell;
			const x1 = Math.round((x + rw) / cell) * cell;
			const y0 = Math.round(y / cell) * cell;
			const y1 = Math.round((y + rh) / cell) * cell;
			x = x0;
			y = y0;
			rw = Math.max(cell, x1 - x0);
			rh = Math.max(cell, y1 - y0);
		}

		await postOp({
			kind: isErase ? 'hide' : 'reveal',
			shape: 'rect',
			x: x / w,
			y: y / h,
			w: rw / w,
			h: rh / h,
			layer
		});
	}

	async function postOp(payload: unknown) {
		const res = await fetch(`/c/${campaignId}/maps/${map.id}/reveal`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(payload)
		});
		if (res.ok) {
			applyOp((await res.json()) as RevealOp);
		} else {
			paint();
		}
	}

	// --- tokens ---

	function tokenStyle(t: TokenData) {
		return `left:${t.x * 100}%;top:${t.y * 100}%;background:${t.color}`;
	}

	function onMapClick(e: MouseEvent) {
		if (!dm || !placingToken) return;
		const p = pointerPos(e);
		placingToken = false;
		fetch(`/c/${campaignId}/maps/${map.id}/tokens`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				label: 'Token',
				color: '#8b2020',
				x: p.x / img.clientWidth,
				y: p.y / img.clientHeight
			})
		});
	}

	function onTokenDrag(e: MouseEvent, t: TokenData) {
		e.stopPropagation();
		e.preventDefault();
		if (!dm) return;
		dragTokenId = t.id;
		(e.currentTarget as HTMLElement).setPointerCapture?.((e as PointerEvent).pointerId);
	}
	function onTokenMove(e: MouseEvent, t: TokenData) {
		if (dragTokenId !== t.id || !img) return;
		const p = pointerPos(e);
		fetch(`/c/${campaignId}/maps/${map.id}/tokens/${t.id}`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ x: p.x / img.clientWidth, y: p.y / img.clientHeight })
		});
	}
	function onTokenUp() {
		dragTokenId = null;
	}
	function removeToken(t: TokenData) {
		fetch(`/c/${campaignId}/maps/${map.id}/tokens/${t.id}`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ action: 'remove' })
		});
	}

	function setLayer(l: number) {
		layer = l;
		paint();
		fetch(`/c/${campaignId}/maps/${map.id}/layer`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ layer: l })
		});
	}

	function setGrid(e: Event) {
		gridSize = Number((e.currentTarget as HTMLInputElement).value);
		paint();
		fetch(`/c/${campaignId}/maps/${map.id}/grid`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ grid_size: gridSize })
		});
	}

	onMount(() => {
		const ro = new ResizeObserver(() => paint());
		ro.observe(img);
		if (img.complete) paint();
		// load tokens
		fetch(`/c/${campaignId}/maps/${map.id}/tokens`)
			.then((r) => (r.ok ? r.json() : []))
			.then((t) => (tokens = t));
		return () => ro.disconnect();
	});
</script>

<div class="map">
	{#if dm}
		<div class="toolbar">
			<button class:active={mode === 'off'} onclick={() => (mode = 'off')}>Off</button>
			<button class:active={mode === 'rect-reveal'} onclick={() => (mode = 'rect-reveal')}>
				▭ Reveal
			</button>
			<button class:active={mode === 'rect-erase'} onclick={() => (mode = 'rect-erase')}>
				▭ Erase
			</button>
			<button class:active={mode === 'brush-reveal'} onclick={() => (mode = 'brush-reveal')}>
				🖌 Reveal
			</button>
			<button class:active={mode === 'brush-erase'} onclick={() => (mode = 'brush-erase')}>
				🖌 Erase
			</button>
			{#if isBrushMode}
				<label class="size">
					Size
					<input type="range" min="10" max="120" bind:value={brushSize} />
				</label>
			{/if}
			<label class="size">
				Grid
				<input
					type="range"
					min="0"
					max="120"
					step="10"
					value={gridSize}
					onchange={(e) => setGrid(e)}
				/>
			</label>
			<label class="size">
				Layer
				<select value={layer} onchange={(e) => setLayer(Number(e.currentTarget.value))}>
					{#each [0, 1, 2, 3, 4] as l (l)}
						<option value={l}>{l}</option>
					{/each}
				</select>
			</label>
			<button class:active={placingToken} onclick={() => (placingToken = !placingToken)}>
				🎭 Token
			</button>
		</div>
	{/if}
	<div class="stage" class:drawing={dm && mode !== 'off'} onclick={onMapClick}>
		<img bind:this={img} src={map.src} alt="map" onload={paint} draggable="false" />
		<canvas
			bind:this={canvas}
			onpointerdown={onPointerDown}
			onpointermove={onPointerMove}
			onpointerup={onPointerUp}
		></canvas>
		{#each tokens as t (t.id)}
			<div
				class="token"
				style={tokenStyle(t)}
				onmousedown={(e) => onTokenDrag(e, t)}
				onmousemove={(e) => onTokenMove(e, t)}
				onmouseup={onTokenUp}
				title={t.label}
			>
				{#if dm}
					<button type="button" class="rm" onmousedown={(e) => e.stopPropagation()} onclick={() => removeToken(t)} title="Remove token">✕</button>
				{/if}
			</div>
		{/each}
	</div>
</div>

<style>
	.map {
		margin: 1rem 0;
	}
	.toolbar {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		margin-bottom: 0.4rem;
		flex-wrap: wrap;
	}
	.toolbar button {
		padding: 0.3rem 0.7rem;
		border: 1px solid var(--rule);
		background: var(--parchment-light);
		color: var(--ink-soft);
		border-radius: 5px;
		cursor: pointer;
		font-size: 0.8rem;
	}
	.toolbar button.active {
		background: var(--accent);
		color: var(--parchment-light);
		border-color: var(--accent);
	}
	.size {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		font-size: 0.78rem;
		color: var(--ink-soft);
		margin-left: 0.5rem;
	}
	.size input {
		width: 7rem;
	}
	.stage {
		position: relative;
		display: block;
		line-height: 0;
	}
	.stage img {
		width: 100%;
		height: auto;
		display: block;
		user-select: none;
	}
	.stage canvas {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		touch-action: auto;
	}
	.stage.drawing canvas {
		cursor: crosshair;
		touch-action: none;
	}
	.token {
		position: absolute;
		width: 2.2rem;
		height: 2.2rem;
		border-radius: 50%;
		transform: translate(-50%, -50%);
		border: 2px solid #fff;
		box-shadow: 0 1px 4px rgba(0, 0, 0, 0.5);
		cursor: grab;
		z-index: 5;
	}
	.token .rm {
		position: absolute;
		top: -0.7rem;
		right: -0.7rem;
		width: 1.1rem;
		height: 1.1rem;
		border: 0;
		border-radius: 50%;
		background: var(--accent);
		color: #fff;
		font-size: 0.6rem;
		line-height: 1.1rem;
		cursor: pointer;
		padding: 0;
	}
</style>
