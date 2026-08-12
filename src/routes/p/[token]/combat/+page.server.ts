import {
	getCharacterByToken,
	getCampaign,
	listInitiative,
	getInitiativeRound,
	listCombatUnits,
	listCombatDrawings,
	getBoardConfig,
	getActiveUnitId
} from '$lib/server/db';
import { PLAYER_COOKIE } from '$lib/server/player';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ params, cookies }) => {
	const ch = getCharacterByToken(params.token);
	if (!ch) throw error(404, 'Invalid player link');
	const campaign = getCampaign(ch.campaign_id);
	if (!campaign) throw error(404, 'Campaign not found');
	cookies.set(PLAYER_COOKIE, ch.id, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		maxAge: 60 * 60 * 24 * 180,
		secure: process.env.NODE_ENV === 'production'
	});

	return {
		character: { id: ch.id, name: ch.name, player_name: ch.player_name, color: ch.color },
		campaignId: ch.campaign_id,
		token: params.token,
		title: campaign.title,
		initiative: listInitiative(ch.campaign_id),
		initiativeRound: getInitiativeRound(ch.campaign_id),
		units: listCombatUnits(ch.campaign_id),
		drawings: listCombatDrawings(ch.campaign_id),
		boardConfig: getBoardConfig(ch.campaign_id),
		activeUnitId: getActiveUnitId(ch.campaign_id)
	};
};
