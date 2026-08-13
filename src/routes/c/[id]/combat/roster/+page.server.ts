import { getCampaign, listCharacters, listMonsters } from '$lib/server/db';
import { isDM } from '$lib/server/auth';
import { PLAYER_COOKIE } from '$lib/server/player';
import { redirect, error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ params, cookies, url }) => {
	if (!isDM(cookies)) throw redirect(303, `/login?redirect=${encodeURIComponent(url.pathname)}`);
	// acting as DM here: drop any lingering player-portal cookie so DM override stays free
	cookies.delete(PLAYER_COOKIE, { path: '/' });
	const campaign = getCampaign(params.id);
	if (!campaign) throw error(404, 'Campaign not found');

	return {
		campaignId: campaign.id,
		title: campaign.title,
		characters: listCharacters(params.id),
		monsters: listMonsters(params.id)
	};
};
