import { expect, test, type Browser } from '@playwright/test';

const PASSCODE = 'test-passcode';

async function createCampaign(request: import('@playwright/test').APIRequestContext): Promise<string> {
	const res = await request.post('/?/create', {
		form: { title: 'Share Campaign' },
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

test('show/hide toggle propagates to a live player via SSE', async ({ browser }) => {
	const anon = await browser.newContext();
	const id = await createCampaign(anon.request);
	const { dm, page } = await loginDM(browser);

	await page.goto(`/c/${id}`);
	const editor = page.locator('.mdx-host .ProseMirror');
	await expect(editor).toBeVisible({ timeout: 10000 });
	await editor.click();
	await page.keyboard.type('# Main Section');
	await expect(page.locator('.save-state')).toContainText('Saved', { timeout: 5000 });

	const controls = editor.locator('.dm-heading-controls').first();
	await expect(controls).toBeVisible({ timeout: 5000 });
	const vis = controls.locator('.dhc-vis');
	await expect(vis).toHaveText('🔒'); // private by default

	// a live player should NOT see the unshared heading — instead the empty state
	const player = await browser.newPage();
	await player.goto(`/c/${id}/play`);
	await player.waitForTimeout(900);
	await expect(player.getByText("The DM hasn't shared anything yet")).toBeVisible();
	const docHeading = player.locator('.rendered').getByText('Main Section');
	await expect(docHeading).toHaveCount(0);

	// reveal it: single button flips to shared AND the live player sees it via SSE
	await vis.click();
	await expect(vis).toHaveText('👥');
	await expect(docHeading).toBeVisible({ timeout: 10000 });

	// hide again: button flips back to private AND the player hides it
	await vis.click();
	await expect(vis).toHaveText('🔒');
	await expect(docHeading).toHaveCount(0, { timeout: 10000 });

	await anon.close();
	await dm.close();
	await player.close();
});
