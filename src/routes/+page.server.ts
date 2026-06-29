import { redirect } from '@sveltejs/kit';
import { createCampaign, listCampaigns } from '$lib/server/db';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = () => {
	return { campaigns: listCampaigns() };
};

export const actions: Actions = {
	create: async ({ request }) => {
		const data = await request.formData();
		const title = (data.get('title') as string)?.trim() || 'Untitled Campaign';
		const campaign = createCampaign(title);
		throw redirect(303, `/c/${campaign.id}`);
	}
};
