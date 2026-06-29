import { getCampaign, getMap, addReveal } from '$lib/server/db';
import { broadcast } from '$lib/server/sse';
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, request }) => {
	const campaign = getCampaign(params.id);
	if (!campaign) throw error(404, 'Campaign not found');
	const map = getMap(params.mapId);
	if (!map || map.campaign_id !== params.id) throw error(404, 'Map not found');

	const body = (await request.json()) as {
		kind: 'reveal' | 'hide';
		x: number;
		y: number;
		w: number;
		h: number;
	};
	if (body.kind !== 'reveal' && body.kind !== 'hide') throw error(400, 'Invalid kind');

	const op = addReveal(params.mapId, body.kind, {
		x: body.x,
		y: body.y,
		w: body.w,
		h: body.h
	});

	broadcast(params.id, {
		type: body.kind === 'reveal' ? 'map-revealed' : 'map-hidden',
		mapId: params.mapId,
		op
	});

	return json(op);
};
