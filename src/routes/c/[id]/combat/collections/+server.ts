import { getCampaign, listCollections, createCollection, updateCollection, getCollection, deleteCollection } from '$lib/server/db';
import { isDM } from '$lib/server/auth';
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { CollectionItem } from '$lib/server/db';

export const GET: RequestHandler = ({ params, cookies }) => {
	if (!isDM(cookies)) throw error(401, 'DM login required');
	const c = getCampaign(params.id);
	if (!c) throw error(404, 'Campaign not found');
	return json(listCollections(params.id));
};

export const POST: RequestHandler = async ({ params, request, cookies }) => {
	if (!isDM(cookies)) throw error(401, 'DM login required');
	const c = getCampaign(params.id);
	if (!c) throw error(404, 'Campaign not found');
	const body = (await request.json()) as Record<string, unknown>;

	const sanitize = (items: unknown): CollectionItem[] => {
		if (!Array.isArray(items)) return [];
		return items
			.map((it) => {
				const o = it as { monster_id?: string; count?: number };
				if (!o || typeof o.monster_id !== 'string' || !o.monster_id) return null;
				return {
					monster_id: o.monster_id,
					count: Math.min(20, Math.max(1, Math.floor(Number(o.count) || 1)))
				};
			})
			.filter((x): x is CollectionItem => x !== null)
			.slice(0, 20);
	};

	if (body.action === 'save') {
		const name = String(body.name ?? '').trim().slice(0, 60);
		if (!name) throw error(400, 'Name required');
		const items = sanitize(body.items);
		if (body.id) {
			const coll = getCollection(String(body.id));
			if (!coll || coll.campaign_id !== params.id) throw error(404, 'Collection not found');
			const updated = updateCollection(coll.id, name, items);
			return json(updated);
		}
		return json(createCollection(params.id, name, items));
	}

	if (body.action === 'delete') {
		const coll = getCollection(String(body.id ?? ''));
		if (!coll || coll.campaign_id !== params.id) throw error(404, 'Collection not found');
		deleteCollection(coll.id);
		return json({ ok: true });
	}

	throw error(400, 'Unknown action');
};
