import { getCampaign, getHeadingMeta, listMaps, listReveals, updateContent } from '$lib/server/db';
import { ensureHeadingIds } from '$lib/markdown';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import type { MapData } from '$lib/types';

export const load: PageServerLoad = ({ params }) => {
	const campaign = getCampaign(params.id);
	if (!campaign) throw error(404, 'Campaign not found');

	// canonicalize ids on load so freshly-typed headings get stable ids
	const { content, changed } = ensureHeadingIds(campaign.content);
	if (changed) updateContent(params.id, content);

	const meta = getHeadingMeta(params.id);
	const maps: MapData[] = listMaps(params.id).map((m) => ({
		id: m.id,
		width: m.width,
		height: m.height,
		src: `/uploads/${m.filename}`,
		reveals: listReveals(m.id)
	}));

	return {
		campaignId: campaign.id,
		title: campaign.title,
		content,
		meta,
		maps
	};
};
