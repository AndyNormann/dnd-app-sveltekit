import { expect, test, type Browser } from '@playwright/test';

const PASSCODE = 'test-passcode';

async function createCampaign(request: import('@playwright/test').APIRequestContext): Promise<string> {
	const res = await request.post('/?/create', {
		form: { title: 'UX Campaign' },
		maxRedirects: 0,
		headers: { Origin: 'http://localhost:4173' }
	});
	const loc = res.headers()['location'] ?? '';
	if (loc) return loc.split('/').pop() as string;
	const body = (await res.json()) as { location?: string };
	return (body.location ?? '').split('/').pop() as string;
}

async function loginDM(browser: Browser) {
	const dm = await browser.newContext();
	const page = await dm.newPage();
	await page.goto('/login');
	await page.fill('input[name=passcode]', PASSCODE);
	await page.click('button[type=submit]');
	await expect(page).toHaveURL('/');
	return { dm, page };
}

test('monster collections: build on the roster, drop onto the combat board, drawing undo', async ({
	browser
}) => {
	const anon = await browser.newContext();
	const id = await createCampaign(anon.request);
	const { dm, page } = await loginDM(browser);

	// create two monster templates
	await dm.request.post(`/c/${id}/monsters`, {
		data: { name: 'Goblin', speed: 30, init_bonus: 1, max_hp: 7 }
	});
	await dm.request.post(`/c/${id}/monsters`, {
		data: { name: 'Hobgoblin', speed: 30, init_bonus: 2, max_hp: 13 }
	});

	// build a collection on the roster page via the UI
	await page.goto(`/c/${id}/combat/roster`);
	await page.locator('.new-col input').fill('Goblin patrol');
	await page.click('.new-col button[type=submit]');
	await expect(page.locator('.coll').getByText('Goblin patrol')).toBeVisible({ timeout: 5000 });

	const collCard = page.locator('.coll').first();
	await collCard.locator('.add-item select').selectOption({ label: 'Goblin' });
	await collCard.locator('.add-item .num').fill('3');
	await collCard.locator('.add-item button').click();
	await expect(collCard).toContainText('3× Goblin');
	await collCard.locator('.add-item select').selectOption({ label: 'Hobgoblin' });
	await collCard.locator('.add-item .num').fill('1');
	await collCard.locator('.add-item button').click();
	await expect(collCard).toContainText('1× Hobgoblin');

	// drop the collection onto the combat board in one step
	await page.goto(`/c/${id}/combat`);
	await page.locator('.enc-select').selectOption({ label: 'Goblin patrol' });
	await page.click('button:has-text("Add collection")');
	await expect(page.locator('.board .token').filter({ hasText: /Goblin \d/ })).toHaveCount(3, {
		timeout: 10000
	});
	await expect(page.locator('.board .token').filter({ hasText: 'Hobgoblin' })).toHaveCount(1);

	// drawing undo via the API
	const dmReq = dm.request;
	const dr = await dmReq.post(`/c/${id}/combat/drawings`, {
		data: { color: '#222', width: 4, mode: 'draw', points: [[0, 0], [1, 1], [2, 2]] }
	});
	expect(dr.ok()).toBeTruthy();
	let list = (await (await dmReq.get(`/c/${id}/combat/drawings`)).json()) as unknown[];
	expect(list.length).toBe(1);
	const un = await dmReq.post(`/c/${id}/combat/drawings`, { data: { action: 'undo' } });
	expect(un.ok()).toBeTruthy();
	list = (await (await dmReq.get(`/c/${id}/combat/drawings`)).json()) as unknown[];
	expect(list.length).toBe(0);

	await anon.close();
	await dm.close();
});

test('player ready signals the DM; board zoom controls work', async ({ browser }) => {
	const anon = await browser.newContext();
	const id = await createCampaign(anon.request);
	const { dm, page } = await loginDM(browser);

	const cre = await dm.request.post(`/c/${id}/characters`, {
		data: { name: 'Aria', speed: 30, init_bonus: 2, color: '#1b6ca8', max_hp: 20, hp: 20 }
	});
	expect(cre.ok()).toBeTruthy();
	const ch = (await cre.json()) as { id: string; link_token: string };
	const player = await browser.newPage();
	await player.goto(`/p/${ch.link_token}/combat`);
	await expect(player.locator('.board .token')).toHaveCount(1, { timeout: 10000 });
	await expect(player.locator('.ready-btn')).toBeVisible();
	await player.click('.ready-btn');
	await expect(player.locator('.ready-btn')).toHaveClass(/on/);

	await page.goto(`/c/${id}/combat`);
	await expect(page.locator('.ready-status')).toContainText('1/1 ready', { timeout: 10000 });

	await expect(page.locator('.board-viewport')).toBeVisible();
	const z0 = (await page.locator('.zval').textContent()) ?? '';
	await page.click('button[aria-label="Zoom in"]');
	await expect(page.locator('.zval')).not.toHaveText(z0);

	await anon.close();
	await dm.close();
	await player.close();
});

test('backups list is DM-only', async ({ browser }) => {
	const anon = await browser.newContext();
	const anonRes = await anon.request.get('/backups');
	expect(anonRes.status()).toBe(401);

	const { dm } = await loginDM(browser);
	const res = await dm.request.get('/backups');
	expect(res.status()).toBe(200);
	const arr = (await res.json()) as unknown[];
	expect(Array.isArray(arr)).toBeTruthy();

	await anon.close();
	await dm.close();
});
