import { broadcast } from './sse';
import { listInitiative, getInitiativeRound, listCombatUnits, getBoardConfig, listCombatDrawings } from './db';

/**
 * Feed: a single owner for the realtime events that routes push to clients.
 * Producers call the `emit*` helpers instead of hand-building event objects and
 * repeating broadcast plumbing, so the event shapes live in one place.
 */

export function initiativeUpdated(campaignId: string) {
	return {
		type: 'initiative-updated' as const,
		entries: listInitiative(campaignId),
		round: getInitiativeRound(campaignId)
	};
}
export function combatUnitsUpdated(campaignId: string) {
	return {
		type: 'combat-units-updated' as const,
		units: listCombatUnits(campaignId)
	};
}
export function boardConfigUpdated(campaignId: string) {
	return {
		type: 'board-config-updated' as const,
		config: getBoardConfig(campaignId)
	};
}

export function emitInitiative(campaignId: string) {
	broadcast(campaignId, initiativeUpdated(campaignId));
}
export function emitUnits(campaignId: string) {
	broadcast(campaignId, combatUnitsUpdated(campaignId));
}
export function emitBoardConfig(campaignId: string) {
	broadcast(campaignId, boardConfigUpdated(campaignId));
}

export function combatDrawingsUpdated(campaignId: string) {
	return {
		type: 'combat-drawings-updated' as const,
		drawings: listCombatDrawings(campaignId)
	};
}

export function emitDrawings(campaignId: string) {
	broadcast(campaignId, combatDrawingsUpdated(campaignId));
}
