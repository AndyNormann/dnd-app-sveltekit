import { describe, expect, test } from 'bun:test';
import { applyFeedEvent, type FeedHandlers } from './feed';

const roll = {
	type: 'roll' as const,
	roll: { id: 1, roller: 'A', expression: '1d20', result: 15, breakdown: '1d20 [15] = 15', secret: false, created_at: 0 }
};
const snapshot = {
	type: 'snapshot' as const,
	documents: [],
	title: 'T', html: '<p>x</p>', rev: 3, maps: [], tokens: [], rolls: [roll.roll]
};
const initiative = { type: 'initiative-updated' as const, entries: [], round: 2 };

describe('feed reducer', () => {
	test('dispatches each event type to the matching handler', () => {
		const calls: string[] = [];
		const h: FeedHandlers = {
			addRoll: () => calls.push('addRoll'),
			setRolls: () => calls.push('setRolls'),
			onDoc: () => calls.push('onDoc'),
			onTitle: () => calls.push('onTitle'),
			applyCombatUnits: () => calls.push('units'),
			applyInitiative: () => calls.push('initiative'),
			applySnapshot: () => calls.push('snapshot'),
			onHandout: () => calls.push('handout')
		};
		applyFeedEvent(roll, h);
		applyFeedEvent(snapshot, h);
		applyFeedEvent(initiative, h);
		applyFeedEvent({ type: 'title-changed', title: 'x' }, h);
		applyFeedEvent({ type: 'handout-revealed', headingId: 'h1' }, h);
		expect(calls).toEqual(['addRoll', 'snapshot', 'initiative', 'onTitle', 'handout']);
	});

	test('rolls-cleared and rolls-restored both go to setRolls', () => {
		const calls: string[] = [];
		applyFeedEvent({ type: 'rolls-cleared' }, { setRolls: (r) => calls.push(`cleared:${r.length}`) });
		applyFeedEvent({ type: 'rolls-restored', rolls: [roll.roll] }, { setRolls: (r) => calls.push(`restored:${r.length}`) });
		expect(calls).toEqual(['cleared:0', 'restored:1']);
	});

	test('map events forward to applyTokens/applyMapOp', () => {
		const calls: string[] = [];
		const h: FeedHandlers = {
			applyTokens: () => calls.push('tokens'),
			applyMapOp: () => calls.push('mapop'),
			applyMapPing: () => calls.push('ping')
		};
		applyFeedEvent({ type: 'tokens-updated', mapId: 'm', tokens: [] }, h);
		applyFeedEvent({ type: 'map-revealed', mapId: 'm', op: {} as never }, h);
		applyFeedEvent({ type: 'map-ping', mapId: 'm', ping: { id: 'p', x: 0, y: 0, color: '#fff', name: 'n' } }, h);
		expect(calls).toEqual(['tokens', 'mapop', 'ping']);
	});

	test('unset handlers are safely skipped', () => {
		// a page that provides no handlers must not throw
		applyFeedEvent(roll, {});
		applyFeedEvent(snapshot, {});
	});
});
