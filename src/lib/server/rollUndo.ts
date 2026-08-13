import type { RollRow } from './db';

/**
 * In-memory undo snapshots for a recent roll-history clear. Survives the client's
 * toast window but not a redeploy — this is transient session state, intentionally
 * kept in one owned place (alongside the SSE `channels` map in sse.ts) rather than
 * smuggled into a stateless route module.
 */

interface UndoEntry {
	campaignId: string;
	rows: RollRow[];
	expires: number;
}

const UNDO_TTL = 30_000;
const undoMap = new Map<string, UndoEntry>();

function sweepExpired() {
	const now = Date.now();
	for (const [k, v] of undoMap) if (v.expires < now) undoMap.delete(k);
}

/** Snapshot `rows` for a campaign and return the key the client uses to undo. */
export function snapshotRolls(campaignId: string, rows: RollRow[]): string {
	sweepExpired();
	const key = crypto.randomUUID();
	undoMap.set(key, { campaignId, rows, expires: Date.now() + UNDO_TTL });
	return key;
}

/** Fetch and consume a roll-undo snapshot if it is valid and unexpired; else null. */
export function consumeRollUndo(key: string, campaignId: string): RollRow[] | null {
	sweepExpired();
	const entry = key ? undoMap.get(key) : undefined;
	if (!entry || entry.campaignId !== campaignId || entry.expires < Date.now()) return null;
	undoMap.delete(key);
	return entry.rows;
}
