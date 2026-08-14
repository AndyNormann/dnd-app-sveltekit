/**
 * In-memory "ready / done" signalling per campaign. Players mark their unit ready
 * on the combat board so the DM can see who has finished their turn without
 * asking. Transient by design: reset whenever the turn advances or initiative is
 * rolled (see combat.ts), and lost on server restart (acceptable for a session aid).
 */
const readyByCampaign = new Map<string, Set<string>>();

export function markReady(campaignId: string, unitId: string): void {
	let set = readyByCampaign.get(campaignId);
	if (!set) {
		set = new Set();
		readyByCampaign.set(campaignId, set);
	}
	set.add(unitId);
}

export function unmarkReady(campaignId: string, unitId: string): void {
	readyByCampaign.get(campaignId)?.delete(unitId);
}

export function getReadyUnitIds(campaignId: string): string[] {
	return Array.from(readyByCampaign.get(campaignId) ?? []);
}

export function resetReady(campaignId: string): void {
	readyByCampaign.delete(campaignId);
}
