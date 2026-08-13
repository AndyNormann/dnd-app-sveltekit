import { getCampaign, listInitiative } from '$lib/server/db';
import { broadcast } from '$lib/server/sse';
import { isDM } from '$lib/server/auth';
import { rollInitiative, advanceTurn, clearCombat } from '$lib/server/combat';
import { emitInitiative } from '$lib/server/feed';
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ params }) => {
	const campaign = getCampaign(params.id);
	if (!campaign) throw error(404, 'Campaign not found');
	return json(listInitiative(params.id));
};

export const POST: RequestHandler = async ({ params, request, cookies }) => {
	if (!isDM(cookies)) throw error(401, 'DM login required');
	const campaign = getCampaign(params.id);
	if (!campaign) throw error(404, 'Campaign not found');

	const body = (await request.json()) as { action?: string };

	let result;
	if (body.action === 'clear') result = clearCombat(params.id);
	else if (body.action === 'roll') result = rollInitiative(params.id);
	else if (body.action === 'next') result = advanceTurn(params.id);
	else throw error(400, 'Unknown action');

	if (result.data.log) broadcast(params.id, { type: 'combat-log', entry: result.data.log });
	emitInitiative(params.id);
	return json({ ok: true });
};
