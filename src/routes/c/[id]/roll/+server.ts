import { addRoll, clearRolls, getCampaign, listRolls, restoreRolls, type RollRow } from '$lib/server/db';
import { broadcast, broadcastRole } from '$lib/server/sse';
import { rollDice } from '$lib/dice';
import { isDM } from '$lib/server/auth';
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { RollData } from '$lib/types';

const UNDO_TTL = 30_000;
// in-memory undo snapshots for a recent clear, so the DM can restore within the toast window
const undoMap = new Map<string, { campaignId: string; rows: RollRow[]; expires: number }>();

function toRollData(r: RollRow): RollData {
	return {
		id: r.id,
		roller: r.roller,
		expression: r.expression,
		result: r.result,
		breakdown: r.breakdown,
		secret: !!r.secret,
		label: r.label ?? undefined,
		created_at: r.created_at
	};
}

function sweepExpired() {
	const now = Date.now();
	for (const [k, v] of undoMap) if (v.expires < now) undoMap.delete(k);
}

export const POST: RequestHandler = async ({ params, request, cookies }) => {
	const campaign = getCampaign(params.id);
	if (!campaign) throw error(404, 'Campaign not found');

	const body = (await request.json()) as {
		roller?: string;
		expression?: string;
		secret?: boolean;
		label?: string;
		action?: string;
		key?: string;
	};

	// Clear (wipe) the roll history — DM only, persistent, broadcast to everyone.
	if (body.action === 'clear') {
		if (!isDM(cookies)) throw error(401, 'Clear requires DM');
		sweepExpired();
		const snapshot = listRolls(params.id, true); // keep secrets too, so undo restores them for the DM
		const key = crypto.randomUUID();
		undoMap.set(key, { campaignId: params.id, rows: snapshot, expires: Date.now() + UNDO_TTL });
		clearRolls(params.id);
		broadcast(params.id, { type: 'rolls-cleared' });
		return json({ ok: true, undoKey: key });
	}

	// Undo a clear within the toast window — restores the snapshot and re-broadcasts it.
	if (body.action === 'undo') {
		if (!isDM(cookies)) throw error(401, 'Undo requires DM');
		const key = typeof body.key === 'string' ? body.key : '';
		const entry = key ? undoMap.get(key) : undefined;
		if (!entry || entry.campaignId !== params.id || entry.expires < Date.now()) {
			throw error(400, 'Undo window expired');
		}
		undoMap.delete(key);
		restoreRolls(entry.rows);
		const full = entry.rows.map(toRollData);
		const player = entry.rows.filter((r) => !r.secret).map(toRollData);
		broadcastRole(
			params.id,
			{ type: 'rolls-restored', rolls: full },
			{ type: 'rolls-restored', rolls: player }
		);
		// return the restored rolls so the DM's own list is set deterministically from
		// the response (doesn't depend on the SSE broadcast or the captured snapshot)
		return json({ ok: true, rolls: full });
	}

	const roller = (body.roller ?? '').trim().slice(0, 40) || 'Anonymous';
	const expression = (body.expression ?? '').trim().slice(0, 100);
	const label = (body.label ?? '').trim().slice(0, 80);
	const secret = !!body.secret;
	// Secret rolls are only for the DM.
	if (secret && !isDM(cookies)) throw error(401, 'Secret rolls require DM');

	const result = rollDice(expression);
	if (!result) throw error(400, 'Invalid dice expression');

	const row = addRoll(
		params.id,
		roller,
		expression,
		result.total,
		result.breakdown,
		secret,
		label || undefined
	);
	const roll: RollData = {
		id: row.id,
		roller: row.roller,
		expression: row.expression,
		result: row.result,
		breakdown: row.breakdown,
		secret: !!row.secret,
		label: row.label ?? undefined,
		created_at: row.created_at
	};

	if (!secret) broadcast(params.id, { type: 'roll', roll });

	return json(roll);
};
