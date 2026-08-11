import { UPLOAD_DIR } from '$lib/server/uploads';
import { error } from '@sveltejs/kit';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import type { RequestHandler } from './$types';

const MIME: Record<string, string> = {
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.gif': 'image/gif',
	'.webp': 'image/webp',
	'.avif': 'image/avif'
};

/** Serve an uploaded image from UPLOAD_DIR (path-traversal safe). */
export const GET: RequestHandler = async ({ params }) => {
	const name = params.file;
	if (!name) throw error(400, 'Missing filename');
	// reject any path that would escape the upload dir
	if (normalize(join(UPLOAD_DIR, name)) !== join(UPLOAD_DIR, name)) throw error(400, 'Invalid path');

	try {
		const buf = await readFile(join(UPLOAD_DIR, name));
		return new Response(buf, {
			headers: {
				'Content-Type': MIME[extname(name).toLowerCase()] ?? 'application/octet-stream',
				'Cache-Control': 'public, max-age=86400'
			}
		});
	} catch {
		throw error(404, 'Not found');
	}
};
