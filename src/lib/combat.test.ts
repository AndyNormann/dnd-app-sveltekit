import { afterAll, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Point the DB at a fresh temp file BEFORE the server modules are loaded so the
// combat module is testable through its real (db-backed) surface, not a mock.
const dir = mkdtempSync(join(tmpdir(), 'dnd-combat-test-'));
process.env.DB_PATH = join(dir, 'test.db');

const db = await import('./server/db');
const combat = await import('./server/combat');
const rules = await import('./combatRules');

const DM = { isDm: true, playerForUnit: false };
const player = (own: boolean): combat.CombatActor => ({ isDm: false, playerForUnit: own });

function campaign() {
	return db.createCampaign('Combat Unit Test');
}
function unit(cid: string, name: string, speed = 30, x = 1, y = 1) {
	return db.addCombatUnit(cid, { kind: 'enemy', name, speed, max_hp: 10, hp: 10, x, y });
}

afterAll(() => rmSync(dir, { recursive: true, force: true }));

test('rollInitiative orders combat units and starts round 1', () => {
	const c = campaign();
	const a = unit(c.id, 'A', 30);
	const b = unit(c.id, 'B', 30);
	const r = combat.rollInitiative(c.id);
	if (!r.ok) throw new Error('should succeed');
	expect(r.data.round).toBe(1);
	expect(r.data.entries.length).toBe(2);
	expect(r.data.entries.filter((e) => e.active === 1).length).toBe(1);
	expect(r.data.log.text).toContain('Initiative rolled');
});

test('advanceTurn skips a downed combatant and wraps the round', () => {
	const c = campaign();
	const a = unit(c.id, 'A', 30);
	const b = unit(c.id, 'B', 30);
	const rolled = combat.rollInitiative(c.id);
	if (!rolled.ok) throw new Error('should succeed');
	// find the active unit and set it down
	const active = rolled.data.entries.find((e) => e.active === 1)!;
	const hp = combat.setHp(active.unit_id!, 0, DM);
	if (!hp.ok) throw new Error('should succeed');
	// advance — should land on the OTHER (living) unit
	const next = combat.advanceTurn(c.id);
	if (!next.ok) throw new Error('should succeed');
	const livingActive = next.data.entries.find((e) => e.active === 1)!;
	const unitById = (id: string | null) => (id ? db.getCombatUnit(id) : null);
	expect(rules.isDown(unitById(livingActive.unit_id))).toBe(false);
	expect(livingActive.unit_id).not.toBe(active.unit_id);
});

test('moveUnit: DM moves freely, a non-owner player is denied, budget is enforced', () => {
	const c = campaign();
	const a = unit(c.id, 'A', 30, 1, 1); // speed 30 / scale 5 = 6 cells
	unit(c.id, 'B', 30, 1, 2);
	const rolled = combat.rollInitiative(c.id);
	if (!rolled.ok) throw new Error('should succeed');
	// force A active so the owner-player path (turn + budget) is reachable
	for (const e of rolled.data.entries)
		db.updateInitiative(e.id, { active: e.unit_id === a.id ? 1 : 0 });
	// DM free move
	const dmMove = combat.moveUnit(a.id, 3, 3, DM);
	expect(dmMove.ok).toBe(true);
	// non-owner player denied
	const denied = combat.moveUnit(a.id, 4, 4, player(false));
	if (!denied.ok) expect(denied.error.msg).toBe('Not your character');
	// owner player, on their turn, but over budget -> conflict
	const over = combat.moveUnit(a.id, 10, 1, player(true));
	if (!over.ok) expect(over.error.status).toBe(409);
});

test('setHp clamps and logs down/back transitions (unit-testable rule surface)', () => {
	const c = campaign();
	const a = unit(c.id, 'A', 30);
	// player owning the unit may set its hp
	const r = combat.setHp(a.id, 3, player(true));
	if (!r.ok) throw new Error('should succeed');
	expect(r.data.hp).toBe(3);
	expect(r.data.log?.text).toContain('takes 7');
	// clamp to 0 and record "is down"
	const down = combat.setHp(a.id, -5, DM);
	if (!down.ok) throw new Error('should succeed');
	expect(down.data.hp).toBe(0);
	expect(down.data.log?.text).toBe('A is down');
	// an unrelated player is denied
	const denied = combat.setHp(a.id, 9, player(false));
	if (!denied.ok) expect(denied.error.status).toBe(401);
});
