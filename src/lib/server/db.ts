import { Database } from 'bun:sqlite';
import { mkdirSync } from 'node:fs';
import { nanoid } from 'nanoid';

const DATA_DIR = 'data';
mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(`${DATA_DIR}/app.db`);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

db.exec(`
	CREATE TABLE IF NOT EXISTS campaigns (
		id TEXT PRIMARY KEY,
		title TEXT NOT NULL,
		content TEXT NOT NULL DEFAULT '',
		created_at INTEGER NOT NULL
	);

	CREATE TABLE IF NOT EXISTS heading_meta (
		campaign_id TEXT NOT NULL,
		heading_id TEXT NOT NULL,
		shared INTEGER NOT NULL DEFAULT 0,
		collapsed INTEGER NOT NULL DEFAULT 0,
		PRIMARY KEY (campaign_id, heading_id)
	);

	CREATE TABLE IF NOT EXISTS maps (
		id TEXT PRIMARY KEY,
		campaign_id TEXT NOT NULL,
		filename TEXT NOT NULL,
		width INTEGER NOT NULL,
		height INTEGER NOT NULL,
		created_at INTEGER NOT NULL
	);

	CREATE TABLE IF NOT EXISTS map_reveals (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		map_id TEXT NOT NULL,
		kind TEXT NOT NULL,
		x REAL NOT NULL,
		y REAL NOT NULL,
		w REAL NOT NULL,
		h REAL NOT NULL,
		seq INTEGER NOT NULL
	);

	CREATE TABLE IF NOT EXISTS rolls (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		campaign_id TEXT NOT NULL,
		roller TEXT NOT NULL,
		expression TEXT NOT NULL,
		result INTEGER NOT NULL,
		breakdown TEXT NOT NULL,
		secret INTEGER NOT NULL DEFAULT 0,
		created_at INTEGER NOT NULL
	);
`);

export interface Campaign {
	id: string;
	title: string;
	content: string;
	created_at: number;
}

export interface HeadingMeta {
	heading_id: string;
	shared: number;
	collapsed: number;
}

export interface MapRow {
	id: string;
	campaign_id: string;
	filename: string;
	width: number;
	height: number;
	created_at: number;
}

export interface RevealOp {
	id: number;
	map_id: string;
	kind: 'reveal' | 'hide';
	x: number;
	y: number;
	w: number;
	h: number;
	seq: number;
}

// --- Campaigns ---

export function listCampaigns(): Campaign[] {
	return db.query('SELECT * FROM campaigns ORDER BY created_at DESC').all() as Campaign[];
}

export function getCampaign(id: string): Campaign | null {
	return (db.query('SELECT * FROM campaigns WHERE id = ?').get(id) as Campaign) ?? null;
}

export function createCampaign(title: string): Campaign {
	const id = nanoid(10);
	db.query('INSERT INTO campaigns (id, title, content, created_at) VALUES (?, ?, ?, ?)').run(
		id,
		title,
		'',
		Date.now()
	);
	return getCampaign(id)!;
}

export function updateContent(id: string, content: string): void {
	db.query('UPDATE campaigns SET content = ? WHERE id = ?').run(content, id);
}

export function updateTitle(id: string, title: string): void {
	db.query('UPDATE campaigns SET title = ? WHERE id = ?').run(title, id);
}

/** Delete a campaign and all dependent rows; returns upload filenames to unlink. */
export function deleteCampaign(id: string): string[] {
	const files = (
		db.query('SELECT filename FROM maps WHERE campaign_id = ?').all(id) as { filename: string }[]
	).map((r) => r.filename);
	db.query(
		'DELETE FROM map_reveals WHERE map_id IN (SELECT id FROM maps WHERE campaign_id = ?)'
	).run(id);
	db.query('DELETE FROM maps WHERE campaign_id = ?').run(id);
	db.query('DELETE FROM heading_meta WHERE campaign_id = ?').run(id);
	db.query('DELETE FROM rolls WHERE campaign_id = ?').run(id);
	db.query('DELETE FROM campaigns WHERE id = ?').run(id);
	return files;
}

// --- Heading meta ---

export function getHeadingMeta(campaignId: string): HeadingMeta[] {
	return db
		.query('SELECT heading_id, shared, collapsed FROM heading_meta WHERE campaign_id = ?')
		.all(campaignId) as HeadingMeta[];
}

/** `state` is the tri-state share value: 0 = inherit, 1 = shared, 2 = hidden. */
export function setHeadingShared(campaignId: string, headingId: string, state: number): void {
	db.query(
		`INSERT INTO heading_meta (campaign_id, heading_id, shared) VALUES (?, ?, ?)
		 ON CONFLICT(campaign_id, heading_id) DO UPDATE SET shared = excluded.shared`
	).run(campaignId, headingId, state);
}

export function setHeadingCollapsed(
	campaignId: string,
	headingId: string,
	collapsed: boolean
): void {
	db.query(
		`INSERT INTO heading_meta (campaign_id, heading_id, collapsed) VALUES (?, ?, ?)
		 ON CONFLICT(campaign_id, heading_id) DO UPDATE SET collapsed = excluded.collapsed`
	).run(campaignId, headingId, collapsed ? 1 : 0);
}

// --- Maps ---

export function listMaps(campaignId: string): MapRow[] {
	return db
		.query('SELECT * FROM maps WHERE campaign_id = ? ORDER BY created_at')
		.all(campaignId) as MapRow[];
}

export function getMap(id: string): MapRow | null {
	return (db.query('SELECT * FROM maps WHERE id = ?').get(id) as MapRow) ?? null;
}

export function createMap(
	campaignId: string,
	filename: string,
	width: number,
	height: number
): MapRow {
	const id = nanoid(10);
	db.query(
		'INSERT INTO maps (id, campaign_id, filename, width, height, created_at) VALUES (?, ?, ?, ?, ?, ?)'
	).run(id, campaignId, filename, width, height, Date.now());
	return getMap(id)!;
}

// --- Reveal ops ---

export function listReveals(mapId: string): RevealOp[] {
	return db
		.query('SELECT * FROM map_reveals WHERE map_id = ? ORDER BY seq')
		.all(mapId) as RevealOp[];
}

export function addReveal(
	mapId: string,
	kind: 'reveal' | 'hide',
	rect: { x: number; y: number; w: number; h: number }
): RevealOp {
	const row = db
		.query('SELECT COALESCE(MAX(seq), 0) + 1 AS next FROM map_reveals WHERE map_id = ?')
		.get(mapId) as { next: number };
	const seq = row.next;
	const result = db
		.query(
			'INSERT INTO map_reveals (map_id, kind, x, y, w, h, seq) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING *'
		)
		.get(mapId, kind, rect.x, rect.y, rect.w, rect.h, seq) as RevealOp;
	return result;
}

// --- Rolls ---

export interface RollRow {
	id: number;
	campaign_id: string;
	roller: string;
	expression: string;
	result: number;
	breakdown: string;
	secret: number;
	created_at: number;
}

export function addRoll(
	campaignId: string,
	roller: string,
	expression: string,
	result: number,
	breakdown: string,
	secret: boolean
): RollRow {
	const row = db
		.query(
			`INSERT INTO rolls (campaign_id, roller, expression, result, breakdown, secret, created_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING *`
		)
		.get(campaignId, roller, expression, result, breakdown, secret ? 1 : 0, Date.now()) as RollRow;
	// keep only the most recent 200 rolls per campaign
	db.query(
		`DELETE FROM rolls WHERE campaign_id = ? AND id NOT IN
		 (SELECT id FROM rolls WHERE campaign_id = ? ORDER BY id DESC LIMIT 200)`
	).run(campaignId, campaignId);
	return row;
}

export function listRolls(campaignId: string, includeSecret: boolean): RollRow[] {
	const rows = includeSecret
		? db
				.query('SELECT * FROM rolls WHERE campaign_id = ? ORDER BY id DESC LIMIT 100')
				.all(campaignId)
		: db
				.query(
					'SELECT * FROM rolls WHERE campaign_id = ? AND secret = 0 ORDER BY id DESC LIMIT 100'
				)
				.all(campaignId);
	return (rows as RollRow[]).reverse();
}

export default db;
