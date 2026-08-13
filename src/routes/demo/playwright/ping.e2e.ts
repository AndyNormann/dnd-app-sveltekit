import { expect, test, type Browser } from '@playwright/test';

const PASSCODE = 'test-passcode';
const PNG_1x1 = Buffer.from(
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
	'base64'
);

async function createCampaign(request: import('@playwright/test').APIRequestContext): Promise<string> {
	const res = await request.post('/?/create', {
		form: { title: 'Ping Campaign' },
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

test('combat ping relays from the DM to an open player portal (golden GM)', async ({ browser }) => {
	const anon = await browser.newContext();
	const id = await createCampaign(anon.request);
	await anon.close();

	const { dm, page } = await loginDM(browser);
	// create a character so we have a player link
	const res = await dm.request.post(`/c/${id}/characters`, {
		data: { name: 'Aria', speed: 30 }
	});
	const ch = (await res.json()) as { link_token: string };

	// open the player's combat portal
	const player = await browser.newPage();
	await player.goto(`/p/${ch.link_token}/combat`);
	await player.waitForTimeout(700);

	// DM switches to Ping and clicks the board
	await page.goto(`/c/${id}/combat`);
	await expect(page.locator('.board-wrap canvas.grid')).toBeVisible({ timeout: 10000 });
	await page.click('button:has-text("📌 Ping")');
	await page.locator('.board-wrap canvas.grid').click({ position: { x: 120, y: 120 } });

	// the player sees the golden GM ping live
	await player.waitForTimeout(900);
	const ping = player.locator('.board-wrap .ping').first();
	await expect(ping).toBeVisible();
	await expect(ping.locator('.lbl')).toHaveText('GM');
	await expect(ping.locator('.dot')).toHaveCSS('background-color', 'rgb(240, 192, 64)');

	await dm.close();
	await player.close();
});

test('notes map ping shows on the DM editor with the golden GM colour', async ({ browser }) => {
	const anon = await browser.newContext();
	const id = await createCampaign(anon.request);
	await anon.close();

	const { dm, page } = await loginDM(browser);
	await page.goto(`/c/${id}`);
	await expect(page.locator('.mdx-host .ProseMirror')).toBeVisible({ timeout: 10000 });

	// upload a map -> renders inside the editor
	await page.locator('.bar input[type=file]').setInputFiles({
		name: 'm.png',
		mimeType: 'image/png',
		buffer: PNG_1x1
	});
	const widget = page.locator('.map-widget');
	await expect(widget).toBeVisible({ timeout: 10000 });
	await expect(widget.locator('canvas')).toBeVisible({ timeout: 10000 });

	// switch to Ping and click the map
	await widget.locator('button:has-text("Ping")').click();
	await widget.locator('.stage canvas').click({ position: { x: 20, y: 20 } });

	// the echo ping appears on the DM editor (golden, 'GM')
	await expect(widget.locator('.ping')).toBeVisible({ timeout: 3000 });
	await expect(widget.locator('.ping .lbl')).toHaveText('GM');
	await expect(widget.locator('.ping .dot')).toHaveCSS('background-color', 'rgb(240, 192, 64)');

	await dm.close();
});
