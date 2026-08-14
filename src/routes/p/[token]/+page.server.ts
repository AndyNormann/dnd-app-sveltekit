import {
	getCharacterByToken,
	getCampaign,
	listDocumentSummaries,
	getDocument,
	listMaps,
	listReveals,
	listRolls
} from '$lib/server/db';
import { renderDocument } from '$lib/server/markdown.server';
import { PLAYER_COOKIE } from '$lib/server/player';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import type { MapData } from '$lib/types';

export const load: PageServerLoad = ({ params, cookies, url }) => {
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

	// players only see documents the DM has shared
	const documents = listDocumentSummaries(ch.campaign_id).filter((d) => d.shared === 1);
	const docId = url.searchParams.get('doc') ?? '';
	let selected =
		(docId && getDocument(docId)) || (documents[0] && getDocument(documents[0].id)) || null;
	if (selected && (selected.campaign_id !== ch.campaign_id || !selected.shared)) {
		selected = documents[0] ? getDocument(documents[0].id) : null;
	}

	const html = selected ? renderDocument(selected.content) : '';

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
		campaignTitle: campaign.title,
		documents,
		document: selected
			? { id: selected.id, title: selected.title, position: selected.position, shared: 1, updated_at: selected.updated_at }
			: null,
		html,
		maps,
		rolls
	};
};
