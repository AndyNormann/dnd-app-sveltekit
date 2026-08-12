import {
	getCharacterByToken,
	getCampaign,
	getHeadingMeta,
	listMaps,
	listReveals,
	listRolls
} from '$lib/server/db';
import { toMetaMap } from '$lib/markdown';
import { renderSharedForPlayer } from '$lib/server/markdown.server';
import { PLAYER_COOKIE } from '$lib/server/player';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import type { MapData } from '$lib/types';

export const load: PageServerLoad = ({ params, cookies }) => {
	const ch = getCharacterByToken(params.token);
	if (!ch) throw error(404, 'Invalid player link');
	const campaign = getCampaign(ch.campaign_id);
	if (!campaign) throw error(404, 'Campaign not found');
	// remember this player on this device so combat moves are authorized
	cookies.set(PLAYER_COOKIE, ch.id, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		maxAge: 60 * 60 * 24 * 180,
		secure: process.env.NODE_ENV === 'production'
	});

	const meta = toMetaMap(getHeadingMeta(ch.campaign_id));
	const html = renderSharedForPlayer(campaign.content, meta);
	const maps: MapData[] = listMaps(ch.campaign_id).map((m) => ({
		id: m.id,
		width: m.width,
		height: m.height,
		src: `/uploads/${m.filename}`,
		reveals: listReveals(m.id),
		grid_size: m.grid_size,
		active_layer: m.active_layer
	}));
	const rolls = listRolls(ch.campaign_id, false).map((r) => ({
		id: r.id,
		roller: r.roller,
		expression: r.expression,
		result: r.result,
		breakdown: r.breakdown,
		secret: false,
		label: r.label ?? undefined,
		created_at: r.created_at
	}));

	return {
		character: { id: ch.id, name: ch.name, player_name: ch.player_name, color: ch.color },
		campaignId: ch.campaign_id,
		token: params.token,
		title: campaign.title,
		html,
		maps,
		rolls
	};
};
