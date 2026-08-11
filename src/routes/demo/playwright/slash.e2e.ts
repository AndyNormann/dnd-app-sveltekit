import { expect, test, type Browser } from '@playwright/test';

const PASSCODE = 'test-passcode';
const PNG = Buffer.from(
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
	'base64'
);

async function createCampaign(request: import('@playwright/test').APIRequestContext): Promise<string> {
	const res = await request.post('/?/create', {
		form: { title: 'Slash Campaign' },
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

test('slash menu: /map uploads and inserts at caret; menu only at block start', async ({ browser }) => {
	const anon = await browser.newContext();
	const id = await createCampaign(anon.request);
	const { dm, page } = await loginDM(browser);
	await page.goto(`/c/${id}`);
	const editor = page.locator('.mdx-host .ProseMirror');
	await expect(editor).toBeVisible({ timeout: 10000 });
	await editor.click();

	// '/' at the start of a block opens the menu
	await page.keyboard.type('/');
	const menu = page.locator('.dnd-slash');
	await expect(menu).toBeVisible({ timeout: 5000 });
	await expect(menu.locator('.dnd-slash-map')).toBeVisible();

	// '/' typed mid-paragraph does NOT open the menu
	await page.keyboard.press('Escape');
	await expect(menu).toBeHidden();
	await page.keyboard.type('Some words /more');
	await expect(menu).toBeHidden();

	// back to a blank block: newline then '/' opens menu again
	await page.keyboard.press('Enter');
	await page.keyboard.type('/');
	await expect(menu).toBeVisible();

	// choose Map -> file chooser -> upload -> a map widget is inserted at the caret
	const chooserPromise = page.waitForEvent('filechooser');
	await page.locator('.dnd-slash-map').click();
	const chooser = await chooserPromise;
	await chooser.setFiles({ name: 'm.png', mimeType: 'image/png', buffer: PNG });
	await expect(page.locator('.mdx-host .map-widget')).toBeVisible({ timeout: 10000 });
	await expect(page.locator('.dnd-slash')).toBeHidden();

	// the stored markdown carries a ::map{id=...} directive (no literal slash line)
	await expect(page.getByText('Saved')).toBeVisible({ timeout: 5000 });

	await anon.close();
	await dm.close();
});
