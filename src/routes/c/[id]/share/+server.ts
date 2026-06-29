import { getCampaign, getHeadingMeta, setHeadingShared } from '$lib/server/db';
import { broadcast } from '$lib/server/sse';
import { toMetaMap, SHARE_SHARED, SHARE_HIDDEN, type ShareState } from '$lib/markdown';
import { renderSharedForPlayer } from '$lib/server/markdown.server';
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, request }) => {
	const campaign = getCampaign(params.id);
	if (!campaign) throw error(404, 'Campaign not found');

	const body = (await request.json()) as { headingId: string; state: ShareState };
	if (body.state !== SHARE_SHARED && body.state !== SHARE_HIDDEN && body.state !== 0) {
		throw error(400, 'Invalid share state');
	}
	setHeadingShared(params.id, body.headingId, body.state);

	const meta = toMetaMap(getHeadingMeta(params.id));
	broadcast(params.id, {
		type: 'share-changed',
		html: renderSharedForPlayer(campaign.content, meta)
	});

	return json({ ok: true });
};
