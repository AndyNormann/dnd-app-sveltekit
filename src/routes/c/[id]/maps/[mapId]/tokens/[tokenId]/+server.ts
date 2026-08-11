import {
	getCampaign,
	getMap,
	listTokens,
	getToken,
	updateToken,
	removeToken
} from '$lib/server/db';
import { broadcast } from '$lib/server/sse';
import { isDM } from '$lib/server/auth';
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const in01 = (n: unknown): n is number => typeof n === 'number' && isFinite(n) && n >= 0 && n <= 1;

export const POST: RequestHandler = async ({ params, request, cookies }) => {
	if (!isDM(cookies)) throw error(401, 'DM login required');
	const campaign = getCampaign(params.id);
	if (!campaign) throw error(404, 'Campaign not found');
	const map = getMap(params.mapId);
	if (!map || map.campaign_id !== params.id) throw error(404, 'Map not found');

	const body = (await request.json()) as { action?: string; x?: number; y?: number; label?: string };
	// scope: the token must belong to this map
	const existing = getToken(params.tokenId);
	if (!existing || existing.map_id !== params.mapId) throw error(404, 'Token not found');

	if (body.action === 'remove') {
		removeToken(params.tokenId);
	} else {
		const patch: { x?: number; y?: number; label?: string } = {};
		if (in01(body.x)) patch.x = body.x;
		if (in01(body.y)) patch.y = body.y;
		if (typeof body.label === 'string') patch.label = body.label.trim().slice(0, 40);
		const updated = updateToken(params.tokenId, patch);
		if (!updated) throw error(404, 'Token not found');
	}

	broadcast(params.id, {
		type: 'tokens-updated',
		mapId: params.mapId,
		tokens: listTokens(params.mapId)
	});
	return json({ ok: true });
};
