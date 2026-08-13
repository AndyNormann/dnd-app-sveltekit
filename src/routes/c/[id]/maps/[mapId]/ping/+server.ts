import { getCampaign, getMap } from '$lib/server/db';
import { broadcast } from '$lib/server/sse';
import { pingIdentity } from '$lib/server/player';
import { error, json } from '@sveltejs/kit';
import { nanoid } from 'nanoid';
import type { RequestHandler } from './$types';

/** A temporary ping on a notes-view map, relayed to everyone (GM + players). */
export const POST: RequestHandler = async ({ params, request, cookies }) => {
	const campaign = getCampaign(params.id);
	if (!campaign) throw error(404, 'Campaign not found');
	const map = getMap(params.mapId);
	if (!map || map.campaign_id !== params.id) throw error(404, 'Map not found');

	const body = (await request.json()) as { x?: number; y?: number };
	const x = Number(body.x);
	const y = Number(body.y);
	if (!Number.isFinite(x) || !Number.isFinite(y)) throw error(400, 'Invalid coordinates');

	const idn = pingIdentity(cookies);
	const ping = { id: nanoid(8), x, y, color: idn.color, name: idn.name };
	broadcast(params.id, { type: 'map-ping', mapId: params.mapId, ping });
	return json({ ok: true });
};
