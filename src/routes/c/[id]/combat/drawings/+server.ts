import {
	getCampaign,
	listCombatDrawings,
	addCombatDrawing,
	clearCombatDrawings,
	removeLastCombatDrawing
} from '$lib/server/db';
import { broadcast } from '$lib/server/sse';
import { isDM } from '$lib/server/auth';
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ params, cookies }) => {
	if (!isDM(cookies)) throw error(401, 'DM login required');
	const c = getCampaign(params.id);
	if (!c) throw error(404, 'Campaign not found');
	return json(listCombatDrawings(params.id));
};

export const POST: RequestHandler = async ({ params, request, cookies }) => {
	if (!isDM(cookies)) throw error(401, 'DM login required');
	const c = getCampaign(params.id);
	if (!c) throw error(404, 'Campaign not found');
	const body = (await request.json()) as Record<string, unknown>;

	if (body.action === 'clear') {
		clearCombatDrawings(params.id);
		broadcast(params.id, { type: 'combat-drawings-updated', drawings: [] });
		return json({ ok: true });
	}

	if (body.action === 'undo') {
		const removed = removeLastCombatDrawing(params.id);
		broadcast(params.id, {
			type: 'combat-drawings-updated',
			drawings: listCombatDrawings(params.id)
		});
		return json({ ok: true, removed });
	}

	const color = String(body.color ?? '#222').slice(0, 20);
	const width = Math.max(1, Number(body.width) || 4);
	const mode = body.mode === 'erase' ? 'erase' : 'draw';
	const pts = Array.isArray(body.points) ? (body.points as [number, number][]) : [];
	if (!pts.length) throw error(400, 'No points');
	const capped = pts.map(([x, y]) => [
		Number(x) || 0,
		Number(y) || 0
	] as [number, number]);
	const drawing = addCombatDrawing(params.id, color, width, mode, capped);
	broadcast(params.id, {
		type: 'combat-drawings-updated',
		drawings: listCombatDrawings(params.id)
	});
	return json(drawing);
};
