import { listBackups, resolveBackup, backupNow } from '$lib/server/backup';
import { isDM } from '$lib/server/auth';
import { closeDb, reopenDb, DB_PATH } from '$lib/server/conn';
import { checkpoint } from '$lib/server/db';
import { copyFile } from 'node:fs/promises';
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, cookies }) => {
	if (!isDM(cookies)) throw error(401, 'DM login required');
	const path = resolveBackup(params.name);
	if (!path) throw error(400, 'Invalid backup name');
	return new Response(await Bun.file(path).arrayBuffer(), {
		headers: {
			'Content-Type': 'application/octet-stream',
			'Content-Disposition': `attachment; filename="${params.name}"`
		}
	});
};

/**
 * Restore the live DB from a dated snapshot: snapshot the current state first
 * (so a restore gone wrong is recoverable), close the connection, swap the file,
 * then hot-reopen. Every module holds the live `db` binding, so the reopen takes
 * effect immediately. The client reloads to pick up the new data.
 */
export const POST: RequestHandler = async ({ params, cookies }) => {
	if (!isDM(cookies)) throw error(401, 'DM login required');
	const path = resolveBackup(params.name);
	if (!path) throw error(400, 'Invalid backup name');
	backupNow(); // safety snapshot of the current DB before overwriting it
	checkpoint();
	closeDb();
	try {
		await copyFile(path, DB_PATH);
	} catch (err) {
		reopenDb();
		throw error(500, 'Could not restore backup');
	}
	reopenDb();
	return json({ ok: true });
};
