import {
	getCampaign,
	listEncounters,
	saveEncounter,
	getEncounter,
	deleteEncounter,
	listCombatUnits,
	listCombatDrawings,
	clearCombatUnits,
	clearCombatDrawings,
	clearInitiative,
	setInitiativeRound,
	resetAllMovement,
	restoreCombatUnit,
	restoreCombatDrawing
} from '$lib/server/db';
import { broadcast } from '$lib/server/sse';
import { emitInitiative, emitUnits } from '$lib/server/feed';
import { isDM } from '$lib/server/auth';
import { resetReady } from '$lib/server/combatReady';
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ params, cookies }) => {
	if (!isDM(cookies)) throw error(401, 'DM login required');
	const c = getCampaign(params.id);
	if (!c) throw error(404, 'Campaign not found');
	return json(listEncounters(params.id));
};

export const POST: RequestHandler = async ({ params, request, cookies }) => {
	if (!isDM(cookies)) throw error(401, 'DM login required');
	const c = getCampaign(params.id);
	if (!c) throw error(404, 'Campaign not found');
	const body = (await request.json()) as Record<string, unknown>;

	if (body.action === 'save') {
		const name = String(body.name ?? '').trim().slice(0, 60);
		if (!name) throw error(400, 'Name required');
		const unit = saveEncounter(
			params.id,
			name,
			listCombatUnits(params.id),
			listCombatDrawings(params.id)
		);
		return json(unit);
	}

	if (body.action === 'load') {
		const enc = getEncounter(String(body.id ?? ''));
		if (!enc || enc.campaign_id !== params.id) throw error(404, 'Encounter not found');
		// fresh run: wipe the current board + initiative, restore the saved setup
		clearCombatUnits(params.id);
		clearCombatDrawings(params.id);
		clearInitiative(params.id);
		setInitiativeRound(params.id, 1);
		resetAllMovement(params.id);
		resetReady(params.id);
		for (const u of enc.units) restoreCombatUnit(u);
		for (const d of enc.drawings) restoreCombatDrawing(d);
		emitUnits(params.id);
		emitInitiative(params.id);
		broadcast(params.id, {
			type: 'combat-drawings-updated',
			drawings: listCombatDrawings(params.id)
		});
		return json({ ok: true });
	}

	if (body.action === 'delete') {
		const enc = getEncounter(String(body.id ?? ''));
		if (!enc || enc.campaign_id !== params.id) throw error(404, 'Encounter not found');
		deleteEncounter(enc.id);
		return json({ ok: true });
	}

	throw error(400, 'Unknown action');
};
