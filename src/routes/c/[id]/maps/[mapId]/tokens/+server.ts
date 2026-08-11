import { getCampaign, getMap, listTokens, addToken } from '$lib/server/db';
import { broadcast } from '$lib/server/sse';
import { isDM } from '$lib/server/auth';
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const in01 = (n: unknown): n is number => typeof n === 'number' && isFinite(n) && n >= 0 && n <= 1;

export const GET: RequestHandler = ({ params }) => {
	const campaign = getCampaign(params.id);
	if (!campaign) throw error(404, 'Campaign not found');
	const map = getMap(params.mapId);
	if (!map || map.campaign_id !== params.id) throw error(404, 'Map not found');
	return json(listTokens(params.mapId));
};

export const POST: RequestHandler = async ({ params, request, cookies }) => {
	if (!isDM(cookies)) throw error(401, 'DM login required');
	const campaign = getCampaign(params.id);
	if (!campaign) throw error(404, 'Campaign not found');
	const map = getMap(params.mapId);
	if (!map || map.campaign_id !== params.id) throw error(404, 'Map not found');

	const body = (await request.json()) as { label?: string; color?: string; x?: number; y?: number };
	if (!in01(body.x) || !in01(body.y)) throw error(400, 'Invalid position');
	const token = addToken(
		params.mapId,
		(body.label ?? 'Token').trim().slice(0, 40) || 'Token',
		(body.color ?? '#8b2020').slice(0, 20),
		body.x,
		body.y
	);
	broadcast(params.id, { type: 'tokens-updated', mapId: params.mapId, tokens: listTokens(params.mapId) });
	return json(token);
};
