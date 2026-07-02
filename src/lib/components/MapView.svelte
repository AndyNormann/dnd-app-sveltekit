<script lang="ts">
	import { onMount } from 'svelte';
	import type { MapData, RevealOp } from '$lib/types';

	let {
		map,
		dm = false,
		campaignId
	}: { map: MapData; dm?: boolean; campaignId: string } = $props();

	type Mode = 'off' | 'rect-reveal' | 'rect-erase' | 'brush-reveal' | 'brush-erase';

	let reveals = $state<RevealOp[]>([...map.reveals]);
	let mode = $state<Mode>('off');
	let brushSize = $state(40); // brush radius in display px

	let img: HTMLImageElement;
	let canvas: HTMLCanvasElement;

	// in-progress rect drag in displayed pixels
	let dragging = $state(false);
	let dragRect = $state<{ x: number; y: number; w: number; h: number } | null>(null);
	// in-progress brush stroke, normalized 0..1 coords
	let stroke: [number, number][] = [];

	const isBrushMode = $derived(mode === 'brush-reveal' || mode === 'brush-erase');
	const isErase = $derived(mode === 'rect-erase' || mode === 'brush-erase');

	/** Append an op coming from SSE or local action and repaint. */
	export function applyOp(op: RevealOp) {
		if (reveals.some((r) => r.id === op.id)) return;
		reveals = [...reveals, op].sort((a, b) => a.seq - b.seq);
		paint();
	}

	export const mapId = map.id;

	function fogColor() {
		return dm ? 'rgba(0,0,0,0.6)' : '#000';
	}

	/** Apply one reveal/hide op (rect or brush stroke) to the fog canvas. */
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

	function paint() {
		if (!canvas || !img) return;
		const w = img.clientWidth;
		const h = img.clientHeight;
		if (!w || !h) return;
		if (canvas.width !== w || canvas.height !== h) {
			canvas.width = w;
			canvas.height = h;
		}
		const ctx = canvas.getContext('2d')!;
		ctx.clearRect(0, 0, w, h);

		// base fog: opaque black for players, translucent dim for the DM
		ctx.globalCompositeOperation = 'source-over';
		ctx.fillStyle = fogColor();
		ctx.fillRect(0, 0, w, h);

		for (const op of reveals) {
			drawOp(ctx, w, h, op.kind, op.shape ?? 'rect', op);
		}

		// live previews (DM only)
		if (dm && stroke.length && isBrushMode) {
			drawOp(ctx, w, h, isErase ? 'hide' : 'reveal', 'brush', {
				path: stroke,
				radius: brushSize / w
			});
		}
		if (dm && dragRect) {
			ctx.globalCompositeOperation = 'source-over';
			ctx.strokeStyle = isErase ? '#ef4444' : '#22c55e';
			ctx.lineWidth = 2;
			ctx.strokeRect(dragRect.x, dragRect.y, dragRect.w, dragRect.h);
		}
		ctx.globalCompositeOperation = 'source-over';
	}

	function pointerPos(e: PointerEvent) {
		const rect = img.getBoundingClientRect();
		return {
			x: Math.max(0, Math.min(rect.width, e.clientX - rect.left)),
			y: Math.max(0, Math.min(rect.height, e.clientY - rect.top))
		};
	}

	function onPointerDown(e: PointerEvent) {
		if (!dm || mode === 'off') return;
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
			radius: Math.min(0.25, Math.max(0.001, brushSize / img.clientWidth))
		};
		await postOp(payload);
	}

	async function finishRect() {
		if (!dragRect) return;
		// normalize to top-left origin + 0..1 coords
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
		await postOp({
			kind: isErase ? 'hide' : 'reveal',
			shape: 'rect',
			x: x / w,
			y: y / h,
			w: rw / w,
			h: rh / h
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

	onMount(() => {
		const ro = new ResizeObserver(() => paint());
		ro.observe(img);
		if (img.complete) paint();
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
		</div>
	{/if}
	<div class="stage" class:drawing={dm && mode !== 'off'}>
		<img bind:this={img} src={map.src} alt="map" onload={paint} draggable="false" />
		<canvas
			bind:this={canvas}
			onpointerdown={onPointerDown}
			onpointermove={onPointerMove}
			onpointerup={onPointerUp}
		></canvas>
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
	}
	.toolbar button {
		padding: 0.3rem 0.7rem;
		border: 1px solid #ccc;
		background: #f8f8f8;
		border-radius: 5px;
		cursor: pointer;
		font-size: 0.8rem;
	}
	.toolbar button.active {
		background: #5b21b6;
		color: white;
		border-color: #5b21b6;
	}
	.size {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		font-size: 0.78rem;
		color: #4b5563;
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
</style>
