import { getCampaign, createDocument, listDocumentSummaries } from '$lib/server/db';
import { broadcast } from '$lib/server/sse';
import { isDM } from '$lib/server/auth';
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/** DM-only: list the campaign's documents. */
export const GET: RequestHandler = async ({ params, cookies }) => {
	if (!isDM(cookies)) throw error(401, 'DM login required');
	const campaign = getCampaign(params.id);
	if (!campaign) throw error(404, 'Campaign not found');
	return json({ documents: listDocumentSummaries(params.id) });
};

/** DM-only: create a new document in the campaign. */
export const POST: RequestHandler = async ({ params, request, cookies }) => {
	if (!isDM(cookies)) throw error(401, 'DM login required');
	const campaign = getCampaign(params.id);
	if (!campaign) throw error(404, 'Campaign not found');

	const body = (await request.json()) as { title?: string };
	const title = (body.title ?? '').trim().slice(0, 200) || 'Untitled';
	const doc = createDocument(params.id, title);

	broadcast(params.id, { type: 'documents-updated', documents: listDocumentSummaries(params.id) });
	return json({ id: doc.id, title: doc.title });
};
