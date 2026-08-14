import { db } from './conn';

// --- Initiative ---

export interface InitEntry {
	id: number;
	campaign_id: string;
	name: string;
	init: number;
	hp: number;
	active: number;
	unit_id: string | null;
}

const INIT_ORDER = 'ORDER BY init DESC, id ASC';

function rowToInit(row: { hp: number | null } & Omit<InitEntry, 'hp'>): InitEntry {
	return { ...row, hp: row.hp ?? 0 };
}

export function listInitiative(campaignId: string): InitEntry[] {
	return db
		.query(`SELECT * FROM initiative_entries WHERE campaign_id = ? ${INIT_ORDER}`)
		.all(campaignId) as InitEntry[];
}

export function addInitiative(
	campaignId: string,
	name: string,
	init: number,
	hp: number,
	unitId?: string | null
): InitEntry {
	const row = db
		.query(
			`INSERT INTO initiative_entries (campaign_id, name, init, hp, unit_id, created_at)
			 VALUES (?, ?, ?, ?, ?, ?) RETURNING *`
		)
		.get(campaignId, name, init, hp, unitId ?? null, Date.now()) as InitEntry;
	return rowToInit(row);
}

export function getInitiative(id: number): InitEntry | null {
	return (db.query('SELECT * FROM initiative_entries WHERE id = ?').get(id) as InitEntry) ?? null;
}

export function updateInitiative(
	id: number,
	patch: { name?: string; hp?: number; active?: number; init?: number }
): InitEntry | null {
	const current = db.query('SELECT * FROM initiative_entries WHERE id = ?').get(id) as InitEntry | null;
	if (!current) return null;
	const name = patch.name ?? current.name;
	const hp = patch.hp ?? current.hp;
	const active = patch.active ?? current.active;
	const init = patch.init ?? current.init;
	db.query('UPDATE initiative_entries SET name = ?, hp = ?, active = ?, init = ? WHERE id = ?').run(
		name,
		hp,
		active,
		init,
		id
	);
	return rowToInit(db.query('SELECT * FROM initiative_entries WHERE id = ?').get(id) as InitEntry);
}

export function removeInitiative(id: number): void {
	db.query('DELETE FROM initiative_entries WHERE id = ?').run(id);
}

export function clearInitiative(campaignId: string): void {
	db.query('DELETE FROM initiative_entries WHERE campaign_id = ?').run(campaignId);
}

// --- Initiative round ---

export function getInitiativeRound(campaignId: string): number {
	return (
		(db.query('SELECT initiative_round FROM campaigns WHERE id = ?').get(campaignId) as {
			initiative_round: number;
		} | null)?.initiative_round ?? 1
	);
}

export function setInitiativeRound(campaignId: string, round: number): void {
	db.query('UPDATE campaigns SET initiative_round = ? WHERE id = ?').run(
		Math.max(1, Math.floor(round)),
		campaignId
	);
}
