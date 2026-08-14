import { getCharacter, updateCharacter, deleteCharacter } from '$lib/server/db';
import { broadcast } from '$lib/server/sse';
import { removeCharacterFromBoard } from '$lib/server/combat';
import { emitUnits } from '$lib/server/feed';
import { isDM } from '$lib/server/auth';
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, request, cookies }) => {
	if (!isDM(cookies)) throw error(401, 'DM login required');
	const ch = getCharacter(params.charId);
	if (!ch || ch.campaign_id !== params.id) throw error(404, 'Character not found');
	const body = (await request.json()) as Record<string, unknown>;
	if (body.action === 'delete') {
		deleteCharacter(ch.id);
		removeCharacterFromBoard(ch.campaign_id, ch.id);
		emitUnits(ch.campaign_id);
		broadcast(ch.campaign_id, { type: 'characters-updated' });
		return json({ ok: true });
	}
	if (body.action === 'update') {
		updateCharacter(ch.id, {
			name: body.name != null ? String(body.name).trim().slice(0, 60) : undefined,
			player_name:
				body.player_name != null ? String(body.player_name).trim().slice(0, 60) : undefined,
			speed: body.speed != null ? Number(body.speed) : undefined,
			init_bonus: body.init_bonus != null ? Number(body.init_bonus) : undefined,
			color: body.color != null ? String(body.color).slice(0, 20) : undefined,
			max_hp: body.max_hp != null ? Number(body.max_hp) : undefined,
			hp: body.hp != null ? Number(body.hp) : undefined
		});
		broadcast(params.id, { type: 'characters-updated' });
		return json({ ok: true });
	}
	throw error(400, 'Unknown action');
};
