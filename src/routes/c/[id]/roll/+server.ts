import { addRoll, getCampaign } from '$lib/server/db';
import { broadcast } from '$lib/server/sse';
import { rollDice } from '$lib/dice';
import { isDM } from '$lib/server/auth';
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { RollData } from '$lib/types';

export const POST: RequestHandler = async ({ params, request, cookies }) => {
	const campaign = getCampaign(params.id);
	if (!campaign) throw error(404, 'Campaign not found');

	const body = (await request.json()) as {
		roller?: string;
		expression?: string;
		secret?: boolean;
		label?: string;
	};
	const roller = (body.roller ?? '').trim().slice(0, 40) || 'Anonymous';
	const expression = (body.expression ?? '').trim().slice(0, 100);
	const label = (body.label ?? '').trim().slice(0, 80);
	const secret = !!body.secret;
	// Secret rolls are only for the DM.
	if (secret && !isDM(cookies)) throw error(401, 'Secret rolls require DM');

	const result = rollDice(expression);
	if (!result) throw error(400, 'Invalid dice expression');

	const row = addRoll(
		params.id,
		roller,
		expression,
		result.total,
		result.breakdown,
		secret,
		label || undefined
	);
	const roll: RollData = {
		id: row.id,
		roller: row.roller,
		expression: row.expression,
		result: row.result,
		breakdown: row.breakdown,
		secret: !!row.secret,
		label: row.label ?? undefined,
		created_at: row.created_at
	};

	if (!secret) broadcast(params.id, { type: 'roll', roll });

	return json(roll);
};
