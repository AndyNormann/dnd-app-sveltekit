import { redirect } from '@sveltejs/kit';
import { createCampaign, deleteCampaign, listCampaignSummaries, restoreCampaign, searchCampaigns } from '$lib/server/db';
import { isDM } from '$lib/server/auth';
import { listBackups } from '$lib/server/backup';
import { UPLOAD_DIR } from '$lib/server/uploads';
import { mkdirSync } from 'node:fs';
import { unlink, writeFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { nanoid } from 'nanoid';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ url, cookies }) => {
	const q = url.searchParams.get('q')?.trim() ?? '';
	const dm = isDM(cookies);
	if (q) return { campaigns: [], query: q, results: searchCampaigns(q), isDM: dm };
	// only the DM sees the backup list (a snapshot contains the whole DB)
	const backups = dm ? listBackups() : [];
	return { campaigns: listCampaignSummaries(), query: '', results: [], isDM: dm, backups };
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
		await Promise.allSettled(files.map((f) => unlink(`${UPLOAD_DIR}/${f}`)));
		return { ok: true };
	},
	import: async ({ request }) => {
		const data = await request.formData();
		const file = data.get('file');
		if (!(file instanceof File)) return { error: 'No file provided' };
		let bundle: Record<string, unknown>;
		try {
			bundle = JSON.parse(await file.text());
		} catch {
			return { error: 'File is not valid JSON' };
		}
		if ((bundle as { app?: string }).app !== 'dnd-campaign-notes') {
			return { error: 'File is not a campaign bundle' };
		}
		const maps = (bundle.maps ?? []) as {
			filename: string;
			base64?: string;
		}[];
		mkdirSync(UPLOAD_DIR, { recursive: true });
		// generate safe filenames ourselves; never trust the bundle's filename (path traversal)
		const filenames: string[] = [];
		for (const m of maps) {
			const ext = (extname(m.filename || '') || '').toLowerCase();
			const safe = /^\.(png|jpe?g|gif|webp|avif)$/.test(ext) ? ext : '.png';
			const name = `${nanoid(12)}${safe}`;
			if (m.base64) await writeFile(`${UPLOAD_DIR}/${name}`, Buffer.from(m.base64, 'base64'));
			filenames.push(name);
		}
		const id = restoreCampaign(bundle as Parameters<typeof restoreCampaign>[0], filenames);
		throw redirect(303, `/c/${id}`);
	}
};
