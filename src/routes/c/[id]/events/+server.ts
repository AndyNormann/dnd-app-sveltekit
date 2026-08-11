import {
	getCampaign,
	getHeadingMeta,
	listMaps,
	listReveals,
	listRolls,
	listTokens
} from '$lib/server/db';
import { toMetaMap } from '$lib/markdown';
import { renderSharedForPlayer } from '$lib/server/markdown.server';
import { subscribe, type CampaignEvent } from '$lib/server/sse';
import { isDM } from '$lib/server/auth';
import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { MapData, RollData } from '$lib/types';

export const GET: RequestHandler = ({ params, cookies }) => {
	const campaign = getCampaign(params.id);
	if (!campaign) throw error(404, 'Campaign not found');

	const dm = isDM(cookies);
	const meta = toMetaMap(getHeadingMeta(params.id));
	const html = renderSharedForPlayer(campaign.content, meta);
	const campaignTitle = campaign.title;

	const maps: MapData[] = listMaps(params.id).map((m) => ({
		id: m.id,
		width: m.width,
		height: m.height,
		src: `/uploads/${m.filename}`,
		reveals: listReveals(m.id),
		grid_size: m.grid_size,
		active_layer: m.active_layer
	}));

	const tokens = listMaps(params.id).map((m) => ({ mapId: m.id, tokens: listTokens(m.id) }));

	const rolls: RollData[] = listRolls(params.id, dm).map((r) => ({
		id: r.id,
		roller: r.roller,
		expression: r.expression,
		result: r.result,
		breakdown: r.breakdown,
		secret: !!r.secret,
		label: r.label ?? undefined,
		created_at: r.created_at
	}));

	/** Snapshot of current state so a (re)connecting client self-heals. */
	function sendSnapshot(send: (e: CampaignEvent) => void) {
		send({ type: 'snapshot', title: campaignTitle, html, maps, tokens, rolls });
	}

	let unsubscribe: () => void;

	const stream = new ReadableStream({
		start(controller) {
			const enc = new TextEncoder();
			const send = (event: CampaignEvent) => {
				controller.enqueue(enc.encode(`data: ${JSON.stringify(event)}\n\n`));
			};
			// initial comment to open the stream
			controller.enqueue(enc.encode(': connected\n\n'));
			sendSnapshot(send);
			unsubscribe = subscribe(params.id, send);
		},
		cancel() {
			unsubscribe?.();
		}
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			Connection: 'keep-alive'
		}
	});
};
