import {
	getCampaign,
	getCombatUnit,
	listCombatUnits,
	updateCombatUnit,
	removeCombatUnit,
	getBoardConfig,
	getMovementUsed,
	setMovementUsed,
	getActiveUnitId,
	setInitiativeHpByUnit,
	listInitiative,
	getInitiativeRound
} from '$lib/server/db';
import { broadcast } from '$lib/server/sse';
import { isDM } from '$lib/server/auth';
import { playerCharacter } from '$lib/server/player';
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

function broadcastInitiative(campaignId: string) {
	broadcast(campaignId, {
		type: 'initiative-updated',
		entries: listInitiative(campaignId),
		round: getInitiativeRound(campaignId)
	});
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
	const body = (await request.json()) as Record<string, unknown>;

	if (body.action === 'remove') {
		if (!dm) throw error(401, 'DM required');
		removeCombatUnit(unit.id);
		broadcastUnits(params.id);
		return json({ ok: true });
	}

	if (body.action === 'hp') {
		if (!dm) throw error(401, 'DM required');
		const hp = Math.max(0, Math.floor(Number(body.hp) || 0));
		updateCombatUnit(unit.id, { hp });
		setInitiativeHpByUnit(unit.id, hp);
		broadcastUnits(params.id);
		broadcastInitiative(params.id);
		return json({ ok: true });
	}

	if (body.action === 'move') {
		const nx = Math.max(0, Math.floor(Number(body.x)));
		const ny = Math.max(0, Math.floor(Number(body.y)));
		const cfg = getBoardConfig(params.id);
		if (nx >= cfg.grid_cols || ny >= cfg.grid_rows) throw error(400, 'Out of bounds');

		if (dm) {
			// DM may move anything freely
			updateCombatUnit(unit.id, { x: nx, y: ny });
			broadcastUnits(params.id);
			return json({ ok: true });
		}

		// player move: own character, active turn, within speed budget
		const me = playerCharacter(cookies);
		if (!me || me.id !== unit.character_id || unit.kind !== 'player') {
			throw error(401, 'Not your character');
		}
		if (getActiveUnitId(params.id) !== unit.id) throw error(401, 'Not your turn');
		const budget = Math.floor(unit.speed / cfg.grid_scale);
		const cost = Math.abs(nx - unit.x) + Math.abs(ny - unit.y);
		const used = getMovementUsed(params.id);
		if (used + cost > budget) throw error(409, 'Movement limit reached');
		updateCombatUnit(unit.id, { x: nx, y: ny });
		setMovementUsed(params.id, used + cost);
		broadcastUnits(params.id);
		broadcast(params.id, { type: 'board-config-updated', config: getBoardConfig(params.id) });
		return json({ ok: true });
	}

	throw error(400, 'Unknown action');
};
