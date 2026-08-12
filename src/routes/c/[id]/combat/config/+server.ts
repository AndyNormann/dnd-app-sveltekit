import { getCampaign, getBoardConfig, setBoardGrid } from '$lib/server/db';
import { broadcast } from '$lib/server/sse';
import { isDM } from '$lib/server/auth';
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ params, cookies }) => {
	if (!isDM(cookies)) throw error(401, 'DM login required');
	const c = getCampaign(params.id);
	if (!c) throw error(404, 'Campaign not found');
	return json(getBoardConfig(params.id));
};

export const POST: RequestHandler = async ({ params, request, cookies }) => {
	if (!isDM(cookies)) throw error(401, 'DM login required');
	const c = getCampaign(params.id);
	if (!c) throw error(404, 'Campaign not found');
	const body = (await request.json()) as Record<string, unknown>;
	const cols = Math.floor(Number(body.cols) || 24);
	const rows = Math.floor(Number(body.rows) || 18);
	const scale = Math.floor(Number(body.scale) || 5);
	setBoardGrid(params.id, cols, rows, scale);
	const config = getBoardConfig(params.id);
	broadcast(params.id, { type: 'board-config-updated', config });
	return json(config);
};
