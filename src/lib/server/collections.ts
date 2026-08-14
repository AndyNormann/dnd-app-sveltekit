import { db } from './conn';
import { nanoid } from 'nanoid';

/**
 * Monster collections: named groups of monster templates (with counts) that the
 * DM assembles on the Roster page and drops onto the combat board in one step
 * ("add collection"). Stored as JSON items to keep the CRUD simple.
 */
export interface CollectionItem {
	monster_id: string;
	count: number;
}

export interface CollectionRow {
	id: string;
	campaign_id: string;
	name: string;
	items: CollectionItem[];
	created_at: number;
}

function parseItems(s: string): CollectionItem[] {
	try {
		const arr = JSON.parse(s);
		return Array.isArray(arr) ? (arr as CollectionItem[]) : [];
	} catch {
		return [];
	}
}

function toCollection(
	r: Omit<CollectionRow, 'items'> & { items: string }
): CollectionRow {
	return { ...r, items: parseItems(r.items) };
}

export function listCollections(campaignId: string): CollectionRow[] {
	const rows = db
		.query('SELECT * FROM collections WHERE campaign_id = ? ORDER BY created_at')
		.all(campaignId) as (Omit<CollectionRow, 'items'> & { items: string })[];
	return rows.map(toCollection);
}

export function getCollection(id: string): CollectionRow | null {
	const r = db
		.query('SELECT * FROM collections WHERE id = ?')
		.get(id) as (Omit<CollectionRow, 'items'> & { items: string }) | null;
	if (!r) return null;
	return toCollection(r);
}

export function createCollection(
	campaignId: string,
	name: string,
	items: CollectionItem[]
): CollectionRow {
	const id = nanoid(10);
	const created_at = Date.now();
	db.query(
		'INSERT INTO collections (id, campaign_id, name, items, created_at) VALUES (?, ?, ?, ?, ?)'
	).run(id, campaignId, name, JSON.stringify(items), created_at);
	return { id, campaign_id: campaignId, name, items, created_at };
}

export function updateCollection(
	id: string,
	name: string,
	items: CollectionItem[]
): CollectionRow | null {
	const cur = db.query('SELECT * FROM collections WHERE id = ?').get(id) as (Omit<CollectionRow, 'items'> & { items: string }) | null;
	if (!cur) return null;
	db.query('UPDATE collections SET name = ?, items = ? WHERE id = ?').run(
		name,
		JSON.stringify(items),
		id
	);
	return toCollection({ ...cur, name, items: JSON.stringify(items) });
}

export function deleteCollection(id: string): void {
	db.query('DELETE FROM collections WHERE id = ?').run(id);
}
