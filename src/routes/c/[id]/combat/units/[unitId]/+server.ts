import { getCampaign, getCombatUnit, listCombatUnits } from '$lib/server/db';
import { broadcast } from '$lib/server/sse';
import { isDM } from '$lib/server/auth';
import { playerCharacter } from '$lib/server/player';
import {
	removeUnit,
	setHp,
	setConditions,
	moveUnit,
	broadcastInitiativePayload,
	type CombatActor
} from '$lib/server/combat';
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

function broadcastInitiative(campaignId: string) {
	broadcast(campaignId, { type: 'initiative-updated', ...broadcastInitiativePayload(campaignId) });
}
function broadcastUnits(campaignId: string) {
	broadcast(campaignId, { type: 'combat-units-updated', units: listCombatUnits(campaignId) });
}

export const POST: RequestHandler = async ({ params, request, cookies }) => {
	const c = getCampaign(params.id);
	if (!c) throw error(404, 'Campaign not found');
	const unit = getCombatUnit(params.unitId);
	if (!unit || unit.campaign_id !== params.id) throw error(404, 'Unit not found');

	const dm = isDM(cookies);
	const me = playerCharacter(cookies);
	const actor: CombatActor = {
		isDm: dm,
		playerForUnit: !!(me && me.id === unit.character_id && unit.kind === 'player')
	};

	const body = (await request.json()) as Record<string, unknown>;

	if (body.action === 'remove') {
		const r = removeUnit(unit.id, actor);
		if (!r.ok) throw error(r.error.status, r.error.msg);
		broadcastUnits(params.id);
		return json({ ok: true });
	}

	if (body.action === 'hp') {
		const r = setHp(unit.id, Number(body.hp) || 0, actor);
		if (!r.ok) throw error(r.error.status, r.error.msg);
		if (r.data.log) broadcast(params.id, { type: 'combat-log', entry: r.data.log });
		broadcastUnits(params.id);
		broadcastInitiative(params.id);
		return json({ ok: true, hp: r.data.hp, alive: r.data.alive, delta: r.data.delta });
	}

	if (body.action === 'conditions') {
		const r = setConditions(unit.id, String(body.conditions ?? ''), actor);
		if (!r.ok) throw error(r.error.status, r.error.msg);
		broadcastUnits(params.id);
		return json({ ok: true, conditions: r.data.unit.conditions });
	}

	if (body.action === 'move') {
		const r = moveUnit(unit.id, Number(body.x), Number(body.y), actor);
		if (!r.ok) throw error(r.error.status, r.error.msg);
		broadcastUnits(params.id);
		return json({ ok: true, ...r.data });
	}

	throw error(400, 'Unknown action');
};
