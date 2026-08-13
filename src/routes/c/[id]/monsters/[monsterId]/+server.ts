import { getCampaign, getMonster, updateMonster, deleteMonster } from '$lib/server/db';
import { broadcast } from '$lib/server/sse';
import { isDM } from '$lib/server/auth';
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, request, cookies }) => {
	if (!isDM(cookies)) throw error(401, 'DM login required');
	const c = getCampaign(params.id);
	if (!c) throw error(404, 'Campaign not found');
	const monster = getMonster(params.monsterId);
	if (!monster || monster.campaign_id !== params.id) throw error(404, 'Monster not found');

	const body = (await request.json()) as Record<string, unknown>;

	if (body.action === 'delete') {
		deleteMonster(monster.id);
		broadcast(params.id, { type: 'monsters-updated' });
		return json({ ok: true });
	}

	if (body.action === 'update') {
		const name = String(body.name ?? monster.name).trim().slice(0, 60);
		if (!name) throw error(400, 'Name required');
		const updated = updateMonster(monster.id, {
			name,
			color: String(body.color ?? monster.color).slice(0, 20),
			speed: body.speed != null ? Math.floor(Number(body.speed) || 0) : undefined,
			init_bonus: body.init_bonus != null ? Math.floor(Number(body.init_bonus) || 0) : undefined,
			max_hp: body.max_hp != null ? Math.max(0, Math.floor(Number(body.max_hp) || 0)) : undefined
		});
		broadcast(params.id, { type: 'monsters-updated' });
		return json(updated);
	}

	throw error(400, 'Unknown action');
};
