import { getCampaign, listCharacters, createCharacter } from '$lib/server/db';
import { broadcast } from '$lib/server/sse';
import { syncCharactersToBoard } from '$lib/server/combat';
import { emitUnits } from '$lib/server/feed';
import { isDM } from '$lib/server/auth';
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ params, cookies }) => {
	if (!isDM(cookies)) throw error(401, 'DM login required');
	const c = getCampaign(params.id);
	if (!c) throw error(404, 'Campaign not found');
	return json(listCharacters(params.id));
};

export const POST: RequestHandler = async ({ params, request, cookies }) => {
	if (!isDM(cookies)) throw error(401, 'DM login required');
	const c = getCampaign(params.id);
	if (!c) throw error(404, 'Campaign not found');
	const body = (await request.json()) as Record<string, unknown>;
	const name = String(body.name ?? '').trim().slice(0, 60);
	if (!name) throw error(400, 'Name required');
	const max_hp = Math.floor(Number(body.max_hp) || 0);
	const ch = createCharacter(params.id, {
		name,
		player_name: String(body.player_name ?? '').trim().slice(0, 60),
		speed: Math.floor(Number(body.speed) || 30),
		init_bonus: Math.floor(Number(body.init_bonus) || 0),
		color: String(body.color ?? '#1b6ca8').slice(0, 20),
		max_hp,
		hp: Math.floor(Number(body.hp) || max_hp)
	});
	broadcast(params.id, { type: 'characters-updated' });
	// players are always on the board: auto-add the new character's token
	syncCharactersToBoard(params.id);
	emitUnits(params.id);
	return json(ch);
};
