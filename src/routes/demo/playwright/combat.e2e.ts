import { expect, test, type Browser } from '@playwright/test';

const PASSCODE = 'test-passcode';

async function createCampaign(request: import('@playwright/test').APIRequestContext): Promise<string> {
	const res = await request.post('/?/create', {
		form: { title: 'Combat Campaign' },
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
	const cookieHeader = (await dm.cookies()).map((c) => `${c.name}=${c.value}`).join('; ');
	return { dm, page, cookieHeader };
}

async function createCharacter(dm: import('@playwright/test').BrowserContext, id: string, name: string, cookieHeader: string) {
	const res = await dm.request.post(`/c/${id}/characters`, {
		data: { name },
		headers: { cookie: cookieHeader }
	});
	expect(res.status()).toBe(200);
	const { link_token } = (await res.json()) as { link_token: string };
	return link_token;
}

test('rolls live in a right sidebar; initiative lives on its own combat page (live to a player portal)', async ({
	browser
}) => {
	const anon = await browser.newContext();
	const id = await createCampaign(anon.request);
	const { dm, page, cookieHeader } = await loginDM(browser);

	// DM notes page: rolls are a right sidebar, document list on the left, no initiative
	await page.goto(`/c/${id}`);
	await expect(page.locator('.mdx-host .ProseMirror')).toBeVisible({ timeout: 10000 });
	await expect(page.locator('.rail.rolls .roll-log')).toBeVisible();
	await expect(page.locator('.rail .doc-list')).toBeVisible();
	await expect(page.locator('.initiative')).toHaveCount(0);
	await expect(page.locator('.tabs .tab').first()).toHaveText('Notes');

	// DM combat page: initiative is the page content with DM controls
	await page.goto(`/c/${id}/combat`);
	await expect(page.locator('.initiative')).toBeVisible({ timeout: 10000 });
	await expect(page.locator('.rail.left .initiative')).toBeVisible();

	// add an enemy to the board, then roll initiative (combat units populate the tracker)
	await page.locator('.conn.on').waitFor({ timeout: 5000 });
	await dm.request.post(`/c/${id}/combat/units`, {
		data: { action: 'add-enemy', name: 'Goblin', max_hp: 7, hp: 7 }
	});
	await expect(page.locator('.board .token').filter({ hasText: 'Goblin' })).toBeVisible();
	await page.click('button:has-text("Roll initiative")');
	await expect(page.locator('.rail.left .initiative').getByText('Goblin')).toBeVisible({ timeout: 10000 });

	// player portal combat page sees it live
	const token = await createCharacter(dm, id, 'Aria', cookieHeader);
	const player = await browser.newPage();
	await player.goto(`/p/${token}/combat`);
	await player.waitForTimeout(900);
	await expect(player.locator('.initiative')).toBeVisible({ timeout: 10000 });
	await expect(player.locator('.initiative').getByText('Goblin')).toBeVisible({ timeout: 10000 });
	await expect(player.locator('.initiative .add')).toHaveCount(0); // read-only

	await anon.close();
	await dm.close();
	await player.close();
});
