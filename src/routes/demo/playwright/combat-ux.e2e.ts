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

test('encounter save/load and drawing undo', async ({ browser }) => {
	const anon = await browser.newContext();
	const id = await createCampaign(anon.request);
	const { dm, page } = await loginDM(browser);
	await page.goto(`/c/${id}/combat`);
	await expect(page.locator('.board .token')).toHaveCount(0);

	// add a goblin to the board
	await page.locator('.add-enemy input[placeholder="Enemy name"]').fill('Goblin');
	await page.locator('.add-enemy input[placeholder="HP"]').fill('7');
	await page.click('.add-enemy button[type=submit]');
	await expect(page.locator('.board .token').filter({ hasText: 'Goblin' })).toBeVisible();

	// save it as an encounter
	await page.locator('.enc-save input').fill('Goblin patrol');
	await page.click('.enc-save button[type=submit]');
	await expect(page.locator('.enc-list').getByText('Goblin patrol')).toBeVisible({ timeout: 5000 });

	// clear the board, then reload the encounter
	await page.click('button:has-text("Clear board")');
	await expect(page.locator('.board .token')).toHaveCount(0);
	await page.click('.enc-list button:has-text("Load")');
	await expect(page.locator('.board .token').filter({ hasText: 'Goblin' })).toBeVisible({
		timeout: 10000
	});

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

	// create a character + add it to the board
	const cre = await dm.request.post(`/c/${id}/characters`, {
		data: { name: 'Aria', speed: 30, init_bonus: 2, color: '#1b6ca8', max_hp: 20, hp: 20 }
	});
	expect(cre.ok()).toBeTruthy();
	const ch = (await cre.json()) as { id: string; link_token: string };
	const ad = await dm.request.post(`/c/${id}/combat/units`, {
		data: { action: 'add-player', character_id: ch.id }
	});
	expect(ad.ok()).toBeTruthy();

	// the player marks ready on their portal combat page
	const player = await browser.newPage();
	await player.goto(`/p/${ch.link_token}/combat`);
	await expect(player.locator('.board .token')).toHaveCount(1, { timeout: 10000 });
	await expect(player.locator('.ready-btn')).toBeVisible();
	await player.click('.ready-btn');
	await expect(player.locator('.ready-btn')).toHaveClass(/on/);

	// the DM sees 1/1 ready
	await page.goto(`/c/${id}/combat`);
	await expect(page.locator('.ready-status')).toContainText('1/1 ready', { timeout: 10000 });

	// board zoom controls scale the view
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
