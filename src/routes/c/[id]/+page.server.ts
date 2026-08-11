import {
	getCampaign,
	getHeadingMeta,
	listMaps,
	listReveals,
	listRolls,
	updateContent,
	listInitiative
} from '$lib/server/db';
import { ensureHeadingIds } from '$lib/markdown';
import { isDM } from '$lib/server/auth';
import { redirect, error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import type { MapData } from '$lib/types';

export const load: PageServerLoad = ({ params, cookies, url }) => {
	// The DM editor page exposes content editing and secret rolls — DM only.
	if (!isDM(cookies)) throw redirect(303, `/login?redirect=${encodeURIComponent(url.pathname)}`);
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
		reveals: listReveals(m.id),
		grid_size: m.grid_size,
		active_layer: m.active_layer
	}));

	const rolls = listRolls(params.id, true).map((r) => ({
		id: r.id,
		roller: r.roller,
		expression: r.expression,
		result: r.result,
		breakdown: r.breakdown,
		secret: !!r.secret,
		label: r.label ?? undefined,
		created_at: r.created_at
	}));

	return {
		campaignId: campaign.id,
		title: campaign.title,
		content,
		meta,
		maps,
		rolls,
		initiative: listInitiative(params.id)
	};
};
