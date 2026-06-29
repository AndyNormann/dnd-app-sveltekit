import { getCampaign, getHeadingMeta, updateContent } from '$lib/server/db';
import { broadcast } from '$lib/server/sse';
import { ensureHeadingIds, toMetaMap } from '$lib/markdown';
import { renderSharedForPlayer } from '$lib/server/markdown.server';
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, request }) => {
	const campaign = getCampaign(params.id);
	if (!campaign) throw error(404, 'Campaign not found');

	const body = (await request.json()) as { content: string };
	const { content } = ensureHeadingIds(body.content ?? '');
	updateContent(params.id, content);

	const meta = toMetaMap(getHeadingMeta(params.id));
	broadcast(params.id, { type: 'doc-updated', html: renderSharedForPlayer(content, meta) });

	return json({ content });
};
