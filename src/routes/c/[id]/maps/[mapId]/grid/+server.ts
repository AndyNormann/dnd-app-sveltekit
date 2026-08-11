import { getCampaign, getMap, setMapGrid } from '$lib/server/db';
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

	const body = (await request.json()) as { grid_size?: number };
	const grid = Math.max(0, Math.min(200, Math.floor(Number(body.grid_size) || 0)));
	setMapGrid(params.mapId, grid);
	broadcast(params.id, { type: 'grid-updated', mapId: params.mapId, grid_size: grid });
	return json({ ok: true, grid_size: grid });
};
