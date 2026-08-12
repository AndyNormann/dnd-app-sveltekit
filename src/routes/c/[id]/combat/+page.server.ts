import { getCampaign, listInitiative, getInitiativeRound } from '$lib/server/db';
import { isDM } from '$lib/server/auth';
import { redirect, error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ params, cookies, url }) => {
	if (!isDM(cookies)) throw redirect(303, `/login?redirect=${encodeURIComponent(url.pathname)}`);
	const campaign = getCampaign(params.id);
	if (!campaign) throw error(404, 'Campaign not found');

	return {
		campaignId: campaign.id,
		title: campaign.title,
		initiative: listInitiative(params.id),
		initiativeRound: getInitiativeRound(params.id)
	};
};
