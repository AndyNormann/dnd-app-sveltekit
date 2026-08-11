import { getCampaign, getInitiative, listInitiative, updateInitiative, removeInitiative } from '$lib/server/db';
import { broadcast } from '$lib/server/sse';
import { isDM } from '$lib/server/auth';
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, request, cookies }) => {
	if (!isDM(cookies)) throw error(401, 'DM login required');
	const campaign = getCampaign(params.id);
	if (!campaign) throw error(404, 'Campaign not found');

	const id = Number(params.entryId);
	if (!Number.isFinite(id)) throw error(400, 'Invalid entry id');
	// scope: the entry must belong to this campaign
	const entry = getInitiative(id);
	if (!entry || entry.campaign_id !== params.id) throw error(404, 'Entry not found');

	const body = (await request.json()) as { action?: string; hp?: number; active?: boolean };
	if (body.action === 'remove') {
		removeInitiative(id);
	} else {
		const patch: { hp?: number; active?: number } = {};
		if (typeof body.hp === 'number' && Number.isFinite(body.hp)) patch.hp = body.hp;
		if (typeof body.active === 'boolean') patch.active = body.active ? 1 : 0;
		const updated = updateInitiative(id, patch);
		if (!updated) throw error(404, 'Entry not found');
	}

	broadcast(params.id, { type: 'initiative-updated', entries: listInitiative(params.id) });
	return json({ ok: true });
};
