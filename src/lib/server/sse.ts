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
	| { type: 'title-changed'; title: string }
	| { type: 'handout-revealed'; headingId: string }
	| { type: 'initiative-updated'; entries: InitEntry[] }
	| { type: 'tokens-updated'; mapId: string; tokens: TokenRow[] }
	| { type: 'grid-updated'; mapId: string; grid_size: number }
	| { type: 'layer-changed'; mapId: string; layer: number }
	| {
			type: 'snapshot';
			title: string;
			html: string;
			maps: MapData[];
			tokens: { mapId: string; tokens: TokenRow[] }[];
			rolls: RollData[];
	  };

type Subscriber = (event: CampaignEvent) => void;

const channels = new Map<string, Set<Subscriber>>();

export function subscribe(campaignId: string, fn: Subscriber): () => void {
	let set = channels.get(campaignId);
	if (!set) {
		set = new Set();
		channels.set(campaignId, set);
	}
	set.add(fn);
	return () => {
		set!.delete(fn);
		if (set!.size === 0) channels.delete(campaignId);
	};
}

export function broadcast(campaignId: string, event: CampaignEvent): void {
	const set = channels.get(campaignId);
	if (!set) return;
	for (const fn of set) {
		try {
			fn(event);
		} catch {
			// drop broken subscribers silently; their close handler will clean up
		}
	}
}
