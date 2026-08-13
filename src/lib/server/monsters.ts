import { db } from './conn';
import { nanoid } from 'nanoid';


// --- Monsters (reusable enemy library / templates) ---

export interface Monster {
	id: string;
	campaign_id: string;
	name: string;
	color: string;
	speed: number;
	init_bonus: number;
	max_hp: number;
	hp: number;
	created_at: number;
}

export function createMonster(
	campaignId: string,
	data: {
		name: string;
		color?: string;
		speed?: number;
		init_bonus?: number;
		max_hp?: number;
	}
): Monster {
	const id = nanoid(10);
	const max_hp = Math.max(0, Math.floor(data.max_hp ?? 0));
	db.query(
		`INSERT INTO monsters (id, campaign_id, name, color, speed, init_bonus, max_hp, hp, created_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
	).run(
		id,
		campaignId,
		data.name,
		data.color ?? '#a33',
		Math.max(0, Math.floor(data.speed ?? 30)),
		Math.floor(data.init_bonus ?? 0),
		max_hp,
		max_hp,
		Date.now()
	);
	return db.query('SELECT * FROM monsters WHERE id = ?').get(id) as Monster;
}

export function listMonsters(campaignId: string): Monster[] {
	return db
		.query('SELECT * FROM monsters WHERE campaign_id = ? ORDER BY created_at')
		.all(campaignId) as Monster[];
}

export function getMonster(id: string): Monster | null {
	return (db.query('SELECT * FROM monsters WHERE id = ?').get(id) as Monster) ?? null;
}

export function updateMonster(
	id: string,
	patch: {
		name?: string;
		color?: string;
		speed?: number;
		init_bonus?: number;
		max_hp?: number;
	}
): Monster | null {
	const cur = db.query('SELECT * FROM monsters WHERE id = ?').get(id) as Monster | null;
	if (!cur) return null;
	const max_hp = patch.max_hp != null ? Math.max(0, Math.floor(patch.max_hp)) : cur.max_hp;
	db.query(
		`UPDATE monsters SET name = ?, color = ?, speed = ?, init_bonus = ?, max_hp = ?, hp = ? WHERE id = ?`
	).run(
		patch.name ?? cur.name,
		patch.color ?? cur.color,
		patch.speed != null ? Math.max(0, Math.floor(patch.speed)) : cur.speed,
		patch.init_bonus != null ? Math.floor(patch.init_bonus) : cur.init_bonus,
		max_hp,
		max_hp,
		id
	);
	return db.query('SELECT * FROM monsters WHERE id = ?').get(id) as Monster;
}

export function deleteMonster(id: string): void {
	db.query('DELETE FROM monsters WHERE id = ?').run(id);
}
