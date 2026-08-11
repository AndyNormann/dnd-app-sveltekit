import { getCampaign, getMap, setMapLayer } from '$lib/server/db';
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

	const body = (await request.json()) as { layer?: number };
	const layer = Math.max(0, Math.min(9, Math.floor(Number(body.layer) || 0)));
	setMapLayer(params.mapId, layer);
	broadcast(params.id, { type: 'layer-changed', mapId: params.mapId, layer });
	return json({ ok: true, layer });
};
