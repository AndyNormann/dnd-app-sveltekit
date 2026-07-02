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

// migrate pre-brush databases: add shape/path/radius to map_reveals
{
	const cols = (db.query('PRAGMA table_info(map_reveals)').all() as { name: string }[]).map(
		(c) => c.name
	);
	if (!cols.includes('shape')) {
		db.exec(`ALTER TABLE map_reveals ADD COLUMN shape TEXT NOT NULL DEFAULT 'rect'`);
		db.exec(`ALTER TABLE map_reveals ADD COLUMN path TEXT`);
		db.exec(`ALTER TABLE map_reveals ADD COLUMN radius REAL`);
	}
}

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
	shape: 'rect' | 'brush';
	x: number;
	y: number;
	w: number;
	h: number;
	path?: [number, number][];
	radius?: number;
	seq: number;
}

/** Raw map_reveals row: path is a JSON string. */
interface RevealRow extends Omit<RevealOp, 'path' | 'radius'> {
	path: string | null;
	radius: number | null;
}

function toRevealOp(row: RevealRow): RevealOp {
	return {
		...row,
		path: row.path ? (JSON.parse(row.path) as [number, number][]) : undefined,
		radius: row.radius ?? undefined
	};
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
	const rows = db
		.query('SELECT * FROM map_reveals WHERE map_id = ? ORDER BY seq')
		.all(mapId) as RevealRow[];
	return rows.map(toRevealOp);
}

export function addReveal(
	mapId: string,
	kind: 'reveal' | 'hide',
	op:
		| { shape: 'rect'; x: number; y: number; w: number; h: number }
		| { shape: 'brush'; path: [number, number][]; radius: number }
): RevealOp {
	const next = (
		db
			.query('SELECT COALESCE(MAX(seq), 0) + 1 AS next FROM map_reveals WHERE map_id = ?')
			.get(mapId) as { next: number }
	).next;
	const isBrush = op.shape === 'brush';
	const row = db
		.query(
			`INSERT INTO map_reveals (map_id, kind, shape, x, y, w, h, path, radius, seq)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`
		)
		.get(
			mapId,
			kind,
			op.shape,
			isBrush ? 0 : op.x,
			isBrush ? 0 : op.y,
			isBrush ? 0 : op.w,
			isBrush ? 0 : op.h,
			isBrush ? JSON.stringify(op.path) : null,
			isBrush ? op.radius : null,
			next
		) as RevealRow;
	return toRevealOp(row);
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
