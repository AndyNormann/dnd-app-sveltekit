import { db } from './conn';
import { nanoid } from 'nanoid';


// --- Characters (player roster + secret links) ---

export interface CharacterRow {
	id: string;
	campaign_id: string;
	name: string;
	player_name: string;
	speed: number;
	init_bonus: number;
	color: string;
	max_hp: number;
	hp: number;
	link_token: string;
	created_at: number;
}

export function createCharacter(
	campaignId: string,
	data: {
		name: string;
		player_name?: string;
		speed?: number;
		init_bonus?: number;
		color?: string;
		max_hp?: number;
		hp?: number;
	}
): CharacterRow {
	const id = nanoid(10);
	const link_token = nanoid(24);
	db.query(
		`INSERT INTO characters (id, campaign_id, name, player_name, speed, init_bonus, color, max_hp, hp, link_token, created_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
	).run(
		id,
		campaignId,
		data.name,
		data.player_name ?? '',
		Math.max(1, Math.floor(data.speed ?? 30)),
		Math.floor(data.init_bonus ?? 0),
		data.color ?? '#1b6ca8',
		Math.max(0, Math.floor(data.max_hp ?? 0)),
		Math.max(0, Math.floor(data.hp ?? data.max_hp ?? 0)),
		link_token,
		Date.now()
	);
	return db.query('SELECT * FROM characters WHERE id = ?').get(id) as CharacterRow;
}

export function listCharacters(campaignId: string): CharacterRow[] {
	return db
		.query('SELECT * FROM characters WHERE campaign_id = ? ORDER BY created_at')
		.all(campaignId) as CharacterRow[];
}

export function getCharacter(id: string): CharacterRow | null {
	return (db.query('SELECT * FROM characters WHERE id = ?').get(id) as CharacterRow) ?? null;
}

export function getCharacterByToken(token: string): CharacterRow | null {
	return (
		(db.query('SELECT * FROM characters WHERE link_token = ?').get(token) as CharacterRow) ?? null
	);
}

export function updateCharacter(
	id: string,
	patch: {
		name?: string;
		player_name?: string;
		speed?: number;
		init_bonus?: number;
		color?: string;
		max_hp?: number;
		hp?: number;
	}
): CharacterRow | null {
	const cur = db.query('SELECT * FROM characters WHERE id = ?').get(id) as CharacterRow | null;
	if (!cur) return null;
	db.query(
		`UPDATE characters SET name = ?, player_name = ?, speed = ?, init_bonus = ?, color = ?, max_hp = ?, hp = ? WHERE id = ?`
	).run(
		patch.name ?? cur.name,
		patch.player_name ?? cur.player_name,
		patch.speed != null ? Math.max(1, Math.floor(patch.speed)) : cur.speed,
		patch.init_bonus != null ? Math.floor(patch.init_bonus) : cur.init_bonus,
		patch.color ?? cur.color,
		patch.max_hp != null ? Math.max(0, Math.floor(patch.max_hp)) : cur.max_hp,
		patch.hp != null ? Math.max(0, Math.floor(patch.hp)) : cur.hp,
		id
	);
	return db.query('SELECT * FROM characters WHERE id = ?').get(id) as CharacterRow;
}

export function deleteCharacter(id: string): void {
	db.query('DELETE FROM characters WHERE id = ?').run(id);
}
