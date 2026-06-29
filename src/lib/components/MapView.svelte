<script lang="ts">
	import { onMount } from 'svelte';
	import type { MapData, RevealOp } from '$lib/types';

	let {
		map,
		dm = false,
		campaignId
	}: { map: MapData; dm?: boolean; campaignId: string } = $props();

	let reveals = $state<RevealOp[]>([...map.reveals]);
	let mode = $state<'off' | 'reveal' | 'erase'>('off');

	let wrap: HTMLDivElement;
	let img: HTMLImageElement;
	let canvas: HTMLCanvasElement;

	// in-progress drag rectangle in displayed pixels
	let dragging = $state(false);
	let dragRect = $state<{ x: number; y: number; w: number; h: number } | null>(null);

	/** Append an op coming from SSE or local action and repaint. */
	export function applyOp(op: RevealOp) {
		if (reveals.some((r) => r.id === op.id)) return;
		reveals = [...reveals, op].sort((a, b) => a.seq - b.seq);
		paint();
	}

	export const mapId = map.id;

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
		ctx.fillStyle = dm ? 'rgba(0,0,0,0.6)' : '#000';
		ctx.fillRect(0, 0, w, h);

		for (const op of reveals) {
			const rx = op.x * w;
			const ry = op.y * h;
			const rw = op.w * w;
			const rh = op.h * h;
			if (op.kind === 'reveal') {
				ctx.globalCompositeOperation = 'destination-out';
				ctx.fillRect(rx, ry, rw, rh);
			} else {
				ctx.globalCompositeOperation = 'source-over';
				ctx.fillStyle = dm ? 'rgba(0,0,0,0.6)' : '#000';
				ctx.fillRect(rx, ry, rw, rh);
			}
		}

		// live drag preview (DM only)
		if (dm && dragRect) {
			ctx.globalCompositeOperation = 'source-over';
			ctx.strokeStyle = mode === 'erase' ? '#ef4444' : '#22c55e';
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
		dragRect = { x: p.x, y: p.y, w: 0, h: 0 };
	}

	function onPointerMove(e: PointerEvent) {
		if (!dragging || !dragRect) return;
		const p = pointerPos(e);
		dragRect = { x: dragRect.x, y: dragRect.y, w: p.x - dragRect.x, h: p.y - dragRect.y };
		paint();
	}

	async function onPointerUp(e: PointerEvent) {
		if (!dragging || !dragRect) return;
		dragging = false;
		canvas.releasePointerCapture(e.pointerId);

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

		const kind = mode === 'erase' ? 'hide' : 'reveal';
		const payload = { kind, x: x / w, y: y / h, w: rw / w, h: rh / h };
		const res = await fetch(`/c/${campaignId}/maps/${map.id}/reveal`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(payload)
		});
		if (res.ok) {
			const op = (await res.json()) as RevealOp;
			applyOp(op);
		}
	}

	onMount(() => {
		const ro = new ResizeObserver(() => paint());
		ro.observe(img);
		if (img.complete) paint();
		return () => ro.disconnect();
	});
</script>

<div class="map" bind:this={wrap}>
	{#if dm}
		<div class="toolbar">
			<button class:active={mode === 'off'} onclick={() => (mode = 'off')}>Off</button>
			<button class:active={mode === 'reveal'} onclick={() => (mode = 'reveal')}>Reveal</button>
			<button class:active={mode === 'erase'} onclick={() => (mode = 'erase')}>Erase</button>
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
