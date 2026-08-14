import { db } from './conn';
import { nanoid } from 'nanoid';
import { createDocument } from './documents';
import { createMap, setMapGrid, setMapLayer, addReveal, addToken } from './maps';
import { addRoll } from './rolls';

export interface Campaign {
	id: string;
	title: string;
	content: string;
	created_at: number;
	updated_at: number;
	rev: number;
}

// --- Campaigns ---

export function listCampaigns(): Campaign[] {
	return db.query('SELECT * FROM campaigns ORDER BY created_at DESC').all() as Campaign[];
}

export interface CampaignSummary {
	id: string;
	title: string;
	created_at: number;
	updated_at: number;
	maps: number;
	rolls: number;
}

/** Dashboard list: campaigns ordered by last-edited, with roll/map counts. */
export function listCampaignSummaries(): CampaignSummary[] {
	return db
		.query(
			`SELECT c.id, c.title, c.created_at, c.updated_at,
				(SELECT COUNT(*) FROM maps m WHERE m.campaign_id = c.id) AS maps,
				(SELECT COUNT(*) FROM rolls r WHERE r.campaign_id = c.id) AS rolls
			FROM campaigns c
			ORDER BY CASE WHEN c.updated_at = 0 THEN c.created_at ELSE c.updated_at END DESC
			LIMIT 200`
		)
		.all() as CampaignSummary[];
}

export function getCampaign(id: string): Campaign | null {
	return (db.query('SELECT * FROM campaigns WHERE id = ?').get(id) as Campaign) ?? null;
}

export function createCampaign(title: string): Campaign {
	const id = nanoid(10);
	db.query('INSERT INTO campaigns (id, title, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run(
		id,
		title,
		'',
		Date.now(),
		Date.now()
	);
	createDocument(id, title || 'Notes');
	return getCampaign(id)!;
}

/** Write content and bump the revision (unconditional; used by restore/canonicalize). */
export function updateContent(id: string, content: string): void {
	db.query('UPDATE campaigns SET content = ?, rev = rev + 1, updated_at = ? WHERE id = ?').run(
		content,
		Date.now(),
		id
	);
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
		.query('UPDATE campaigns SET content = ?, rev = rev + 1, updated_at = ? WHERE id = ? AND rev = ?')
		.run(content, Date.now(), id, expectedRev);
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
	db.query('UPDATE campaigns SET title = ?, updated_at = ? WHERE id = ?').run(title, Date.now(), id);
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
		documents?: {
			id?: string;
			title?: string;
			content?: string;
			position?: number;
			shared?: boolean | number;
		}[];
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

	const rewriteMaps = (md: string) =>
		md.replace(/::map\{id=([A-Za-z0-9_-]+)\}/g, (match, id: string) =>
			idMap[id] ? `::map{id=${idMap[id]}}` : match
		);

	// documents: if the bundle carries documents, replace the seeded doc; else
	// put the legacy single-blob content into the seeded doc. Map ids are
	// rewritten to the fresh map ids.
	db.query('DELETE FROM documents WHERE campaign_id = ?').run(campaign.id);
	if (bundle.documents && bundle.documents.length > 0) {
		for (const d of bundle.documents) {
			db.query(
				'INSERT INTO documents (id, campaign_id, title, content, position, shared, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
			).run(
				nanoid(12),
				campaign.id,
				(d.title ?? 'Untitled').slice(0, 200),
				rewriteMaps(d.content ?? ''),
				d.position ?? 0,
				d.shared ? 1 : 0,
				Date.now(),
				Date.now()
			);
		}
	} else if (bundle.content) {
		db.query('UPDATE documents SET content = ?, updated_at = ? WHERE campaign_id = ?').run(
			rewriteMaps(bundle.content),
			Date.now(),
			campaign.id
		);
	}

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
