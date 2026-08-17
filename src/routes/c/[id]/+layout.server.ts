import { getCampaign } from '$lib/server/db';
import { isDM } from '$lib/server/auth';
import { error, redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ params, cookies, url }) => {
	if (!isDM(cookies)) throw redirect(303, `/login?redirect=${encodeURIComponent(url.pathname)}`);
	const campaign = getCampaign(params.id);
	if (!campaign) throw error(404, 'Campaign not found');
	return { campaignId: campaign.id, campaignTitle: campaign.title };
};
