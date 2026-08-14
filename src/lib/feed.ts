import type { CampaignEvent } from './server/sse';
import type { CombatUnit, CombatDrawing, BoardConfig, CombatLogEntry, TokenRow, RevealOp, InitEntry } from './server/db';
import type { MapData, RollData, PingData } from './types';

/**
 * Shared realtime-feed contract. The server pushes a `CampaignEvent`; each page
 * provides the handlers it cares about (as closures over its components) and calls
 * `applyFeedEvent`, so the many parallel SSE switch-statements collapse into one
 * tested reducer. Handlers are optional — a page simply omits the ones it doesn't use.
 */

export interface FeedHandlers {
	setRolls?: (rolls: RollData[]) => void;
	addRoll?: (roll: RollData) => void;
	applyTokens?: (mapId: string, tokens: TokenRow[]) => void;
	applyGrid?: (mapId: string, gridSize: number) => void;
	applyLayer?: (mapId: string, layer: number) => void;
	applyRevealRemoved?: (mapId: string, opId: number) => void;
	applyLayerCleared?: (mapId: string, layer: number) => void;
	applyMapOp?: (mapId: string, op: RevealOp) => void;
	applyMapPing?: (mapId: string, ping: PingData) => void;
	applyCombatPing?: (ping: PingData) => void;
	applyCombatReady?: (readyIds: string[]) => void;
	applyCombatUnits?: (units: CombatUnit[]) => void;
	applyInitiative?: (entries: InitEntry[], round: number) => void;
	applyCombatDrawings?: (drawings: CombatDrawing[]) => void;
	applyBoardConfig?: (config: BoardConfig) => void;
	applyCombatLog?: (entry: CombatLogEntry) => void;
	applySnapshot?: (snapshot: Extract<CampaignEvent, { type: 'snapshot' }>) => void;
	onTitle?: (title: string) => void;
	onDoc?: (html: string) => void;
	onHandout?: (headingId: string) => void;
	onMapAdded?: (map: MapData) => void;
	onCharacters?: () => void;
	onMonsters?: () => void;
}

/** Dispatch a realtime event to a page's handlers. */
export function applyFeedEvent(ev: CampaignEvent, h: FeedHandlers): void {
	switch (ev.type) {
		case 'roll':
			h.addRoll?.(ev.roll);
			break;
		case 'rolls-cleared':
			h.setRolls?.([]);
			break;
		case 'rolls-restored':
			h.setRolls?.(ev.rolls);
			break;
		case 'tokens-updated':
			h.applyTokens?.(ev.mapId, ev.tokens);
			break;
		case 'grid-updated':
			h.applyGrid?.(ev.mapId, ev.grid_size);
			break;
		case 'layer-changed':
			h.applyLayer?.(ev.mapId, ev.layer);
			break;
		case 'reveal-undone':
			h.applyRevealRemoved?.(ev.mapId, ev.opId);
			break;
		case 'reveals-cleared':
			h.applyLayerCleared?.(ev.mapId, ev.layer);
			break;
		case 'map-revealed':
		case 'map-hidden':
			h.applyMapOp?.(ev.mapId, ev.op);
			break;
		case 'map-ping':
			h.applyMapPing?.(ev.mapId, ev.ping);
			break;
		case 'combat-ping':
			h.applyCombatPing?.(ev.ping);
			break;
		case 'combat-ready':
			h.applyCombatReady?.(ev.readyIds);
			break;
		case 'combat-units-updated':
			h.applyCombatUnits?.(ev.units);
			break;
		case 'initiative-updated':
			h.applyInitiative?.(ev.entries, ev.round);
			break;
		case 'combat-drawings-updated':
			h.applyCombatDrawings?.(ev.drawings);
			break;
		case 'board-config-updated':
			h.applyBoardConfig?.(ev.config);
			break;
		case 'combat-log':
			h.applyCombatLog?.(ev.entry);
			break;
		case 'title-changed':
			h.onTitle?.(ev.title);
			break;
		case 'doc-updated':
		case 'share-changed':
			h.onDoc?.(ev.html);
			break;
		case 'handout-revealed':
			h.onHandout?.(ev.headingId);
			break;
		case 'map-added':
			h.onMapAdded?.(ev.map);
			break;
		case 'characters-updated':
			h.onCharacters?.();
			break;
		case 'monsters-updated':
			h.onMonsters?.();
			break;
		case 'snapshot':
			h.applySnapshot?.(ev);
			break;
	}
}
