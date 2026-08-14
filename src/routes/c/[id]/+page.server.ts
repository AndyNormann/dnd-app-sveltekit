import {
	getCampaign,
	listDocumentSummaries,
	getDocument,
	listMaps,
	listReveals,
	listRolls,
	listInitiative,
	getInitiativeRound
} from '$lib/server/db';
import { isDM } from '$lib/server/auth';
import { PLAYER_COOKIE } from '$lib/server/player';
import { redirect, error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import type { MapData } from '$lib/types';

export const load: PageServerLoad = ({ params, cookies, url }) => {
	// The DM editor page exposes content editing and secret rolls — DM only.
	if (!isDM(cookies)) throw redirect(303, `/login?redirect=${encodeURIComponent(url.pathname)}`);
	// acting as DM here: drop any lingering player-portal cookie so DM override stays free
	cookies.delete(PLAYER_COOKIE, { path: '/' });
	const campaign = getCampaign(params.id);
	if (!campaign) throw error(404, 'Campaign not found');

	const documents = listDocumentSummaries(params.id);
	// select the requested document, else the first one
	let docId = url.searchParams.get('doc') ?? '';
	const selected = docId ? getDocument(docId) : documents[0] ? getDocument(documents[0].id) : null;
	if (selected && selected.campaign_id !== params.id) throw error(404, 'Document not found');

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
		campaignTitle: campaign.title,
		documents,
		document: selected, // full selected document (or null)
		maps,
		rolls,
		initiative: listInitiative(params.id),
		initiativeRound: getInitiativeRound(params.id)
	};
};
