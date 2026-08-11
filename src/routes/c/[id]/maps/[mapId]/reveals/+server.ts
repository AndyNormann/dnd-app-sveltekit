import { getCampaign, getMap, removeLastReveal, clearLayerReveals } from '$lib/server/db';
import { broadcast } from '$lib/server/sse';
import { isDM } from '$lib/server/auth';
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, request, cookies }) => {
	if (!isDM(cookies)) throw error(401, 'DM login required');
	const campaign = getCampaign(params.id);
	if (!campaign) throw error(404, 'Campaign not found');
	const map = getMap(params.mapId);
	if (!map || map.campaign_id !== params.id) throw error(404, 'Map not found');

	const body = (await request.json()) as { action?: string; layer?: number };
	const layer = Math.max(0, Math.floor(body.layer ?? 0));

	if (body.action === 'undo') {
		// recover from an accidental reveal by removing the newest op on this layer
		const opId = removeLastReveal(params.mapId, layer);
		if (opId !== null) {
			broadcast(params.id, { type: 'reveal-undone', mapId: params.mapId, layer, opId });
		}
		return json({ ok: true, opId });
	}

	if (body.action === 'clear') {
		// wipe this layer's entire fog so the DM can repaint from scratch
		const removed = clearLayerReveals(params.mapId, layer);
		if (removed > 0) {
			broadcast(params.id, { type: 'reveals-cleared', mapId: params.mapId, layer });
		}
		return json({ ok: true, removed });
	}

	throw error(400, 'Unknown action');
};
