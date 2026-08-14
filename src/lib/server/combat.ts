import {
	getCombatUnit,
	updateCombatUnit,
	removeCombatUnit,
	setUnitMovementUsed,
	setInitiativeHpByUnit,
	listCombatUnits,
	listCharacters,
	addCombatUnit,
	listInitiative,
	updateInitiative,
	addInitiative,
	clearInitiative,
	removeInitiative,
	clearCombatDrawings,
	getInitiativeRound,
	setInitiativeRound,
	resetAllMovement,
	getBoardConfig,
	getActiveUnitId,
	addCombatLog,
	type CombatUnit,
	type InitEntry,
	type CombatLogEntry
} from './db';
import { moveBudget, moveCost, isOwnTurn, isDown as unitIsDown, applyHpDelta } from '$lib/combatRules';
import { resetReady } from './combatReady';

/**
 * Deep module owning the combat-session rules: rolling initiative, advancing the
 * turn (skipping the dead, wrapping the round), applying HP/damage, moving a unit
 * within its speed budget, and clearing the board. Route handlers become thin
 * adapters that resolve an actor from cookies, call these, and broadcast.
 *
 * Functions return an `Outcome` (no SvelteKit imports) so they are unit-testable
 * directly and let the route translate failures into HTTP errors.
 */

export interface CombatActor {
	isDm: boolean;
	/** true when the actor is the player who owns this specific unit (wins over a DM session). */
	playerForUnit: boolean;
}

type Outcome<T> = { ok: true; data: T } | { ok: false; error: { status: number; msg: string } };
type Success<T> = { ok: true; data: T };

const ok = <T>(data: T): Success<T> => ({ ok: true, data });

function notFound(): Outcome<never> {
	return { ok: false, error: { status: 404, msg: 'Unit not found' } };
}
function deny(status: number, msg: string): Outcome<never> {
	return { ok: false, error: { status, msg } };
}

export function broadcastInitiativePayload(campaignId: string) {
	return { entries: listInitiative(campaignId), round: getInitiativeRound(campaignId) };
}

/**
 * Ensure every character has a player token on the board. Called on character
 * creation and before rolling initiative so players are always present (the
 * DM no longer adds them manually). Returns the newly added units.
 */
export function syncCharactersToBoard(campaignId: string): CombatUnit[] {
	const chars = listCharacters(campaignId);
	const units = listCombatUnits(campaignId);
	const present = new Set(
		units.filter((u) => u.kind === 'player' && u.character_id).map((u) => u.character_id)
	);
	const cfg = getBoardConfig(campaignId);
	let idx = units.length;
	const added: CombatUnit[] = [];
	for (const ch of chars) {
		if (present.has(ch.id)) continue;
		const x = ((idx % 12) * 2) + 1;
		const y = cfg.grid_rows - 3;
		added.push(
			addCombatUnit(campaignId, {
				kind: 'player',
				character_id: ch.id,
				name: ch.name,
				color: ch.color,
				speed: ch.speed,
				init_bonus: ch.init_bonus,
				hp: ch.hp,
				max_hp: ch.max_hp,
				x,
				y
			})
		);
		idx++;
	}
	return added;
}

/** Remove a character's player token(s) from the board (e.g. when deleted). */
export function removeCharacterFromBoard(campaignId: string, characterId: string): number {
	const units = listCombatUnits(campaignId).filter((u) => u.character_id === characterId);
	for (const u of units) removeCombatUnit(u.id);
	return units.length;
}

/** Roll d20 + init bonus for every combat unit, order the turn list, start round 1. */
export function rollInitiative(
	campaignId: string
): Success<{ entries: InitEntry[]; round: number; log: CombatLogEntry }> {
	const units = listCombatUnits(campaignId);
	clearInitiative(campaignId);
	const rolls = units
		.map((u) => ({ unit: u, init: Math.floor(Math.random() * 20) + 1 + u.init_bonus }))
		.sort((a, b) => b.init - a.init);
	rolls.forEach((r, i) => {
		const e = addInitiative(campaignId, r.unit.name, r.init, r.unit.hp, r.unit.id);
		if (i === 0) updateInitiative(e.id, { active: 1 });
	});
	setInitiativeRound(campaignId, 1);
	resetAllMovement(campaignId);
	resetReady(campaignId);
	const log = addCombatLog(campaignId, '🎲 Initiative rolled — Round 1');
	return ok({ entries: listInitiative(campaignId), round: 1, log });
}

/** Advance to the next living combatant, skipping the dead, wrapping and incrementing the round. */
export function advanceTurn(
	campaignId: string
): Success<{ entries: InitEntry[]; round: number; log: CombatLogEntry | null }> {
	const entries: InitEntry[] = listInitiative(campaignId);
	if (!entries.length) {
		return ok({ entries, round: getInitiativeRound(campaignId), log: null });
	}
	const units = listCombatUnits(campaignId);
	const isDown = (e: InitEntry) => {
		if (!e.unit_id) return false; // manual combatant always acts
		return unitIsDown(units.find((x) => x.id === e.unit_id));
	};
	const activeIndex = entries.findIndex((e) => e.active === 1);
	let nextIndex = activeIndex;
	let roundInc = 0;
	for (let step = 0; step < entries.length; step++) {
		nextIndex = (nextIndex + 1) % entries.length;
		if (nextIndex === 0) roundInc = 1; // wrapped past the last combatant
		if (!isDown(entries[nextIndex])) break;
	}
	const round = getInitiativeRound(campaignId) + roundInc;
	for (const e of entries) updateInitiative(e.id, { active: 0 });
	updateInitiative(entries[nextIndex].id, { active: 1 });
	setInitiativeRound(campaignId, round);
	resetAllMovement(campaignId);
	resetReady(campaignId);
	const log = addCombatLog(
		campaignId,
		roundInc === 1
			? `— Round ${round}: ${entries[nextIndex].name}'s turn —`
			: `${entries[nextIndex].name}'s turn`
	);
	return ok({ entries: listInitiative(campaignId), round, log });
}

/** Wipe the initiative list and reset the round counter to 1. */
export function clearCombat(campaignId: string): Success<{ entries: InitEntry[]; round: number; log: null }> {
	clearInitiative(campaignId);
	setInitiativeRound(campaignId, 1);
	return ok({ entries: listInitiative(campaignId), round: 1, log: null });
}

/** Clear every unit, movement, initiative and the round — a fresh board. */
export function clearBoard(
	campaignId: string
): Success<{ entries: InitEntry[]; round: number; log: CombatLogEntry }> {
	// players are always on the board: keep player tokens, drop enemies and drawings
	const units = listCombatUnits(campaignId);
	for (const u of units) {
		if (u.kind !== 'player') removeCombatUnit(u.id);
	}
	syncCharactersToBoard(campaignId);
	clearCombatDrawings(campaignId);
	// drop initiative entries pointing at now-removed (enemy) units, keep players
	const unitIds = new Set(listCombatUnits(campaignId).map((u) => u.id));
	for (const e of listInitiative(campaignId)) {
		if (e.unit_id && !unitIds.has(e.unit_id)) removeInitiative(e.id);
	}
	resetAllMovement(campaignId);
	setInitiativeRound(campaignId, 1);
	const log = addCombatLog(campaignId, '🗑 Board cleared');
	return ok({ entries: listInitiative(campaignId), round: 1, log });
}

/** Set a unit's HP (DM or the unit's own player), recording down/heal/damage log lines. */
export function setHp(
	unitId: string,
	rawHp: number,
	actor: CombatActor
): Outcome<{ unit: CombatUnit; hp: number; alive: number; delta: number; log: CombatLogEntry | null }> {
	const unit = getCombatUnit(unitId);
	if (!unit) return notFound();
	if (!actor.isDm && !actor.playerForUnit) return deny(401, 'DM or your own unit required');
	const max = unit.max_hp > 0 ? unit.max_hp : Infinity;
	const next = Math.max(0, Math.min(max, Math.floor(rawHp)));
	const delta = next - unit.hp;
	updateCombatUnit(unit.id, { hp: next });
	setInitiativeHpByUnit(unit.id, next);
	const down = unit.hp > 0 && next === 0;
	const back = unit.hp === 0 && next > 0;
	let text: string | null = null;
	if (down) text = `${unit.name} is down`;
	else if (back) text = `${unit.name} is back up`;
	else if (delta > 0) text = `${unit.name} heals ${delta} → ${next}${unit.max_hp ? `/${unit.max_hp}` : ''}`;
	else if (delta < 0) text = `${unit.name} takes ${-delta} → ${next}${unit.max_hp ? `/${unit.max_hp}` : ''}`;
	let log: CombatLogEntry | null = null;
	if (text) log = addCombatLog(unit.campaign_id, text);
	return ok({ unit: getCombatUnit(unitId)!, hp: next, alive: next > 0 ? 1 : 0, delta, log });
}

/** Move a unit. DM moves anything freely; a player only their own unit, on their turn, within budget. */
export function moveUnit(
	unitId: string,
	x: number,
	y: number,
	actor: CombatActor
): Outcome<{ used?: number; budget: number }> {
	const unit = getCombatUnit(unitId);
	if (!unit) return notFound();
	const cfg = getBoardConfig(unit.campaign_id);
	const nx = Math.max(0, Math.floor(x));
	const ny = Math.max(0, Math.floor(y));
	if (nx >= cfg.grid_cols || ny >= cfg.grid_rows) return deny(400, 'Out of bounds');

	if (actor.isDm && !actor.playerForUnit) {
		updateCombatUnit(unit.id, { x: nx, y: ny });
		return ok({ budget: moveBudget(unit.speed, cfg.grid_scale) });
	}
	if (!actor.playerForUnit) return deny(401, 'Not your character');
	if (!isOwnTurn(unit.id, getActiveUnitId(unit.campaign_id))) return deny(401, 'Not your turn');
	const budget = moveBudget(unit.speed, cfg.grid_scale);
	const cost = moveCost({ x: unit.x, y: unit.y }, { x: nx, y: ny });
	const used = unit.movement_used;
	if (used + cost > budget) return deny(409, 'Movement limit reached');
	updateCombatUnit(unit.id, { x: nx, y: ny });
	const newUsed = used + cost;
	setUnitMovementUsed(unit.id, newUsed);
	return ok({ used: newUsed, budget });
}

/** Set a unit's comma-separated conditions/status markers (DM only). */
export function setConditions(
	unitId: string,
	raw: string,
	actor: CombatActor
): Outcome<{ unit: CombatUnit }> {
	const unit = getCombatUnit(unitId);
	if (!unit) return notFound();
	if (!actor.isDm) return deny(401, 'DM required');
	updateCombatUnit(unit.id, { conditions: String(raw).slice(0, 300) });
	return ok({ unit: getCombatUnit(unitId)! });
}

/** Remove a unit from the board (DM only). */
export function removeUnit(unitId: string, actor: CombatActor): Outcome<{ unitId: string }> {
	const unit = getCombatUnit(unitId);
	if (!unit) return notFound();
	if (!actor.isDm) return deny(401, 'DM required');
	removeCombatUnit(unitId);
	return ok({ unitId });
}

/** Convenience for damage: apply a signed HP change via the rules module. */
export function damageUnit(unitId: string, amount: number, actor: CombatActor) {
	const unit = getCombatUnit(unitId);
	if (!unit) return notFound();
	return setHp(unitId, applyHpDelta(unit.hp, amount, unit.max_hp), actor);
}

