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
	return { dm, page };
}

test('rolls live in a right sidebar; initiative lives on its own combat page (live to players)', async ({
	browser
}) => {
	const anon = await browser.newContext();
	const id = await createCampaign(anon.request);
	const { dm, page } = await loginDM(browser);

	// DM notes page: rolls are a right sidebar, no floating initiative panel
	await page.goto(`/c/${id}`);
	await expect(page.locator('.mdx-host .ProseMirror')).toBeVisible({ timeout: 10000 });
	await expect(page.locator('.rail.rolls .roll-log')).toBeVisible();
	await expect(page.locator('.initiative')).toHaveCount(0);
	// notes<->combat tabs
	await expect(page.locator('.tabs .tab').first()).toHaveText('Notes');

	// DM combat page: initiative is the page content with DM controls
	await page.goto(`/c/${id}/combat`);
	await expect(page.locator('.initiative')).toBeVisible({ timeout: 10000 });
	await expect(page.locator('.initiative .add')).toBeVisible();
	await page.locator('.add .nm').fill('Goblin');
	await page.locator('.add .in').fill('20');
	await page.locator('.add button[type=submit], .add button').last().click();

	// player combat page sees it live
	const player = await browser.newPage();
	await player.goto(`/c/${id}/play/combat`);
	await player.waitForTimeout(900);
	await expect(player.locator('.initiative')).toBeVisible({ timeout: 10000 });
	await expect(player.locator('.initiative').getByText('Goblin')).toBeVisible({ timeout: 10000 });
	await expect(player.locator('.initiative .add')).toHaveCount(0); // read-only

	await anon.close();
	await dm.close();
	await player.close();
});
