import {
	getCampaign,
	getHeadingMeta,
	listDocuments,
	listMaps,
	listReveals,
	listRolls,
	listTokens
} from '$lib/server/db';
import { isDM } from '$lib/server/auth';
import { UPLOAD_DIR } from '$lib/server/uploads';
import { error } from '@sveltejs/kit';
import { readFile } from 'node:fs/promises';
import type { RequestHandler } from './$types';

/** Download a full campaign bundle (content, maps+images, reveals, rolls, heading meta). */
export const GET: RequestHandler = async ({ params, cookies }) => {
	if (!isDM(cookies)) throw error(401, 'DM login required');
	const campaign = getCampaign(params.id);
	if (!campaign) throw error(404, 'Campaign not found');

	const maps = [];
	for (const m of listMaps(params.id)) {
		let base64 = '';
		try {
			base64 = (await readFile(`${UPLOAD_DIR}/${m.filename}`)).toString('base64');
		} catch {
			base64 = '';
		}
		maps.push({
			id: m.id,
			filename: m.filename,
			width: m.width,
			height: m.height,
			grid_size: m.grid_size,
			active_layer: m.active_layer,
			base64
		});
	}

	const bundle = {
		app: 'dnd-campaign-notes',
		version: 2,
		title: campaign.title,
		documents: listDocuments(params.id).map((d) => ({
			id: d.id,
			title: d.title,
			content: d.content,
			position: d.position,
			shared: d.shared
		})),
		heading_meta: getHeadingMeta(params.id),
		maps,
		reveals: listMaps(params.id).flatMap((m) =>
			listReveals(m.id).map((r) => ({
				map_id: r.map_id,
				kind: r.kind,
				shape: r.shape,
				x: r.x,
				y: r.y,
				w: r.w,
				h: r.h,
				path: r.path ?? null,
				radius: r.radius ?? null,
				layer: r.layer ?? 0
			}))
		),
		tokens: listMaps(params.id).flatMap((m) =>
			listTokens(m.id).map((t) => ({
				map_id: t.map_id,
				label: t.label,
				color: t.color,
				x: t.x,
				y: t.y
			}))
		),
		rolls: listRolls(params.id, true).map((r) => ({
			roller: r.roller,
			expression: r.expression,
			result: r.result,
			breakdown: r.breakdown,
			secret: !!r.secret,
			label: r.label ?? null,
			created_at: r.created_at
		}))
	};

	return new Response(JSON.stringify(bundle, null, 2), {
		headers: {
			'Content-Type': 'application/json',
			'Content-Disposition': `attachment; filename="${campaign.title.replace(/[^a-zA-Z0-9]+/g, '-')}.dndcampaign.json"`
		}
	});
};
