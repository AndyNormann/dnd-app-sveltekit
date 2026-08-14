import { getCampaign, getCombatUnit } from '$lib/server/db';
import { broadcast } from '$lib/server/sse';
import { isDM } from '$lib/server/auth';
import { playerCharacter } from '$lib/server/player';
import { markReady, unmarkReady, getReadyUnitIds, resetReady } from '$lib/server/combatReady';
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * Player "done / ready" signalling. A player can mark their own combat unit ready
 * (or unmark it); the DM can clear the ready list. The server keeps ready state
 * in-memory per campaign and broadcasts the full list so every combat page updates.
 */
export const POST: RequestHandler = async ({ params, request, cookies }) => {
	const c = getCampaign(params.id);
	if (!c) throw error(404, 'Campaign not found');
	const body = (await request.json()) as Record<string, unknown>;
	const unitId = String(body.unitId ?? '');

	if (body.action === 'reset') {
		if (!isDM(cookies)) throw error(401, 'DM login required');
		resetReady(params.id);
		broadcast(params.id, { type: 'combat-ready', readyIds: [] });
		return json({ ok: true });
	}

	// player marks their own unit ready/unready
	const unit = getCombatUnit(unitId);
	if (!unit || unit.campaign_id !== params.id) throw error(404, 'Unit not found');
	const me = playerCharacter(cookies);
	if (!me || me.id !== unit.character_id || unit.kind !== 'player') {
		throw error(401, 'Not your character');
	}
	if (body.ready) markReady(params.id, unitId);
	else unmarkReady(params.id, unitId);
	const readyIds = getReadyUnitIds(params.id);
	broadcast(params.id, { type: 'combat-ready', readyIds });
	return json({ ok: true, readyIds });
};
