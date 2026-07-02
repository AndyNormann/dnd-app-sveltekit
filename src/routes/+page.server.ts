import { redirect } from '@sveltejs/kit';
import { createCampaign, deleteCampaign, listCampaigns } from '$lib/server/db';
import { unlink } from 'node:fs/promises';
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
	},
	delete: async ({ request }) => {
		const data = await request.formData();
		const id = data.get('id') as string;
		if (!id) return { ok: false };
		const files = deleteCampaign(id);
		await Promise.allSettled(files.map((f) => unlink(`static/uploads/${f}`)));
		return { ok: true };
	}
};
