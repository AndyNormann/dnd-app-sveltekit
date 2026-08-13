import {
	getCampaign,
	getCampaignRev,
	getHeadingMeta,
	updateContent,
	updateContentConditional
} from '$lib/server/db';
import { broadcast } from '$lib/server/sse';
import { ensureHeadingIds, toMetaMap } from '$lib/markdown';
import { renderSharedForPlayer } from '$lib/server/markdown.server';
import { isDM } from '$lib/server/auth';
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, request, cookies }) => {
	if (!isDM(cookies)) throw error(401, 'DM login required');
	const campaign = getCampaign(params.id);
	if (!campaign) throw error(404, 'Campaign not found');

	const body = (await request.json()) as { content: string; rev?: number; force?: boolean };
	const expectedRev = typeof body.rev === 'number' ? body.rev : null;
	const force = body.force === true;
	const { content } = ensureHeadingIds(body.content ?? '');

	// Optimistic-concurrency guard: reject stale writes so two open editor tabs
	// can't silently clobber each other — unless the user explicitly chose to keep
	// their version (force), which overwrites unconditionally.
	if (expectedRev !== null && !force) {
		if (!updateContentConditional(params.id, content, expectedRev)) {
			throw error(409, 'Content changed elsewhere; refresh to avoid overwriting');
		}
	} else {
		updateContent(params.id, content);
	}

	const rev = getCampaignRev(params.id);

	const meta = toMetaMap(getHeadingMeta(params.id));
	broadcast(params.id, { type: 'doc-updated', html: renderSharedForPlayer(content, meta) });

	return json({ content, rev });
};
