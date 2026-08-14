import { startBackupScheduler } from '$lib/server/backup';
import { ensureDocumentsForCampaigns } from '$lib/server/documents';
import type { Handle } from '@sveltejs/kit';

let migrated = false;

/**
 * Server hooks. We start the periodic DB backup + checkpoint scheduler and the
 * one-time documents migration from here (both idempotent) so a long-lived
 * process keeps a rolling snapshot and any pre-document campaigns get a doc.
 */
export const handle: Handle = ({ event, resolve }) => {
	startBackupScheduler();
	if (!migrated) {
		migrated = true;
		ensureDocumentsForCampaigns();
	}
	return resolve(event);
};
