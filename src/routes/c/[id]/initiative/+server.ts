import {
	getCampaign,
	listInitiative,
	addInitiative,
	updateInitiative,
	clearInitiative,
	getInitiativeRound,
	setInitiativeRound
} from '$lib/server/db';
import { broadcast } from '$lib/server/sse';
import { isDM } from '$lib/server/auth';
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { InitEntry } from '$lib/server/db';

function broadcastInitiative(campaignId: string) {
	broadcast(campaignId, {
		type: 'initiative-updated',
		entries: listInitiative(campaignId),
		round: getInitiativeRound(campaignId)
	});
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
		setInitiativeRound(params.id, 1);
	} else if (body.action === 'next') {
		const entries: InitEntry[] = listInitiative(params.id);
		const activeIndex = entries.findIndex((e) => e.active === 1);
		if (entries.length) {
			const nextIndex = (activeIndex + 1) % entries.length;
			let round = getInitiativeRound(params.id);
			// wrapping past the last combatant begins a new round
			if (activeIndex === entries.length - 1) round += 1;
			for (const e of entries) updateInitiative(e.id, { active: 0 });
			updateInitiative(entries[nextIndex].id, { active: 1 });
			setInitiativeRound(params.id, round);
		}
	} else {
		throw error(400, 'Unknown action');
	}

	broadcastInitiative(params.id);
	return json({ ok: true });
};
