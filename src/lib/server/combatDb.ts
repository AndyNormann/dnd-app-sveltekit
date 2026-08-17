import { db } from './conn';
import { nanoid } from 'nanoid';


// --- Combat units (tokens on the combat board) ---

export interface CombatUnit {
	id: string;
	campaign_id: string;
	kind: 'player' | 'enemy';
	character_id: string | null;
	name: string;
	color: string;
	speed: number;
	init_bonus: number;
	hp: number;
	max_hp: number;
	alive: number;
	movement_used: number;
	conditions: string;
	x: number;
	y: number;
}

export function addCombatUnit(
	campaignId: string,
	data: {
		kind: 'player' | 'enemy';
		character_id?: string | null;
		name: string;
		color?: string;
		speed?: number;
		init_bonus?: number;
		hp?: number;
		max_hp?: number;
		x?: number;
		y?: number;
	}
): CombatUnit {
	const id = nanoid(10);
	db.query(
		`INSERT INTO combat_units (id, campaign_id, kind, character_id, name, color, speed, init_bonus, hp, max_hp, alive, x, y, created_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
	).run(
		id,
		campaignId,
		data.kind,
		data.character_id ?? null,
		data.name,
		data.color ?? (data.kind === 'player' ? '#1b6ca8' : '#a33'),
		Math.max(0, Math.floor(data.speed ?? 0)),
		Math.floor(data.init_bonus ?? 0),
		Math.max(0, Math.floor(data.hp ?? data.max_hp ?? 0)),
		Math.max(0, Math.floor(data.max_hp ?? 0)),
		1,
		Math.max(0, Math.floor(data.x ?? 0)),
		Math.max(0, Math.floor(data.y ?? 0)),
		Date.now()
	);
	return db.query('SELECT * FROM combat_units WHERE id = ?').get(id) as CombatUnit;
}

export function listCombatUnits(campaignId: string): CombatUnit[] {
	return db
		.query('SELECT * FROM combat_units WHERE campaign_id = ? ORDER BY created_at')
		.all(campaignId) as CombatUnit[];
}

export function getCombatUnit(id: string): CombatUnit | null {
	return (db.query('SELECT * FROM combat_units WHERE id = ?').get(id) as CombatUnit) ?? null;
}

export function updateCombatUnit(
	id: string,
	patch: {
		x?: number;
		y?: number;
		hp?: number;
		name?: string;
		color?: string;
		speed?: number;
		init_bonus?: number;
		max_hp?: number;
		conditions?: string;
	}
): CombatUnit | null {
	const cur = db.query('SELECT * FROM combat_units WHERE id = ?').get(id) as CombatUnit | null;
	if (!cur) return null;
	const hp = patch.hp != null ? Math.max(0, Math.floor(patch.hp)) : cur.hp;
	// alive follows hp: at 0 the unit is down, above 0 it is back up
	const alive = hp > 0 ? 1 : 0;
	db.query(
		`UPDATE combat_units SET x = ?, y = ?, hp = ?, alive = ?, name = ?, color = ?, speed = ?, init_bonus = ?, max_hp = ?, conditions = ? WHERE id = ?`
	).run(
		patch.x != null ? Math.max(0, Math.floor(patch.x)) : cur.x,
		patch.y != null ? Math.max(0, Math.floor(patch.y)) : cur.y,
		hp,
		alive,
		patch.name ?? cur.name,
		patch.color ?? cur.color,
		patch.speed != null ? Math.max(0, Math.floor(patch.speed)) : cur.speed,
		patch.init_bonus != null ? Math.floor(patch.init_bonus) : cur.init_bonus,
		patch.max_hp != null ? Math.max(0, Math.floor(patch.max_hp)) : cur.max_hp,
		patch.conditions ?? cur.conditions,
		id
	);
	return db.query('SELECT * FROM combat_units WHERE id = ?').get(id) as CombatUnit;
}

export function removeCombatUnit(id: string): void {
	db.query('DELETE FROM combat_units WHERE id = ?').run(id);
}

export function clearCombatUnits(campaignId: string): void {
	db.query('DELETE FROM combat_units WHERE campaign_id = ?').run(campaignId);
}


// --- Combat log (a running feed of what just happened) ---

export interface CombatLogEntry {
	id: number;
	campaign_id: string;
	text: string;
	created_at: number;
}

export function addCombatLog(campaignId: string, text: string): CombatLogEntry {
	const row = db
		.query('INSERT INTO combat_logs (campaign_id, text, created_at) VALUES (?, ?, ?)')
		.run(campaignId, text, Date.now());
	const entry = db
		.query('SELECT * FROM combat_logs WHERE id = ?')
		.get(Number(row.lastInsertRowid)) as CombatLogEntry;
	return entry;
}

export function listCombatLogs(campaignId: string, limit = 80): CombatLogEntry[] {
	return db
		.query(
			'SELECT * FROM combat_logs WHERE campaign_id = ? ORDER BY id DESC LIMIT ?'
		)
		.all(campaignId, limit) as CombatLogEntry[];
}


// --- Combat drawings (pen-and-paper strokes) ---

export interface CombatDrawing {
	id: string;
	campaign_id: string;
	color: string;
	width: number;
	mode: 'draw' | 'erase';
	/** stroke for freehand ink, or a persistent board marking. */
	kind: 'stroke' | 'full-cover' | 'half-cover' | 'difficult-terrain';
	points: [number, number][];
	created_at: number;
}

export function addCombatDrawing(
	campaignId: string,
	color: string,
	width: number,
	mode: 'draw' | 'erase',
	points: [number, number][],
	kind: CombatDrawing['kind'] = 'stroke'
): CombatDrawing {
	const id = nanoid(12);
	db.query(
		'INSERT INTO combat_drawings (id, campaign_id, color, width, mode, kind, points, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
	).run(id, campaignId, color, width, mode, kind, JSON.stringify(points), Date.now());
	return db.query('SELECT * FROM combat_drawings WHERE id = ?').get(id) as CombatDrawing;
}

export function listCombatDrawings(campaignId: string): CombatDrawing[] {
	return (db
		.query('SELECT * FROM combat_drawings WHERE campaign_id = ? ORDER BY created_at')
		.all(campaignId) as Omit<CombatDrawing, 'points'>[]).map((r) => ({
		...r,
		kind: ((r as unknown as { kind?: string }).kind || 'stroke') as CombatDrawing['kind'],
		points: (JSON.parse((r as unknown as { points: string }).points) || []) as [number, number][]
	})) as CombatDrawing[];
}

export function clearCombatDrawings(campaignId: string): void {
	db.query('DELETE FROM combat_drawings WHERE campaign_id = ?').run(campaignId);
}

/** Delete the most recently added drawing for a campaign; returns its id or null. */
export function removeLastCombatDrawing(campaignId: string): string | null {
	const row = db
		.query('SELECT id FROM combat_drawings WHERE campaign_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1')
		.get(campaignId) as { id: string } | null;
	if (!row) return null;
	db.query('DELETE FROM combat_drawings WHERE id = ?').run(row.id);
	return row.id;
}

/** Re-insert a saved combat unit (used when loading an encounter). Movement resets to 0. */
export function restoreCombatUnit(u: CombatUnit): void {
	db.query(
		`INSERT INTO combat_units (id, campaign_id, kind, character_id, name, color, speed, init_bonus, hp, max_hp, alive, movement_used, conditions, x, y, created_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
	).run(
		u.id,
		u.campaign_id,
		u.kind,
		u.character_id ?? null,
		u.name,
		u.color,
		u.speed,
		u.init_bonus,
		u.hp,
		u.max_hp,
		u.alive,
		0,
		u.conditions,
		u.x,
		u.y,
		Date.now()
	);
}

/** Re-insert a saved combat drawing (used when loading an encounter). */
export function restoreCombatDrawing(d: CombatDrawing): void {
	db.query(
		'INSERT INTO combat_drawings (id, campaign_id, color, width, mode, kind, points, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
	).run(d.id, d.campaign_id, d.color, d.width, d.mode, d.kind ?? 'stroke', JSON.stringify(d.points), Date.now());
}


// --- Combat board config + movement budget ---

export interface BoardConfig {
	grid_cols: number;
	grid_rows: number;
	grid_scale: number;
	combat_movement_used: number;
}

export function getBoardConfig(campaignId: string): BoardConfig {
	const r = db
		.query(
			'SELECT grid_cols, grid_rows, grid_scale, combat_movement_used FROM campaigns WHERE id = ?'
		)
		.get(campaignId) as BoardConfig | null;
	return (
		r ?? { grid_cols: 24, grid_rows: 18, grid_scale: 5, combat_movement_used: 0 }
	);
}

export function setBoardGrid(campaignId: string, cols: number, rows: number, scale: number): void {
	db.query('UPDATE campaigns SET grid_cols = ?, grid_rows = ?, grid_scale = ? WHERE id = ?').run(
		Math.max(4, Math.min(80, Math.floor(cols))),
		Math.max(4, Math.min(60, Math.floor(rows))),
		Math.max(1, Math.min(20, Math.floor(scale))),
		campaignId
	);
}

// Per-unit movement tracking so each combatant has its own speed budget for a turn
// (a player's movement must never consume another unit's budget). Reset every turn.
export function setUnitMovementUsed(unitId: string, used: number): void {
	db.query('UPDATE combat_units SET movement_used = ? WHERE id = ?').run(
		Math.max(0, Math.floor(used)),
		unitId
	);
}

export function resetAllMovement(campaignId: string): void {
	db.query('UPDATE combat_units SET movement_used = 0 WHERE campaign_id = ?').run(campaignId);
}



export function getActiveUnitId(campaignId: string): string | null {
	const row = db
		.query('SELECT unit_id FROM initiative_entries WHERE campaign_id = ? AND active = 1')
		.get(campaignId) as { unit_id: string | null } | undefined;
	return row?.unit_id ?? null;
}

export function setInitiativeHpByUnit(unitId: string, hp: number): void {
	db.query('UPDATE initiative_entries SET hp = ? WHERE unit_id = ?').run(hp, unitId);
}

