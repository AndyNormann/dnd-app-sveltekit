import {
	getCampaign,
	getCampaignRev,
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

// send a comment ping this often to keep the connection alive through proxies
const HEARTBEAT_MS = Number(process.env.SSE_HEARTBEAT_MS) || 25_000;

export const GET: RequestHandler = ({ params, cookies }) => {
	if (!getCampaign(params.id)) throw error(404, 'Campaign not found');

	const dm = isDM(cookies);

	let unsubscribe: () => void;
	let heartbeat: ReturnType<typeof setInterval> | undefined;

	const stream = new ReadableStream({
		start(controller) {
			const enc = new TextEncoder();
			const send = (event: CampaignEvent) => {
				controller.enqueue(enc.encode(`data: ${JSON.stringify(event)}\n\n`));
			};

			// Subscribe FIRST, then read the snapshot, so no broadcast between the
			// two can be missed by a connecting client.
			unsubscribe = subscribe(params.id, send);
			controller.enqueue(enc.encode(': connected\n\n'));

			// Snapshot of current state so a (re)connecting client self-heals.
			const campaign = getCampaign(params.id);
			if (campaign) {
				const meta = toMetaMap(getHeadingMeta(params.id));
				const html = renderSharedForPlayer(campaign.content, meta);
				const rev = getCampaignRev(params.id);

				const maps: MapData[] = listMaps(params.id).map((m) => ({
					id: m.id,
					width: m.width,
					height: m.height,
					src: `/uploads/${m.filename}`,
					reveals: listReveals(m.id),
					grid_size: m.grid_size,
					active_layer: m.active_layer
				}));

				const tokens = listMaps(params.id).map((m) => ({
					mapId: m.id,
					tokens: listTokens(m.id)
				}));

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

				send({ type: 'snapshot', title: campaign.title, html, rev, maps, tokens, rolls });
			}

			// Heartbeat so proxies don't reap an idle SSE connection mid-session.
			heartbeat = setInterval(() => {
				try {
					controller.enqueue(enc.encode(': ping\n\n'));
				} catch {
					// stream may already be closed
				}
			}, HEARTBEAT_MS);
		},
		cancel() {
			unsubscribe?.();
			if (heartbeat) clearInterval(heartbeat);
		}
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			Connection: 'keep-alive',
			'X-Accel-Buffering': 'no'
		}
	});
};
