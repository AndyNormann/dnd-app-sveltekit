import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Cookies } from '@sveltejs/kit';

/**
 * DM authentication.
 *
 * A single global passcode is read from the `DM_PASSCODE` env var. On a
 * successful login we issue a self-contained, signed HttpOnly cookie: the
 * value is `token.signature`, where the signature is an HMAC-SHA256 over the
 * token using a key derived from the passcode. Because the key is stable
 * across restarts, sessions survive deploys; changing the passcode
 * invalidates all sessions (acceptable for a single DM).
 *
 * FAIL-OPEN BEHAVIOR: if `DM_PASSCODE` is not configured, every request is
 * treated as a DM. This keeps the app working for local development without a
 * passcode. Deploy with `DM_PASSCODE` set to actually enable protection.
 */

const PASSCODE = process.env.DM_PASSCODE ?? '';
const SIGNING_KEY = createHash('sha256').update(`dnd-dm-session:${PASSCODE}`).digest();

export const COOKIE_NAME = 'dnd_dm_session';
export const DM_SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days
export const COOKIE_OPTS = {
	path: '/',
	httpOnly: true,
	sameSite: 'lax' as const,
	maxAge: DM_SESSION_MAX_AGE,
	secure: process.env.NODE_ENV === 'production'
};

/** Whether a passcode is configured. When false, auth is effectively disabled. */
export function authConfigured(): boolean {
	return PASSCODE.length > 0;
}

function safeEqual(a: Buffer, b: Buffer): boolean {
	if (a.length !== b.length) return false;
	return timingSafeEqual(a, b);
}

/** Verify a submitted passcode in constant time. Fails if none is configured. */
export function verifyPasscode(submitted: string): boolean {
	if (!PASSCODE || !submitted) return false;
	const a = createHash('sha256').update(PASSCODE).digest();
	const b = createHash('sha256').update(submitted).digest();
	return safeEqual(a, b);
}

function sign(token: string): string {
	return createHmac('sha256', SIGNING_KEY).update(token).digest('hex');
}

/** Build a signed session token to store in the cookie. */
export function createSessionToken(): string {
	const token = randomBytes(32).toString('hex');
	return `${token}.${sign(token)}`;
}

/** Return the raw token if `cookieValue` carries a valid signature, else null. */
export function parseSessionToken(cookieValue: string | undefined): string | null {
	if (!cookieValue) return null;
	const dot = cookieValue.lastIndexOf('.');
	if (dot <= 0) return null;
	const token = cookieValue.slice(0, dot);
	const sig = cookieValue.slice(dot + 1);
	const a = Buffer.from(sig, 'hex');
	const b = Buffer.from(sign(token), 'hex');
	return safeEqual(a, b) ? token : null;
}

/**
 * True if the request is from the DM. When no passcode is configured the app
 * runs open (fail-open); when configured, a validly signed cookie is required.
 */
export function isDM(cookies: Cookies): boolean {
	if (!authConfigured()) return true;
	return parseSessionToken(cookies.get(COOKIE_NAME)) !== null;
}
