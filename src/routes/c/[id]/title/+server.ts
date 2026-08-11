import { getCampaign, updateTitle } from '$lib/server/db';
import { broadcast } from '$lib/server/sse';
import { isDM } from '$lib/server/auth';
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, request, cookies }) => {
	if (!isDM(cookies)) throw error(401, 'DM login required');
	const campaign = getCampaign(params.id);
	if (!campaign) throw error(404, 'Campaign not found');

	const body = (await request.json()) as { title?: string };
	const title = (body.title ?? '').trim().slice(0, 120);
	if (!title) throw error(400, 'Title required');

	updateTitle(params.id, title);
	broadcast(params.id, { type: 'title-changed', title });

	return json({ title });
};
