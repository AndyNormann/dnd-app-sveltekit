import { db } from './conn';

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

/** Delete all rolls for a campaign (persistent, DM-only). */
export function clearRolls(campaignId: string): void {
	db.query('DELETE FROM rolls WHERE campaign_id = ?').run(campaignId);
}

/** Re-insert a snapshot of rolls by their original ids (used to undo a clear). */
export function restoreRolls(rows: RollRow[]): void {
	const stmt = db.query(
		'INSERT INTO rolls (id, campaign_id, roller, expression, result, breakdown, label, secret, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING'
	);
	for (const r of rows) {
		stmt.run(r.id, r.campaign_id, r.roller, r.expression, r.result, r.breakdown, r.label ?? null, r.secret, r.created_at);
	}
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

/** Fetch a single roll by id (for scoping checks). */
export function getRoll(id: number): (RollRow & { campaign_id: string }) | null {
	return (db.query('SELECT * FROM rolls WHERE id = ?').get(id) as RollRow & {
		campaign_id: string;
	}) ?? null;
}

/** Clear the secret flag on a roll so it can be shown to players. */
export function unsecretRoll(id: number): RollRow | null {
	db.query('UPDATE rolls SET secret = 0 WHERE id = ?').run(id);
	return (db.query('SELECT * FROM rolls WHERE id = ?').get(id) as RollRow) ?? null;
}
