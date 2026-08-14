import {
	getCampaign,
	getDocument,
	listDocumentSummaries,
	renameDocument,
	deleteDocument,
	moveDocument,
	setDocumentShared
} from '$lib/server/db';
import { broadcast } from '$lib/server/sse';
import { isDM } from '$lib/server/auth';
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/** DM-only: rename / delete / move / share a document. */
export const POST: RequestHandler = async ({ params, request, cookies }) => {
	if (!isDM(cookies)) throw error(401, 'DM login required');
	const campaign = getCampaign(params.id);
	if (!campaign) throw error(404, 'Campaign not found');
	const doc = getDocument(params.docId);
	if (!doc || doc.campaign_id !== params.id) throw error(404, 'Document not found');

	const body = (await request.json()) as { action?: string; title?: string; to?: number; shared?: boolean };

	const emit = () =>
		broadcast(params.id, { type: 'documents-updated', documents: listDocumentSummaries(params.id) });

	switch (body.action) {
		case 'rename': {
			const title = (body.title ?? '').trim().slice(0, 200);
			if (!title) throw error(400, 'Title required');
			renameDocument(doc.id, title);
			emit();
			return json({ ok: true, title });
		}
		case 'delete': {
			deleteDocument(doc.id);
			emit();
			return json({ ok: true });
		}
		case 'move': {
			moveDocument(doc.id, typeof body.to === 'number' ? body.to : 0);
			emit();
			return json({ ok: true });
		}
		case 'share': {
			setDocumentShared(doc.id, body.shared === true);
			emit();
			return json({ ok: true });
		}
		default:
			throw error(400, 'Unknown action');
	}
};
