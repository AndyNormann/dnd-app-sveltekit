import {
	getCampaign,
	getCombatUnit,
	listCombatUnits,
	updateCombatUnit,
	removeCombatUnit,
	getBoardConfig,
	setUnitMovementUsed,
	getActiveUnitId,
	setInitiativeHpByUnit,
	listInitiative,
	getInitiativeRound,
	addCombatLog
} from '$lib/server/db';
import { broadcast } from '$lib/server/sse';
import { isDM } from '$lib/server/auth';
import { playerCharacter } from '$lib/server/player';
import { moveBudget, moveCost, isOwnTurn } from '$lib/combatRules';
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
		const me = playerCharacter(cookies);
		const isPlayerForUnit = !!(me && me.id === unit.character_id && unit.kind === 'player');
		if (!dm && !isPlayerForUnit) throw error(401, 'DM or your own unit required');
		const max = unit.max_hp > 0 ? unit.max_hp : Infinity;
		const hp = Math.max(0, Math.min(max, Math.floor(Number(body.hp) || 0)));
		const delta = hp - unit.hp;
		updateCombatUnit(unit.id, { hp });
		setInitiativeHpByUnit(unit.id, hp);
		// record notable HP transitions in the combat log
		const down = unit.hp > 0 && hp === 0;
		const back = unit.hp === 0 && hp > 0;
		let log: string | null = null;
		if (down) log = `${unit.name} is down`;
		else if (back) log = `${unit.name} is back up`;
		else if (delta > 0) log = `${unit.name} heals ${delta} → ${hp}${unit.max_hp ? `/${unit.max_hp}` : ''}`;
		else if (delta < 0) log = `${unit.name} takes ${-delta} → ${hp}${unit.max_hp ? `/${unit.max_hp}` : ''}`;
		if (log) {
			const entry = addCombatLog(params.id, log);
			broadcast(params.id, { type: 'combat-log', entry });
		}
		broadcastUnits(params.id);
		broadcastInitiative(params.id);
		return json({ ok: true, hp, alive: hp > 0 ? 1 : 0, delta });
	}

	if (body.action === 'conditions') {
		if (!dm) throw error(401, 'DM required');
		const conditions = String(body.conditions ?? '').slice(0, 300);
		updateCombatUnit(unit.id, { conditions });
		broadcastUnits(params.id);
		return json({ ok: true, conditions });
	}

	if (body.action === 'move') {
		const nx = Math.max(0, Math.floor(Number(body.x)));
		const ny = Math.max(0, Math.floor(Number(body.y)));
		const cfg = getBoardConfig(params.id);
		if (nx >= cfg.grid_cols || ny >= cfg.grid_rows) throw error(400, 'Out of bounds');

		// A valid player cookie for THIS unit means the actor is that player (even if a
		// DM session is also present in the same browser), so the movement budget applies.
		const me = playerCharacter(cookies);
		const isPlayerForUnit = !!(me && me.id === unit.character_id && unit.kind === 'player');

		if (dm && !isPlayerForUnit) {
			// DM may move anything freely (no player identity acting for this unit)
			updateCombatUnit(unit.id, { x: nx, y: ny });
			broadcastUnits(params.id);
			return json({ ok: true });
		}

		// player move: own character, active turn, within speed budget
		if (!isPlayerForUnit) {
			throw error(401, 'Not your character');
		}
		if (!isOwnTurn(unit.id, getActiveUnitId(params.id))) throw error(401, 'Not your turn');
		const budget = moveBudget(unit.speed, cfg.grid_scale);
		const cost = moveCost({ x: unit.x, y: unit.y }, { x: nx, y: ny });
		const used = unit.movement_used;
		if (used + cost > budget) throw error(409, 'Movement limit reached');
		updateCombatUnit(unit.id, { x: nx, y: ny });
		const newUsed = used + cost;
		setUnitMovementUsed(unit.id, newUsed);
		broadcastUnits(params.id);
		return json({ ok: true, used: newUsed, budget });
	}

	throw error(400, 'Unknown action');
};
