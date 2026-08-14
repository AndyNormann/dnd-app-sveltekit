import {
	getCampaign,
	getMonster,
	getCollection,
	listCombatUnits,
	addCombatUnit,
	getBoardConfig
} from '$lib/server/db';
import type { CombatUnit } from '$lib/server/db';
import { broadcast } from '$lib/server/sse';
import { isDM } from '$lib/server/auth';
import { clearBoard, syncCharactersToBoard } from '$lib/server/combat';
import { emitInitiative, emitUnits, emitDrawings } from '$lib/server/feed';
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ params, cookies }) => {
	if (!isDM(cookies)) throw error(401, 'DM login required');
	const c = getCampaign(params.id);
	if (!c) throw error(404, 'Campaign not found');
	return json(listCombatUnits(params.id));
};

export const POST: RequestHandler = async ({ params, request, cookies }) => {
	if (!isDM(cookies)) throw error(401, 'DM login required');
	const c = getCampaign(params.id);
	if (!c) throw error(404, 'Campaign not found');
	const body = (await request.json()) as Record<string, unknown>;

	if (body.action === 'clear') {
		const r = clearBoard(params.id);
		emitUnits(params.id);
		emitInitiative(params.id);
		emitDrawings(params.id);
		broadcast(params.id, { type: 'combat-log', entry: r.data.log });
		return json({ ok: true });
	}

	if (body.action === 'add-players') {
		syncCharactersToBoard(params.id);
		emitUnits(params.id);
		return json({ ok: true });
	}

	if (body.action === 'add-enemy') {
		const name = String(body.name ?? '').trim().slice(0, 60);
		if (!name) throw error(400, 'Name required');
		const units = listCombatUnits(params.id);
		const cfg = getBoardConfig(params.id);
		const x = ((units.length % 12) * 2) + 1;
		const y = 2;
		const max_hp = Math.floor(Number(body.max_hp) || 0);
		const unit = addCombatUnit(params.id, {
			kind: 'enemy',
			name,
			color: String(body.color ?? '#a33').slice(0, 20),
			speed: Math.floor(Number(body.speed) || 0),
			init_bonus: Math.floor(Number(body.init_bonus) || 0),
			max_hp,
			hp: Math.floor(Number(body.hp) || max_hp),
			x,
			y
		});
		emitUnits(params.id);
		return json(unit);
	}

	if (body.action === 'add-monster') {
		const monster = getMonster(String(body.monster_id ?? ''));
		if (!monster || monster.campaign_id !== params.id) throw error(404, 'Monster not found');
		const count = Math.min(20, Math.max(1, Math.floor(Number(body.count) || 1)));
		const units = listCombatUnits(params.id);
		const cfg = getBoardConfig(params.id);
		const added: CombatUnit[] = [];
		for (let i = 0; i < count; i++) {
			const idx = units.length + added.length;
			const x = ((idx % 12) * 2) + 1;
			const y = 2 + Math.floor((idx % 12) / 6);
			added.push(
				addCombatUnit(params.id, {
					kind: 'enemy',
					name: count > 1 ? `${monster.name} ${i + 1}` : monster.name,
					color: monster.color,
					speed: monster.speed,
					init_bonus: monster.init_bonus,
					max_hp: monster.max_hp,
					hp: monster.max_hp,
					x,
					y
				})
			);
		}
		emitUnits(params.id);
		return json({ ok: true, added });
	}

	if (body.action === 'add-collection') {
		const coll = getCollection(String(body.collection_id ?? ''));
		if (!coll || coll.campaign_id !== params.id) throw error(404, 'Collection not found');
		const units = listCombatUnits(params.id);
		const cfg = getBoardConfig(params.id);
		const added: CombatUnit[] = [];
		let idx = units.length;
		for (const item of coll.items) {
			const monster = getMonster(item.monster_id);
			if (!monster || monster.campaign_id !== params.id) continue;
			const count = Math.min(20, Math.max(1, Math.floor(item.count) || 1));
			for (let i = 0; i < count; i++) {
				const x = ((idx % 12) * 2) + 1;
				const y = 2 + Math.floor((idx % 12) / 6);
				added.push(
					addCombatUnit(params.id, {
						kind: 'enemy',
						name: count > 1 ? `${monster.name} ${i + 1}` : monster.name,
						color: monster.color,
						speed: monster.speed,
						init_bonus: monster.init_bonus,
						max_hp: monster.max_hp,
						hp: monster.max_hp,
						x,
						y
					})
				);
				idx++;
			}
		}
		emitUnits(params.id);
		return json({ ok: true, added });
	}

	throw error(400, 'Unknown action');
};
