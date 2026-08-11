import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';

const PASSCODE = 'test-passcode';

/** Create a campaign via the (open) create action; returns its id. */
async function createCampaign(request: import('@playwright/test').APIRequestContext): Promise<string> {
	const res = await request.post('/?/create', {
		form: { title: 'E2E Campaign' },
		maxRedirects: 0,
		headers: { Origin: 'http://localhost:4173' } // SvelteKit CSRF requires same-origin
	});
	const loc = res.headers()['location'] ?? '';
	if (loc) return loc.split('/').pop() as string;
	const body = (await res.json()) as { location?: string };
	return (body.location ?? '').split('/').pop() as string;
}

/** Log in a DM context and return the context + a cookie header for API calls. */
async function loginDM(browser: Browser) {
	const dm = await browser.newContext();
	const dmPage = await dm.newPage();
	await dmPage.goto('/login');
	await dmPage.fill('input[name=passcode]', PASSCODE);
	await dmPage.click('button[type=submit]');
	await expect(dmPage).toHaveURL('/');
	const cookieHeader = (await dm.cookies()).map((c) => `${c.name}=${c.value}`).join('; ');
	return { dm, dmPage, cookieHeader };
}

/** Write content as DM and return the id of the first heading marker injected by the server. */
async function writeContent(
	dm: import('@playwright/test').BrowserContext,
	id: string,
	markdown: string,
	cookieHeader: string
): Promise<string> {
	const res = await dm.request.post(`/c/${id}/content`, {
		data: { content: markdown },
		headers: { cookie: cookieHeader }
	});
	expect(res.status()).toBe(200);
	const body = (await res.json()) as { content: string };
	return body.content.match(/<!--id:([A-Za-z0-9_-]+)-->/)?.[1] ?? '';
}

/** Reveal a heading to players (the handout action), broadcasting share-changed. */
async function revealHeading(
	dm: import('@playwright/test').BrowserContext,
	id: string,
	headingId: string,
	cookieHeader: string
) {
	const res = await dm.request.post(`/c/${id}/handout`, {
		data: { headingId },
		headers: { cookie: cookieHeader }
	});
	expect(res.status()).toBe(200);
}

async function openPlayer(anon: BrowserContext, id: string): Promise<Page> {
	const page = await anon.newPage();
	await page.goto(`/c/${id}/play`);
	await expect(page.getByText('E2E Campaign')).toBeVisible();
	// let the page's EventSource connect before broadcasting
	await page.waitForTimeout(800);
	return page;
}

test('realtime: a DM handout reveal reaches an already-open player page via SSE', async ({
	browser
}) => {
	const anon = await browser.newContext();
	const id = await createCampaign(anon.request);
	const { dm, cookieHeader } = await loginDM(browser);

	const headingId = await writeContent(dm, id, '# Fresh Heading\n\nBody text', cookieHeader);
	expect(headingId).not.toBe('');

	const player = await openPlayer(anon, id);

	// DM reveals the section to players — broadcast should reach the open page
	await revealHeading(dm, id, headingId, cookieHeader);
	await expect(player.getByRole('heading', { name: 'Fresh Heading' })).toBeVisible();

	await anon.close();
	await dm.close();
});

test('realtime: a fresh (reconnecting) player page gets the shared state via snapshot', async ({
	browser
}) => {
	const anon = await browser.newContext();
	const id = await createCampaign(anon.request);
	const { dm, cookieHeader } = await loginDM(browser);

	const headingId = await writeContent(dm, id, '## Snapshot Heading\n\nSeen on connect', cookieHeader);
	await revealHeading(dm, id, headingId, cookieHeader);

	// a player who connects after the reveal must still see it
	const player = await openPlayer(anon, id);
	await expect(player.getByRole('heading', { name: 'Snapshot Heading' })).toBeVisible();

	await anon.close();
	await dm.close();
});

test('realtime: secret rolls never reach players, public rolls do', async ({ browser }) => {
	const anon = await browser.newContext();
	const id = await createCampaign(anon.request);
	const { dm, cookieHeader } = await loginDM(browser);

	const player = await openPlayer(anon, id);

	// secret roll: the route skips the SSE broadcast entirely
	const secret = await dm.request.post(`/c/${id}/roll`, {
		data: { expression: '1d20', secret: true, label: 'SECRET-ROLL' },
		headers: { cookie: cookieHeader }
	});
	expect(secret.status()).toBe(200);

	// public roll: broadcast to all connected players
	const pub = await dm.request.post(`/c/${id}/roll`, {
		data: { expression: '1d20', label: 'PUBLIC-ROLL' },
		headers: { cookie: cookieHeader }
	});
	expect(pub.status()).toBe(200);

	await expect(player.getByText('PUBLIC-ROLL')).toBeVisible();
	await expect(player.getByText('SECRET-ROLL')).not.toBeVisible();

	await anon.close();
	await dm.close();
});
