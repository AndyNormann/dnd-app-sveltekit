import { getCampaign, getRoll, unsecretRoll } from '$lib/server/db';
import { broadcast } from '$lib/server/sse';
import { isDM } from '$lib/server/auth';
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { RollData } from '$lib/types';

export const POST: RequestHandler = async ({ params, request, cookies }) => {
	if (!isDM(cookies)) throw error(401, 'DM login required');
	const campaign = getCampaign(params.id);
	if (!campaign) throw error(404, 'Campaign not found');

	const rollId = Number(params.rollId);
	const existing = getRoll(rollId);
	if (!existing || existing.campaign_id !== params.id) throw error(404, 'Roll not found');

	const body = (await request.json()) as { action?: string };
	if (body.action !== 'reveal') throw error(400, 'Unknown action');

	const row = unsecretRoll(rollId)!;
	const roll: RollData = {
		id: row.id,
		roller: row.roller,
		expression: row.expression,
		result: row.result,
		breakdown: row.breakdown,
		secret: false,
		label: row.label ?? undefined,
		created_at: row.created_at
	};

	// push it to players (and update the DM's own entry in place)
	broadcast(params.id, { type: 'roll', roll });

	return json(roll);
};
