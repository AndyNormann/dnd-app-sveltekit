import { startBackupScheduler } from '$lib/server/backup';
import type { Handle } from '@sveltejs/kit';

/**
 * Server hooks. We start the periodic DB backup + checkpoint scheduler from
 * here (idempotent) so a long-lived process keeps a rolling snapshot of the
 * whole campaign independent of any single request lifecycle.
 */
export const handle: Handle = ({ event, resolve }) => {
	startBackupScheduler();
	return resolve(event);
};
