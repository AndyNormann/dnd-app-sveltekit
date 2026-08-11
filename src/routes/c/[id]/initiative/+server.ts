import {
	getCampaign,
	listInitiative,
	addInitiative,
	updateInitiative,
	clearInitiative
} from '$lib/server/db';
import { broadcast } from '$lib/server/sse';
import { isDM } from '$lib/server/auth';
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { InitEntry } from '$lib/server/db';

function broadcastInitiative(campaignId: string) {
	broadcast(campaignId, { type: 'initiative-updated', entries: listInitiative(campaignId) });
}

export const GET: RequestHandler = ({ params }) => {
	const campaign = getCampaign(params.id);
	if (!campaign) throw error(404, 'Campaign not found');
	return json(listInitiative(params.id));
};

export const POST: RequestHandler = async ({ params, request, cookies }) => {
	if (!isDM(cookies)) throw error(401, 'DM login required');
	const campaign = getCampaign(params.id);
	if (!campaign) throw error(404, 'Campaign not found');

	const body = (await request.json()) as {
		action?: string;
		name?: string;
		init?: number;
		hp?: number;
	};

	if (body.action === 'add') {
		const name = (body.name ?? '').trim().slice(0, 60);
		if (!name) throw error(400, 'Name required');
		const init = Number(body.init);
		if (!Number.isFinite(init)) throw error(400, 'Invalid initiative');
		addInitiative(params.id, name, init, Number(body.hp) || 0);
	} else if (body.action === 'clear') {
		clearInitiative(params.id);
	} else if (body.action === 'next') {
		const entries: InitEntry[] = listInitiative(params.id);
		const activeIndex = entries.findIndex((e) => e.active === 1);
		const nextIndex = entries.length ? (activeIndex + 1) % entries.length : -1;
		for (const e of entries) updateInitiative(e.id, { active: 0 });
		if (nextIndex >= 0) updateInitiative(entries[nextIndex].id, { active: 1 });
	} else {
		throw error(400, 'Unknown action');
	}

	broadcastInitiative(params.id);
	return json({ ok: true });
};
