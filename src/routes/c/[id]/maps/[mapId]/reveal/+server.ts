import { getCampaign, getMap, addReveal } from '$lib/server/db';
import { broadcast } from '$lib/server/sse';
import { isDM } from '$lib/server/auth';
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const in01 = (n: unknown): n is number => typeof n === 'number' && isFinite(n) && n >= 0 && n <= 1;

/** Drop points closer than minDist to the previously kept point. */
function downsample(path: [number, number][], minDist: number): [number, number][] {
	const out: [number, number][] = [path[0]];
	for (const p of path.slice(1)) {
		const last = out[out.length - 1];
		if (Math.hypot(p[0] - last[0], p[1] - last[1]) >= minDist) out.push(p);
	}
	// keep the stroke's endpoint so it doesn't fall short
	const tail = path[path.length - 1];
	const last = out[out.length - 1];
	if (tail !== last && (tail[0] !== last[0] || tail[1] !== last[1])) out.push(tail);
	return out;
}

export const POST: RequestHandler = async ({ params, request, cookies }) => {
	if (!isDM(cookies)) throw error(401, 'DM login required');
	const campaign = getCampaign(params.id);
	if (!campaign) throw error(404, 'Campaign not found');
	const map = getMap(params.mapId);
	if (!map || map.campaign_id !== params.id) throw error(404, 'Map not found');

	const body = (await request.json()) as {
		kind: 'reveal' | 'hide';
		shape?: 'rect' | 'brush';
		x?: number;
		y?: number;
		w?: number;
		h?: number;
		path?: [number, number][];
		radius?: number;
		layer?: number;
	};
	if (body.kind !== 'reveal' && body.kind !== 'hide') throw error(400, 'Invalid kind');

	const shape = body.shape ?? 'rect';
	const layer = Math.max(0, Math.min(9, Math.floor(body.layer ?? 0)));
	let op;
	if (shape === 'brush') {
		const { path, radius } = body;
		if (
			!Array.isArray(path) ||
			path.length < 1 ||
			path.length > 2000 ||
			!path.every((p) => Array.isArray(p) && p.length === 2 && in01(p[0]) && in01(p[1]))
		) {
			throw error(400, 'Invalid brush path');
		}
		if (typeof radius !== 'number' || radius < 0.001 || radius > 0.25) {
			throw error(400, 'Invalid brush radius');
		}
		op = addReveal(
			params.mapId,
			body.kind,
			{
				shape: 'brush',
				path: downsample(path, radius / 3),
				radius
			},
			layer
		);
	} else {
		const { x, y, w, h } = body;
		if (!in01(x) || !in01(y) || !in01(w) || !in01(h)) throw error(400, 'Invalid rect');
		op = addReveal(params.mapId, body.kind, { shape: 'rect', x, y, w, h }, layer);
	}

	broadcast(params.id, {
		type: body.kind === 'reveal' ? 'map-revealed' : 'map-hidden',
		mapId: params.mapId,
		op
	});

	return json(op);
};
