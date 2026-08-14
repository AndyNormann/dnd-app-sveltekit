import type { RevealOp } from './db';
import type { InitEntry } from './db';
import type { TokenRow } from './db';
import type { MapData, RollData } from '$lib/types';

export type CampaignEvent =
	| { type: 'doc-updated'; html: string }
	| { type: 'share-changed'; html: string }
	| { type: 'map-added'; map: MapData }
	| { type: 'map-revealed'; mapId: string; op: RevealOp }
	| { type: 'map-hidden'; mapId: string; op: RevealOp }
	| { type: 'roll'; roll: RollData }
	| { type: 'rolls-cleared' }
	| { type: 'rolls-restored'; rolls: RollData[] }
	| { type: 'title-changed'; title: string }
	| { type: 'handout-revealed'; headingId: string }
	| { type: 'initiative-updated'; entries: InitEntry[]; round: number }
	| { type: 'tokens-updated'; mapId: string; tokens: TokenRow[] }
	| { type: 'grid-updated'; mapId: string; grid_size: number }
	| { type: 'layer-changed'; mapId: string; layer: number }
	| { type: 'reveal-undone'; mapId: string; layer: number; opId: number }
	| { type: 'reveals-cleared'; mapId: string; layer: number }
	| { type: 'characters-updated' }
	| { type: 'monsters-updated' }
	| { type: 'combat-units-updated'; units: import('./db').CombatUnit[] }
	| { type: 'combat-drawings-updated'; drawings: import('./db').CombatDrawing[] }
	| { type: 'board-config-updated'; config: import('./db').BoardConfig }
	| { type: 'combat-log'; entry: import('./db').CombatLogEntry }
	| { type: 'map-ping'; mapId: string; ping: import('../types').PingData }
	| { type: 'combat-ping'; ping: import('../types').PingData }
	| { type: 'combat-ready'; readyIds: string[] }
	| {
			type: 'snapshot';
			title: string;
			html: string;
			rev: number;
			maps: MapData[];
			tokens: { mapId: string; tokens: TokenRow[] }[];
			rolls: RollData[];
	  };

type Subscriber = (event: CampaignEvent) => void;

interface Sub {
	fn: Subscriber;
	dm: boolean;
}

const channels = new Map<string, Set<Sub>>();

/** Subscribe to a campaign's events. `dm` marks a subscriber that may receive secret rolls. */
export function subscribe(campaignId: string, fn: Subscriber, dm = false): () => void {
	let set = channels.get(campaignId);
	if (!set) {
		set = new Set();
		channels.set(campaignId, set);
	}
	const sub: Sub = { fn, dm };
	set.add(sub);
	return () => {
		set!.delete(sub);
		if (set!.size === 0) channels.delete(campaignId);
	};
}

export function broadcast(campaignId: string, event: CampaignEvent): void {
	const set = channels.get(campaignId);
	if (!set) return;
	for (const sub of set) {
		try {
			sub.fn(event);
		} catch {
			// drop broken subscribers silently; their close handler will clean up
		}
	}
}

/** Broadcast a different event to DM vs player subscribers (e.g. secret-roll visibility). */
export function broadcastRole(
	campaignId: string,
	dmEvent: CampaignEvent,
	playerEvent: CampaignEvent
): void {
	const set = channels.get(campaignId);
	if (!set) return;
	for (const sub of set) {
		try {
			sub.fn(sub.dm ? dmEvent : playerEvent);
		} catch {
			// drop broken subscribers silently; their close handler will clean up
		}
	}
}
