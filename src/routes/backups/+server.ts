import { listBackups } from '$lib/server/backup';
import { isDM } from '$lib/server/auth';
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ cookies }) => {
	// Backups contain the whole DB, so only the DM can list them.
	if (!isDM(cookies)) throw error(401, 'DM login required');
	return json(listBackups());
};
