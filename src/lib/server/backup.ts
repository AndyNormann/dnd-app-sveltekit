import { mkdirSync, readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import db, { checkpoint } from './db';

const BACKUP_DIR = process.env.BACKUP_DIR ?? 'data/backups';
// how often to snapshot (default 30 min)
const BACKUP_INTERVAL_MS = (Number(process.env.BACKUP_INTERVAL_MS) || 30 * 60 * 1000);
// how many snapshots to keep (default 24)
const BACKUP_KEEP = Math.max(1, Number(process.env.BACKUP_KEEP) || 24);
// when to take the first snapshot after boot (default 1 min)
const INITIAL_DELAY_MS = Number(process.env.BACKUP_INITIAL_DELAY_MS) || 60_000;

/**
 * Snapshot the live DB to a clean, standalone file via VACUUM INTO (which
 * includes all committed WAL data), then prune old backups keeping the newest
 * BACKUP_KEEP. Returns the path written.
 */
export function backupNow(): string {
	checkpoint();
	mkdirSync(BACKUP_DIR, { recursive: true });
	// timestamp without colons so the filename is safe inside the SQL string
	const ts = new Date().toISOString().replace(/[:.]/g, '-');
	const dest = join(BACKUP_DIR, `app-${ts}.db`);
	db.exec(`VACUUM INTO '${dest.replace(/'/g, "''")}'`);

	const backups = readdirSync(BACKUP_DIR).filter((f) => f.endsWith('.db')).sort();
	while (backups.length > BACKUP_KEEP) {
		const oldest = backups.shift()!;
		try {
			unlinkSync(join(BACKUP_DIR, oldest));
		} catch {
			// best-effort prune
		}
	}
	return dest;
}

let started = false;

/** Idempotent: starts the periodic backup + checkpoint scheduler (called from hooks). */
export function startBackupScheduler(): void {
	if (started) return;
	started = true;

	const run = () => {
		try {
			backupNow();
		} catch (err) {
			console.error('[backup] snapshot failed:', err);
		}
	};

	setTimeout(run, INITIAL_DELAY_MS);
	setInterval(run, BACKUP_INTERVAL_MS);
}
