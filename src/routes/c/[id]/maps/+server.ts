import { getCampaign, createMap } from '$lib/server/db';
import { broadcast } from '$lib/server/sse';
import { error, json } from '@sveltejs/kit';
import { mkdirSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { nanoid } from 'nanoid';
import type { RequestHandler } from './$types';

const UPLOAD_DIR = 'static/uploads';

export const POST: RequestHandler = async ({ params, request }) => {
	const campaign = getCampaign(params.id);
	if (!campaign) throw error(404, 'Campaign not found');

	const form = await request.formData();
	const file = form.get('file');
	const width = Number(form.get('width'));
	const height = Number(form.get('height'));

	if (!(file instanceof File) || !width || !height) {
		throw error(400, 'Missing file or dimensions');
	}

	mkdirSync(UPLOAD_DIR, { recursive: true });
	const ext = extname(file.name) || '.png';
	const filename = `${nanoid(12)}${ext}`;
	await writeFile(`${UPLOAD_DIR}/${filename}`, Buffer.from(await file.arrayBuffer()));

	const map = createMap(params.id, filename, width, height);
	const data = {
		id: map.id,
		width: map.width,
		height: map.height,
		src: `/uploads/${filename}`,
		reveals: []
	};
	broadcast(params.id, { type: 'map-added', map: data });

	return json(data);
};
