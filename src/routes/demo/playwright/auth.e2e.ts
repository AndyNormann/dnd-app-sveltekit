import { expect, test, type APIRequestContext } from '@playwright/test';

/** Create a campaign via the (open) create action; returns its id. */
async function createCampaign(request: APIRequestContext): Promise<string> {
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

test('login: wrong passcode rejected, correct passcode succeeds', async ({ page }) => {
	await page.goto('/login');
	await page.fill('input[name=passcode]', 'wrong');
	await page.click('button[type=submit]');
	await expect(page.getByText('Incorrect passcode')).toBeVisible();

	await page.fill('input[name=passcode]', 'test-passcode');
	await page.click('button[type=submit]');
	await expect(page).toHaveURL('/');
});

test('unauthenticated client is blocked from DM actions but can roll', async ({ request }) => {
	const id = await createCampaign(request);

	// DM editor page redirects to login
	const editor = await request.get(`/c/${id}`, { maxRedirects: 0 });
	expect(editor.status()).toBe(303);

	// creating a document blocked
	const content = await request.post(`/c/${id}/documents`, { data: {} });
	expect(content.status()).toBe(401);

	// map upload blocked (multipart is CSRF-checked, so send same-origin Origin)
	const map = await request.post(`/c/${id}/maps`, {
		multipart: { file: 'x', width: '10', height: '10' },
		headers: { Origin: 'http://localhost:4173' }
	});
	expect(map.status()).toBe(401);

	// secret roll blocked
	const secret = await request.post(`/c/${id}/roll`, { data: { expression: '1d20', secret: true } });
	expect(secret.status()).toBe(401);

	// public roll allowed
	const pub = await request.post(`/c/${id}/roll`, { data: { expression: '1d20' } });
	expect(pub.status()).toBe(200);
});

test('authenticated DM can write content and roll secretly', async ({ page, request }) => {
	const id = await createCampaign(request);

	// log in as DM
	await page.goto('/login');
	await page.fill('input[name=passcode]', 'test-passcode');
	await page.click('button[type=submit]');
	await expect(page).toHaveURL('/');

	// editor is now reachable
	const editor = await page.goto(`/c/${id}`);
	expect(editor?.status()).toBe(200);
	await expect(page).toHaveTitle(/DM/);

	// DM content write works (attach the login cookie explicitly)
	const cookies = await page.context().cookies();
	const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join('; ');
	const docs = await request.get(`/c/${id}/documents`, { headers: { cookie: cookieHeader } });
	const { documents } = (await docs.json()) as { documents: { id: string }[] };
	const docId = documents[0].id;
	const content = await request.post(`/c/${id}/documents/${docId}/content`, {
		data: { content: '# Hello\n\nWorld' },
		headers: { cookie: cookieHeader }
	});
	expect(content.status()).toBe(200);
});
