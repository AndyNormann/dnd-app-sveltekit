import { getCampaign, listMonsters, createMonster } from '$lib/server/db';
import { broadcast } from '$lib/server/sse';
import { isDM } from '$lib/server/auth';
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ params, cookies }) => {
	if (!isDM(cookies)) throw error(401, 'DM login required');
	const c = getCampaign(params.id);
	if (!c) throw error(404, 'Campaign not found');
	return json(listMonsters(params.id));
};

export const POST: RequestHandler = async ({ params, request, cookies }) => {
	if (!isDM(cookies)) throw error(401, 'DM login required');
	const c = getCampaign(params.id);
	if (!c) throw error(404, 'Campaign not found');
	const body = (await request.json()) as Record<string, unknown>;
	const name = String(body.name ?? '').trim().slice(0, 60);
	if (!name) throw error(400, 'Name required');
	const monster = createMonster(params.id, {
		name,
		color: String(body.color ?? '#a33').slice(0, 20),
		speed: Math.floor(Number(body.speed) || 30),
		init_bonus: Math.floor(Number(body.init_bonus) || 0),
		max_hp: Math.floor(Number(body.max_hp) || 0)
	});
	broadcast(params.id, { type: 'monsters-updated' });
	return json(monster);
};
