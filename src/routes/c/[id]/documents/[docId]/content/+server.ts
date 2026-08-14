import { getCampaign, getDocument, updateDocumentConditional, updateDocument, getDocumentRev } from '$lib/server/db';
import { broadcast } from '$lib/server/sse';
import { renderDocument } from '$lib/server/markdown.server';
import { isDM } from '$lib/server/auth';
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/** DM-only: update a document's markdown content (with a per-document rev guard). */
export const POST: RequestHandler = async ({ params, request, cookies }) => {
	if (!isDM(cookies)) throw error(401, 'DM login required');
	const campaign = getCampaign(params.id);
	if (!campaign) throw error(404, 'Campaign not found');
	const doc = getDocument(params.docId);
	if (!doc || doc.campaign_id !== params.id) throw error(404, 'Document not found');

	const body = (await request.json()) as { content?: string; rev?: number; force?: boolean };
	const expectedRev = typeof body.rev === 'number' ? body.rev : null;
	const force = body.force === true;

	if (expectedRev !== null && !force) {
		if (!updateDocumentConditional(doc.id, body.content ?? '', expectedRev)) {
			throw error(409, 'Content changed elsewhere; refresh to avoid overwriting');
		}
	} else {
		updateDocument(doc.id, body.content ?? '');
	}

	const rev = getDocumentRev(doc.id);
	broadcast(params.id, { type: 'document-updated', documentId: doc.id, html: renderDocument(body.content ?? '') });
	return json({ rev });
};
