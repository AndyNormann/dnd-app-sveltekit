import { getCampaign } from '$lib/server/db';
import { broadcast } from '$lib/server/sse';
import { pingIdentity } from '$lib/server/player';
import { error, json } from '@sveltejs/kit';
import { nanoid } from 'nanoid';
import type { RequestHandler } from './$types';

/** A temporary ping on the combat board, relayed to everyone (GM + players). x/y are cell coords. */
export const POST: RequestHandler = async ({ params, request, cookies }) => {
	const campaign = getCampaign(params.id);
	if (!campaign) throw error(404, 'Campaign not found');

	const body = (await request.json()) as { x?: number; y?: number };
	const x = Number(body.x);
	const y = Number(body.y);
	if (!Number.isFinite(x) || !Number.isFinite(y)) throw error(400, 'Invalid coordinates');

	const idn = pingIdentity(cookies);
	const ping = { id: nanoid(8), x, y, color: idn.color, name: idn.name };
	broadcast(params.id, { type: 'combat-ping', ping });
	return json({ ok: true });
};
