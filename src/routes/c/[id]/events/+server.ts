import { getCampaign } from '$lib/server/db';
import { subscribe, type CampaignEvent } from '$lib/server/sse';
import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ params }) => {
	const campaign = getCampaign(params.id);
	if (!campaign) throw error(404, 'Campaign not found');

	let unsubscribe: () => void;

	const stream = new ReadableStream({
		start(controller) {
			const enc = new TextEncoder();
			const send = (event: CampaignEvent) => {
				controller.enqueue(enc.encode(`data: ${JSON.stringify(event)}\n\n`));
			};
			// initial comment to open the stream
			controller.enqueue(enc.encode(': connected\n\n'));
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
