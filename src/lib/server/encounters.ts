import { db } from './conn';
import { nanoid } from 'nanoid';
import type { CombatUnit, CombatDrawing } from './combatDb';

/** A saved snapshot of the combat board (units incl. HP/positions + drawings). */
export interface EncounterRow {
	id: string;
	campaign_id: string;
	name: string;
	units: CombatUnit[];
	drawings: CombatDrawing[];
	created_at: number;
}

function rowToEncounter(r: {
	id: string;
	campaign_id: string;
	name: string;
	units: string;
	drawings: string;
	created_at: number;
}): EncounterRow {
	return {
		id: r.id,
		campaign_id: r.campaign_id,
		name: r.name,
		units: (JSON.parse(r.units) || []) as CombatUnit[],
		drawings: (JSON.parse(r.drawings) || []) as CombatDrawing[],
		created_at: r.created_at
	};
}

export function listEncounters(campaignId: string): EncounterRow[] {
	const rows = db
		.query('SELECT * FROM encounters WHERE campaign_id = ? ORDER BY created_at DESC')
		.all(campaignId) as (Omit<EncounterRow, 'units' | 'drawings'> & {
		units: string;
		drawings: string;
	})[];
	return rows.map(rowToEncounter);
}

export function getEncounter(id: string): EncounterRow | null {
	const r = db.query('SELECT * FROM encounters WHERE id = ?').get(id) as (Omit<EncounterRow, 'units' | 'drawings'> & {
		units: string;
		drawings: string;
	}) | null;
	if (!r) return null;
	return rowToEncounter(r);
}

export function saveEncounter(
	campaignId: string,
	name: string,
	units: CombatUnit[],
	drawings: CombatDrawing[]
): EncounterRow {
	const id = nanoid(10);
	const created_at = Date.now();
	db.query(
		'INSERT INTO encounters (id, campaign_id, name, units, drawings, created_at) VALUES (?, ?, ?, ?, ?, ?)'
	).run(id, campaignId, name, JSON.stringify(units), JSON.stringify(drawings), created_at);
	return { id, campaign_id: campaignId, name, units, drawings, created_at };
}

export function deleteEncounter(id: string): void {
	db.query('DELETE FROM encounters WHERE id = ?').run(id);
}
