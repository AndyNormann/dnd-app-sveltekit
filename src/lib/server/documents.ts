import { db } from './conn';
import { nanoid } from 'nanoid';

export interface Document {
	id: string;
	campaign_id: string;
	title: string;
	content: string;
	position: number;
	shared: number;
	created_at: number;
	updated_at: number;
	rev: number;
}

export interface DocumentSummary {
	id: string;
	title: string;
	position: number;
	shared: number;
	updated_at: number;
}

// --- Documents ---

export function listDocuments(campaignId: string): Document[] {
	return db
		.query('SELECT * FROM documents WHERE campaign_id = ? ORDER BY position ASC, created_at ASC')
		.all(campaignId) as Document[];
}

export function listDocumentSummaries(campaignId: string): DocumentSummary[] {
	return db
		.query(
			'SELECT id, title, position, shared, updated_at FROM documents WHERE campaign_id = ? ORDER BY position ASC, created_at ASC'
		)
		.all(campaignId) as DocumentSummary[];
}

export function getDocument(id: string): Document | null {
	return (db.query('SELECT * FROM documents WHERE id = ?').get(id) as Document) ?? null;
}

/** All documents for a campaign, keyed by id (no content bloat for SSE lists). */
export function getDocumentsByCampaign(campaignId: string): Map<string, Document> {
	const rows = listDocuments(campaignId);
	return new Map(rows.map((d) => [d.id, d]));
}

export function createDocument(campaignId: string, title = 'Untitled'): Document {
	const id = nanoid(12);
	const position =
		(db.query('SELECT COALESCE(MAX(position), 0) + 1 AS p FROM documents WHERE campaign_id = ?')
			.get(campaignId) as { p: number }).p ?? 0;
	db.query(
		'INSERT INTO documents (id, campaign_id, title, content, position, shared, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, ?, ?)'
	).run(id, campaignId, title, '', position, Date.now(), Date.now());
	return getDocument(id)!;
}

/** Conditional content update keyed on the document's base rev (returns false on stale). */
export function updateDocumentConditional(id: string, content: string, expectedRev: number): boolean {
	const res = db
		.query('UPDATE documents SET content = ?, rev = rev + 1, updated_at = ? WHERE id = ? AND rev = ?')
		.run(content, Date.now(), id, expectedRev);
	return res.changes > 0;
}

/** Unconditional update (used when no rev is supplied). */
export function updateDocument(id: string, content: string): number {
	db.query('UPDATE documents SET content = ?, rev = rev + 1, updated_at = ? WHERE id = ?').run(
		content,
		Date.now(),
		id
	);
	return getDocumentRev(id);
}

export function getDocumentRev(id: string): number {
	return (db.query('SELECT rev FROM documents WHERE id = ?').get(id) as { rev: number } | undefined)
		?.rev ?? 0;
}

export function renameDocument(id: string, title: string): void {
	db.query('UPDATE documents SET title = ?, updated_at = ? WHERE id = ?').run(title, Date.now(), id);
}

export function setDocumentShared(id: string, shared: boolean): void {
	db.query('UPDATE documents SET shared = ? WHERE id = ?').run(shared ? 1 : 0, id);
}

export function deleteDocument(id: string): void {
	db.query('DELETE FROM documents WHERE id = ?').run(id);
}

/** Reorder a document to `toPosition` (0-based), shifting others within the campaign. */
export function moveDocument(id: string, toPosition: number): void {
	const doc = getDocument(id);
	if (!doc) return;
	const docs = listDocuments(doc.campaign_id);
	if (toPosition < 0) toPosition = 0;
	if (toPosition >= docs.length) toPosition = docs.length - 1;
	const from = docs.findIndex((d) => d.id === id);
	if (from < 0) return;
	const [removed] = docs.splice(from, 1);
	docs.splice(toPosition, 0, removed);
	db.query('BEGIN').run();
	try {
		docs.forEach((d, i) => {
			db.query('UPDATE documents SET position = ? WHERE id = ?').run(i, d.id);
		});
		db.query('COMMIT').run();
	} catch {
		db.query('ROLLBACK').run();
	}
}

/**
 * Migration: ensure every campaign has at least one document. Campaigns that
 * still hold content in `campaigns.content` (pre-document model) get that
 * content moved into a single "Notes" document. Idempotent.
 */
export function ensureDocumentsForCampaigns(): void {
	const campaigns = db.query('SELECT id, title, content FROM campaigns').all() as {
		id: string;
		title: string;
		content: string;
	}[];
	for (const c of campaigns) {
		const count = (
			db.query('SELECT COUNT(*) AS n FROM documents WHERE campaign_id = ?').get(c.id) as {
				n: number;
			}
		).n;
		if (count > 0) continue;
		const content = c.content || '';
		const id = nanoid(12);
		db.query(
			'INSERT INTO documents (id, campaign_id, title, content, position, shared, created_at, updated_at) VALUES (?, ?, ?, ?, 0, 0, ?, ?)'
		).run(id, c.id, c.title || 'Notes', content, Date.now(), Date.now());
	}
}
