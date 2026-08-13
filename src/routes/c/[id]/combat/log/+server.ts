import { getCampaign, addCombatLog } from '$lib/server/db';
import { broadcast } from '$lib/server/sse';
import { isDM } from '$lib/server/auth';
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/** Append a DM-authored line to the combat log (e.g. an attack result). */
export const POST: RequestHandler = async ({ params, request, cookies }) => {
	if (!isDM(cookies)) throw error(401, 'DM login required');
	const c = getCampaign(params.id);
	if (!c) throw error(404, 'Campaign not found');
	const body = (await request.json()) as { text?: string };
	const text = String(body.text ?? '').trim().slice(0, 300);
	if (!text) throw error(400, 'Text required');
	const entry = addCombatLog(params.id, text);
	broadcast(params.id, { type: 'combat-log', entry });
	return json({ ok: true, entry });
};
