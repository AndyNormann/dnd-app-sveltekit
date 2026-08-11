import { redirect } from '@sveltejs/kit';
import {
	authConfigured,
	COOKIE_NAME,
	COOKIE_OPTS,
	createSessionToken,
	verifyPasscode,
	isDM
} from '$lib/server/auth';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ cookies, url }) => {
	if (isDM(cookies)) throw redirect(303, url.searchParams.get('redirect') || '/');
	return { configured: authConfigured() };
};

export const actions: Actions = {
	default: async ({ request, cookies, url }) => {
		const form = await request.formData();
		const passcode = String(form.get('passcode') ?? '');
		if (verifyPasscode(passcode)) {
			cookies.set(COOKIE_NAME, createSessionToken(), COOKIE_OPTS);
			throw redirect(303, url.searchParams.get('redirect') || '/');
		}
		return { error: 'Incorrect passcode' };
	}
};
