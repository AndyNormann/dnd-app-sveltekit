import { getCampaign, getHeadingMeta, setHeadingShared } from '$lib/server/db';
import { broadcast } from '$lib/server/sse';
import { toMetaMap } from '$lib/markdown';
import { renderSharedForPlayer } from '$lib/server/markdown.server';
import { isDM } from '$lib/server/auth';
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * "Reveal handout": mark a section shared (so players can see it) and push a
 * `handout-revealed` event so players' views scroll to and highlight it.
 */
export const POST: RequestHandler = async ({ params, request, cookies }) => {
	if (!isDM(cookies)) throw error(401, 'DM login required');
	const campaign = getCampaign(params.id);
	if (!campaign) throw error(404, 'Campaign not found');

	const body = (await request.json()) as { headingId: string };
	if (!body.headingId) throw error(400, 'headingId required');

	// ensure players can see the section
	setHeadingShared(params.id, body.headingId, 1);

	const meta = toMetaMap(getHeadingMeta(params.id));
	broadcast(params.id, { type: 'share-changed', html: renderSharedForPlayer(campaign.content, meta) });
	broadcast(params.id, { type: 'handout-revealed', headingId: body.headingId });

	return json({ ok: true });
};
