import type { Cookies } from '@sveltejs/kit';
import { getCharacter } from './db';
import { isDM } from './auth';

export const PLAYER_COOKIE = 'dnd_player';

/** The authenticated player character for this request, or null. */
export function playerCharacter(cookies: Cookies) {
	const id = cookies.get(PLAYER_COOKIE);
	if (!id) return null;
	return getCharacter(id);
}

/** GM ping colour, versus a default spectator colour. */
export const GM_PING_COLOR = '#f0c040';
export const DEFAULT_PING_COLOR = '#8ea0c9';

/** Resolve the pinger identity/colour for a ping request (golden for the DM). */
export function pingIdentity(cookies: Cookies): { color: string; name: string } {
	if (isDM(cookies)) return { color: GM_PING_COLOR, name: 'GM' };
	const ch = playerCharacter(cookies);
	if (ch) return { color: ch.color, name: ch.name };
	return { color: DEFAULT_PING_COLOR, name: 'Player' };
}
