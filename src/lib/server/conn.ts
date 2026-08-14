import { Database } from 'bun:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

/** Database file path, overridable via env so tests can use an isolated DB. */
export const DB_PATH = process.env.DB_PATH ?? 'data/app.db';
mkdirSync(dirname(DB_PATH), { recursive: true });

function open(): Database {
	const d = new Database(DB_PATH);
	d.exec('PRAGMA journal_mode = WAL;');
	d.exec('PRAGMA foreign_keys = ON;');
	return d;
}

// `export let` is a live ESM binding, so `reopenDb()` (used by the restore-from-
// backup flow) makes every module that imported `{ db }` see the fresh handle.
export let db: Database = open();

/** Close the current connection (safe point for swapping the DB file underneath it). */
export function closeDb(): void {
	db.close();
}

/** Close and re-open the connection — call after replacing the DB file. */
export function reopenDb(): void {
	db.close();
	db = open();
}

db.exec(`
	CREATE TABLE IF NOT EXISTS campaigns (
		id TEXT PRIMARY KEY,
		title TEXT NOT NULL,
		content TEXT NOT NULL DEFAULT '',
		created_at INTEGER NOT NULL,
		updated_at INTEGER NOT NULL DEFAULT 0,
		rev INTEGER NOT NULL DEFAULT 0,
		initiative_round INTEGER NOT NULL DEFAULT 1
	);


	CREATE TABLE IF NOT EXISTS maps (
		id TEXT PRIMARY KEY,
		campaign_id TEXT NOT NULL,
		filename TEXT NOT NULL,
		width INTEGER NOT NULL,
		height INTEGER NOT NULL,
		grid_size INTEGER NOT NULL DEFAULT 0,
		active_layer INTEGER NOT NULL DEFAULT 0,
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
		layer INTEGER NOT NULL DEFAULT 0,
		seq INTEGER NOT NULL
	);

	CREATE TABLE IF NOT EXISTS map_tokens (
		id TEXT PRIMARY KEY,
		map_id TEXT NOT NULL,
		label TEXT NOT NULL,
		color TEXT NOT NULL,
		x REAL NOT NULL,
		y REAL NOT NULL,
		created_at INTEGER NOT NULL
	);

	CREATE TABLE IF NOT EXISTS rolls (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		campaign_id TEXT NOT NULL,
		roller TEXT NOT NULL,
		expression TEXT NOT NULL,
		result INTEGER NOT NULL,
		breakdown TEXT NOT NULL,
		label TEXT,
		secret INTEGER NOT NULL DEFAULT 0,
		created_at INTEGER NOT NULL
	);

	CREATE TABLE IF NOT EXISTS initiative_entries (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		campaign_id TEXT NOT NULL,
		name TEXT NOT NULL,
		init REAL NOT NULL,
		hp REAL NOT NULL DEFAULT 0,
		active INTEGER NOT NULL DEFAULT 0,
		created_at INTEGER NOT NULL
	);

	CREATE TABLE IF NOT EXISTS characters (
		id TEXT PRIMARY KEY,
		campaign_id TEXT NOT NULL,
		name TEXT NOT NULL,
		player_name TEXT NOT NULL DEFAULT '',
		speed INTEGER NOT NULL DEFAULT 30,
		init_bonus INTEGER NOT NULL DEFAULT 0,
		color TEXT NOT NULL DEFAULT '#1b6ca8',
		max_hp INTEGER NOT NULL DEFAULT 0,
		hp INTEGER NOT NULL DEFAULT 0,
		link_token TEXT NOT NULL,
		created_at INTEGER NOT NULL
	);

	CREATE TABLE IF NOT EXISTS monsters (
		id TEXT PRIMARY KEY,
		campaign_id TEXT NOT NULL,
		name TEXT NOT NULL,
		color TEXT NOT NULL DEFAULT '#a33',
		speed INTEGER NOT NULL DEFAULT 30,
		init_bonus INTEGER NOT NULL DEFAULT 0,
		max_hp INTEGER NOT NULL DEFAULT 0,
		hp INTEGER NOT NULL DEFAULT 0,
		created_at INTEGER NOT NULL
	);

	CREATE TABLE IF NOT EXISTS combat_units (
		id TEXT PRIMARY KEY,
		campaign_id TEXT NOT NULL,
		kind TEXT NOT NULL,
		character_id TEXT,
		name TEXT NOT NULL,
		color TEXT NOT NULL,
		speed INTEGER NOT NULL DEFAULT 0,
		init_bonus INTEGER NOT NULL DEFAULT 0,
		hp INTEGER NOT NULL DEFAULT 0,
		max_hp INTEGER NOT NULL DEFAULT 0,
		alive INTEGER NOT NULL DEFAULT 1,
		movement_used INTEGER NOT NULL DEFAULT 0,
		conditions TEXT NOT NULL DEFAULT '',
		x INTEGER NOT NULL DEFAULT 0,
		y INTEGER NOT NULL DEFAULT 0,
		created_at INTEGER NOT NULL
	);

	CREATE TABLE IF NOT EXISTS combat_drawings (
		id TEXT PRIMARY KEY,
		campaign_id TEXT NOT NULL,
		color TEXT NOT NULL,
		width REAL NOT NULL DEFAULT 4,
		mode TEXT NOT NULL DEFAULT 'draw',
		points TEXT NOT NULL,
		created_at INTEGER NOT NULL
	);

	CREATE TABLE IF NOT EXISTS combat_logs (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		campaign_id TEXT NOT NULL,
		text TEXT NOT NULL,
		created_at INTEGER NOT NULL
	);
	CREATE INDEX IF NOT EXISTS idx_combat_logs_campaign ON combat_logs(campaign_id, id);

	CREATE TABLE IF NOT EXISTS collections (
		id TEXT PRIMARY KEY,
		campaign_id TEXT NOT NULL,
		name TEXT NOT NULL,
		items TEXT NOT NULL,
		created_at INTEGER NOT NULL
	);
	CREATE INDEX IF NOT EXISTS idx_collections_campaign ON collections(campaign_id, created_at);

	CREATE UNIQUE INDEX IF NOT EXISTS idx_characters_link ON characters(link_token);

	CREATE TABLE IF NOT EXISTS documents (
		id TEXT PRIMARY KEY,
		campaign_id TEXT NOT NULL,
		title TEXT NOT NULL,
		content TEXT NOT NULL DEFAULT '',
		position INTEGER NOT NULL DEFAULT 0,
		shared INTEGER NOT NULL DEFAULT 0,
		created_at INTEGER NOT NULL,
		updated_at INTEGER NOT NULL DEFAULT 0,
		rev INTEGER NOT NULL DEFAULT 0
	);
	CREATE INDEX IF NOT EXISTS idx_documents_campaign ON documents(campaign_id, position);
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
	if (!cols.includes('layer')) {
		db.exec(`ALTER TABLE map_reveals ADD COLUMN layer INTEGER NOT NULL DEFAULT 0`);
	}
	// migrate pre-label databases: add label to rolls (checked against rolls' columns)
	const rollCols = (db.query('PRAGMA table_info(rolls)').all() as { name: string }[]).map(
		(c) => c.name
	);
	if (!rollCols.includes('label')) {
		db.exec(`ALTER TABLE rolls ADD COLUMN label TEXT`);
	}
	// migrate pre-grid databases: add grid_size to maps
	const mapCols = (db.query('PRAGMA table_info(maps)').all() as { name: string }[]).map(
		(c) => c.name
	);
	if (!mapCols.includes('grid_size')) {
		db.exec(`ALTER TABLE maps ADD COLUMN grid_size INTEGER NOT NULL DEFAULT 0`);
	}
	if (!mapCols.includes('active_layer')) {
		db.exec(`ALTER TABLE maps ADD COLUMN active_layer INTEGER NOT NULL DEFAULT 0`);
	}
	// migrate pre-rev databases: add rev (optimistic-concurrency guard) to campaigns
	const campCols = (db.query('PRAGMA table_info(campaigns)').all() as { name: string }[]).map(
		(c) => c.name
	);
	if (!campCols.includes('rev')) {
		db.exec(`ALTER TABLE campaigns ADD COLUMN rev INTEGER NOT NULL DEFAULT 0`);
	}
	if (!campCols.includes('initiative_round')) {
		db.exec(`ALTER TABLE campaigns ADD COLUMN initiative_round INTEGER NOT NULL DEFAULT 1`);
	}
	// combat board config + movement budget
	if (!campCols.includes('grid_cols')) {
		db.exec(`ALTER TABLE campaigns ADD COLUMN grid_cols INTEGER NOT NULL DEFAULT 24`);
	}
	if (!campCols.includes('grid_rows')) {
		db.exec(`ALTER TABLE campaigns ADD COLUMN grid_rows INTEGER NOT NULL DEFAULT 18`);
	}
	if (!campCols.includes('grid_scale')) {
		db.exec(`ALTER TABLE campaigns ADD COLUMN grid_scale INTEGER NOT NULL DEFAULT 5`);
	}
	if (!campCols.includes('combat_movement_used')) {
		db.exec(`ALTER TABLE campaigns ADD COLUMN combat_movement_used INTEGER NOT NULL DEFAULT 0`);
	}
	// last-edited stamp for the dashboard
	if (!campCols.includes('updated_at')) {
		db.exec(`ALTER TABLE campaigns ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0`);
	}
	// combat-unit death flag (alive 0 = down/out, skipped in turn order)
	const unitCols = (db.query('PRAGMA table_info(combat_units)').all() as { name: string }[]).map(
		(c) => c.name
	);
	if (!unitCols.includes('alive')) {
		db.exec(`ALTER TABLE combat_units ADD COLUMN alive INTEGER NOT NULL DEFAULT 1`);
	}
	if (!unitCols.includes('movement_used')) {
		db.exec(`ALTER TABLE combat_units ADD COLUMN movement_used INTEGER NOT NULL DEFAULT 0`);
	}
	if (!unitCols.includes('conditions')) {
		db.exec(`ALTER TABLE combat_units ADD COLUMN conditions TEXT NOT NULL DEFAULT ''`);
	}
	// link initiative entries to combat units so turns gate movement
	const initCols = (db.query('PRAGMA table_info(initiative_entries)').all() as { name: string }[]).map(
		(c) => c.name
	);
	if (!initCols.includes('unit_id')) {
		db.exec(`ALTER TABLE initiative_entries ADD COLUMN unit_id TEXT`);
	}
}


export default db;
