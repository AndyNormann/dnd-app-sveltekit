import { Database } from 'bun:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { nanoid } from 'nanoid';

/** Database file path, overridable via env so tests can use an isolated DB. */
const DB_PATH = process.env.DB_PATH ?? 'data/app.db';
mkdirSync(dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

db.exec(`
	CREATE TABLE IF NOT EXISTS campaigns (
		id TEXT PRIMARY KEY,
		title TEXT NOT NULL,
		content TEXT NOT NULL DEFAULT '',
		created_at INTEGER NOT NULL,
		rev INTEGER NOT NULL DEFAULT 0
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
}

export interface Campaign {
	id: string;
	title: string;
	content: string;
	created_at: number;
	rev: number;
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
	grid_size: number;
	active_layer: number;
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
	layer: number;
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

/** Write content and bump the revision (unconditional; used by restore/canonicalize). */
export function updateContent(id: string, content: string): void {
	db.query('UPDATE campaigns SET content = ?, rev = rev + 1 WHERE id = ?').run(content, id);
}

/**
 * Write content only if the campaign is still at `expectedRev`. Returns false
 * (and does not write) when another writer has bumped the revision — the caller
 * should return 409 so a stale editor tab can't clobber newer content.
 */
export function updateContentConditional(
	id: string,
	content: string,
	expectedRev: number
): boolean {
	const res = db
		.query('UPDATE campaigns SET content = ?, rev = rev + 1 WHERE id = ? AND rev = ?')
		.run(content, id, expectedRev);
	return res.changes > 0;
}

/** Current content revision for a campaign (0 if missing). */
export function getCampaignRev(id: string): number {
	return (db.query('SELECT rev FROM campaigns WHERE id = ?').get(id) as { rev: number } | undefined)
		?.rev ?? 0;
}

/** Force a WAL checkpoint so committed data is flushed to the main .db file. */
export function checkpoint(): void {
	try {
		db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
	} catch {
		// checkpoint is best-effort; ignore transient busy errors
	}
}

export function updateTitle(id: string, title: string): void {
	db.query('UPDATE campaigns SET title = ? WHERE id = ?').run(title, id);
}

export interface CampaignSearchResult {
	id: string;
	title: string;
	snippet: string;
}

/** Case-insensitive search over campaign titles and content with a snippet. */
export function searchCampaigns(q: string): CampaignSearchResult[] {
	const escaped = q.replace(/[\\%_]/g, (m) => `\\${m}`);
	const like = `%${escaped}%`;
	const rows = db
		.query(
			"SELECT id, title, content FROM campaigns WHERE title LIKE ? ESCAPE '\\' OR content LIKE ? ESCAPE '\\' ORDER BY created_at DESC"
		)
		.all(like, like) as { id: string; title: string; content: string }[];
	const lower = q.toLowerCase();
	return rows.map((r) => {
		const idx = r.content.toLowerCase().indexOf(lower);
		let snippet = '';
		if (idx >= 0) {
			const start = Math.max(0, idx - 40);
			const end = Math.min(r.content.length, idx + q.length + 70);
			snippet =
				(start > 0 ? '…' : '') +
				r.content.slice(start, end).replace(/\s+/g, ' ').trim() +
				(end < r.content.length ? '…' : '');
		}
		return { id: r.id, title: r.title, snippet };
	});
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

/** Restore a full campaign from an exported bundle; returns the new campaign id. */
export function restoreCampaign(
	bundle: {
		title?: string;
		content?: string;
		heading_meta?: { heading_id: string; shared?: number; collapsed?: number }[];
		maps?: { id: string; filename: string; width: number; height: number; grid_size?: number; active_layer?: number }[];
		tokens?: {
			map_id: string;
			label: string;
			color: string;
			x: number;
			y: number;
		}[];
		reveals?: {
			map_id: string;
			kind?: string;
			shape?: string;
			x?: number;
			y?: number;
			w?: number;
			h?: number;
			path?: [number, number][] | null;
			radius?: number | null;
			layer?: number;
		}[];
		rolls?: {
			roller?: string;
			expression?: string;
			result?: number;
			breakdown?: string;
			secret?: boolean;
			label?: string;
		}[];
	},
	imageFilenames: string[]
): string {
	const campaign = createCampaign((bundle.title ?? 'Imported Campaign').trim() || 'Imported Campaign');

	// create maps and build old-id -> new-id map
	const idMap: Record<string, string> = {};
	const maps = bundle.maps ?? [];
	for (let i = 0; i < maps.length; i++) {
		const m = maps[i];
		const nm = createMap(campaign.id, imageFilenames[i] ?? m.filename, m.width, m.height);
		idMap[m.id] = nm.id;
		if (m.grid_size) setMapGrid(nm.id, m.grid_size);
		if (m.active_layer) setMapLayer(nm.id, m.active_layer);
	}

	// rewrite ::map{id=...} directives to the new map ids
	let content = bundle.content ?? '';
	content = content.replace(/::map\{id=([A-Za-z0-9_-]+)\}/g, (match, id: string) => {
		return idMap[id] ? `::map{id=${idMap[id]}}` : match;
	});
	updateContent(campaign.id, content);

	// reveals (added in bundle order, so seq follows the original ordering)
	for (const r of bundle.reveals ?? []) {
		const mapId = idMap[r.map_id];
		if (!mapId) continue;
		const kind = r.kind === 'hide' ? 'hide' : 'reveal';
		const layer = r.layer ?? 0;
		if (r.shape === 'brush') {
			addReveal(
				mapId,
				kind,
				{
					shape: 'brush',
					path: r.path ?? [],
					radius: r.radius ?? 0.05
				},
				layer
			);
		} else {
			addReveal(
				mapId,
				kind,
				{
					shape: 'rect',
					x: r.x ?? 0,
					y: r.y ?? 0,
					w: r.w ?? 0,
					h: r.h ?? 0
				},
				layer
			);
		}
	}

	// map tokens
	for (const t of bundle.tokens ?? []) {
		const mapId = idMap[t.map_id];
		if (!mapId) continue;
		addToken(mapId, t.label ?? 'Token', t.color ?? '#8b2020', t.x ?? 0, t.y ?? 0);
	}

	// heading share/collapse meta (keys are stable id markers preserved in content)
	for (const hm of bundle.heading_meta ?? []) {
		if (hm.shared && hm.shared !== 0) setHeadingShared(campaign.id, hm.heading_id, hm.shared);
		if (hm.collapsed) setHeadingCollapsed(campaign.id, hm.heading_id, !!hm.collapsed);
	}

	// rolls
	for (const r of bundle.rolls ?? []) {
		addRoll(
			campaign.id,
			r.roller ?? 'Anonymous',
			r.expression ?? '',
			r.result ?? 0,
			r.breakdown ?? '',
			!!r.secret,
			r.label
		);
	}

	return campaign.id;
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
		'INSERT INTO maps (id, campaign_id, filename, width, height, grid_size, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)'
	).run(id, campaignId, filename, width, height, Date.now());
	return getMap(id)!;
}

export function setMapGrid(mapId: string, gridSize: number): void {
	db.query('UPDATE maps SET grid_size = ? WHERE id = ?').run(Math.max(0, Math.floor(gridSize)), mapId);
}

export function setMapLayer(mapId: string, layer: number): void {
	db.query('UPDATE maps SET active_layer = ? WHERE id = ?').run(Math.max(0, Math.floor(layer)), mapId);
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
		| { shape: 'brush'; path: [number, number][]; radius: number },
	layer = 0
): RevealOp {
	const next = (
		db
			.query('SELECT COALESCE(MAX(seq), 0) + 1 AS next FROM map_reveals WHERE map_id = ?')
			.get(mapId) as { next: number }
	).next;
	const isBrush = op.shape === 'brush';
	const row = db
		.query(
			`INSERT INTO map_reveals (map_id, kind, shape, x, y, w, h, path, radius, layer, seq)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`
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
			layer,
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
	label?: string | null;
	created_at: number;
}

export function addRoll(
	campaignId: string,
	roller: string,
	expression: string,
	result: number,
	breakdown: string,
	secret: boolean,
	label?: string
): RollRow {
	const row = db
		.query(
			`INSERT INTO rolls (campaign_id, roller, expression, result, breakdown, label, secret, created_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`
		)
		.get(
			campaignId,
			roller,
			expression,
			result,
			breakdown,
			label || null,
			secret ? 1 : 0,
			Date.now()
		) as RollRow;
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

// --- Initiative ---

export interface InitEntry {
	id: number;
	campaign_id: string;
	name: string;
	init: number;
	hp: number;
	active: number;
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

export function addInitiative(campaignId: string, name: string, init: number, hp: number): InitEntry {
	const row = db
		.query(
			`INSERT INTO initiative_entries (campaign_id, name, init, hp, created_at)
			 VALUES (?, ?, ?, ?, ?) RETURNING *`
		)
		.get(campaignId, name, init, hp, Date.now()) as InitEntry;
	return rowToInit(row);
}

export function getInitiative(id: number): InitEntry | null {
	return (db.query('SELECT * FROM initiative_entries WHERE id = ?').get(id) as InitEntry) ?? null;
}

export function updateInitiative(
	id: number,
	patch: { name?: string; hp?: number; active?: number }
): InitEntry | null {
	const current = db.query('SELECT * FROM initiative_entries WHERE id = ?').get(id) as InitEntry | null;
	if (!current) return null;
	const name = patch.name ?? current.name;
	const hp = patch.hp ?? current.hp;
	const active = patch.active ?? current.active;
	db.query('UPDATE initiative_entries SET name = ?, hp = ?, active = ? WHERE id = ?').run(
		name,
		hp,
		active,
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

// --- Map tokens ---

export interface TokenRow {
	id: string;
	map_id: string;
	label: string;
	color: string;
	x: number;
	y: number;
}

export function listTokens(mapId: string): TokenRow[] {
	return db
		.query('SELECT * FROM map_tokens WHERE map_id = ? ORDER BY created_at')
		.all(mapId) as TokenRow[];
}

export function getToken(id: string): TokenRow | null {
	return (db.query('SELECT * FROM map_tokens WHERE id = ?').get(id) as TokenRow) ?? null;
}

export function addToken(mapId: string, label: string, color: string, x: number, y: number): TokenRow {
	const id = nanoid(10);
	db.query(
		'INSERT INTO map_tokens (id, map_id, label, color, x, y, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
	).run(id, mapId, label, color, x, y, Date.now());
	return db.query('SELECT * FROM map_tokens WHERE id = ?').get(id) as TokenRow;
}

export function updateToken(id: string, patch: { x?: number; y?: number; label?: string }): TokenRow | null {
	const cur = db.query('SELECT * FROM map_tokens WHERE id = ?').get(id) as TokenRow | null;
	if (!cur) return null;
	db.query('UPDATE map_tokens SET x = ?, y = ?, label = ? WHERE id = ?').run(
		patch.x ?? cur.x,
		patch.y ?? cur.y,
		patch.label ?? cur.label,
		id
	);
	return db.query('SELECT * FROM map_tokens WHERE id = ?').get(id) as TokenRow;
}

export function removeToken(id: string): void {
	db.query('DELETE FROM map_tokens WHERE id = ?').run(id);
}

export default db;
