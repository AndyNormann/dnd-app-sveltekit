import { db } from './conn';
import { nanoid } from 'nanoid';

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

// --- Reveal undo / clear ---

/** Delete the most recent reveal/hide op on a map+layer; returns its id (or null). */
export function removeLastReveal(mapId: string, layer: number): number | null {
	const row = db
		.query('SELECT id FROM map_reveals WHERE map_id = ? AND layer = ? ORDER BY seq DESC LIMIT 1')
		.get(mapId, layer) as { id: number } | null;
	if (!row) return null;
	db.query('DELETE FROM map_reveals WHERE id = ?').run(row.id);
	return row.id;
}

/** Delete every reveal/hide op on a map+layer; returns how many were removed. */
export function clearLayerReveals(mapId: string, layer: number): number {
	return db.query('DELETE FROM map_reveals WHERE map_id = ? AND layer = ?').run(mapId, layer)
		.changes;
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

