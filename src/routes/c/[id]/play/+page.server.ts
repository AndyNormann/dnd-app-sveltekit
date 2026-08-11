import { getCampaign, getHeadingMeta, listMaps, listReveals, listRolls, listInitiative } from '$lib/server/db';
import { toMetaMap } from '$lib/markdown';
import { renderSharedForPlayer } from '$lib/server/markdown.server';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import type { MapData } from '$lib/types';

export const load: PageServerLoad = ({ params }) => {
	const campaign = getCampaign(params.id);
	if (!campaign) throw error(404, 'Campaign not found');

	const meta = toMetaMap(getHeadingMeta(params.id));
	const html = renderSharedForPlayer(campaign.content, meta);

	const maps: MapData[] = listMaps(params.id).map((m) => ({
		id: m.id,
		width: m.width,
		height: m.height,
		src: `/uploads/${m.filename}`,
		reveals: listReveals(m.id),
		grid_size: m.grid_size,
		active_layer: m.active_layer
	}));

	const rolls = listRolls(params.id, false).map((r) => ({
		id: r.id,
		roller: r.roller,
		expression: r.expression,
		result: r.result,
		breakdown: r.breakdown,
		secret: false,
		label: r.label ?? undefined,
		created_at: r.created_at
	}));

	return { campaignId: campaign.id, title: campaign.title, html, maps, rolls, initiative: listInitiative(params.id) };
};
