import type { Cookies } from '@sveltejs/kit';
import { getCharacter } from './db';

export const PLAYER_COOKIE = 'dnd_player';

/** The authenticated player character for this request, or null. */
export function playerCharacter(cookies: Cookies) {
	const id = cookies.get(PLAYER_COOKIE);
	if (!id) return null;
	return getCharacter(id);
}
