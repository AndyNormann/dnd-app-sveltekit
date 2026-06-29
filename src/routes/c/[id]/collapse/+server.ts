import { getCampaign, setHeadingCollapsed } from '$lib/server/db';
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, request }) => {
	const campaign = getCampaign(params.id);
	if (!campaign) throw error(404, 'Campaign not found');

	const body = (await request.json()) as { headingId: string; collapsed: boolean };
	setHeadingCollapsed(params.id, body.headingId, body.collapsed);
	return json({ ok: true });
};
