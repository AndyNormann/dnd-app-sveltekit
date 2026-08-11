import { expect, test, type Browser } from '@playwright/test';

const PASSCODE = 'test-passcode';
// 1x1 red PNG
const PNG = Buffer.from(
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
	'base64'
);

async function createCampaign(request: import('@playwright/test').APIRequestContext): Promise<string> {
	const res = await request.post('/?/create', {
		form: { title: 'Map Campaign' },
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

test('uploaded map renders as an interactive widget in the editor', async ({ browser }) => {
	const anon = await browser.newContext();
	const id = await createCampaign(anon.request);
	const { dm, page } = await loginDM(browser);

	await page.goto(`/c/${id}`);
	const editor = page.locator('.mdx-host .ProseMirror');
	await expect(editor).toBeVisible({ timeout: 10000 });

	// upload via the header "Add map" file input
	await page.locator('.bar input[type=file]').setInputFiles({
		name: 'map.png',
		mimeType: 'image/png',
		buffer: PNG
	});

	// the ::map{id=...} directive becomes a mounted MapView canvas
	const widget = page.locator('.mdx-host .map-widget');
	await expect(widget).toBeVisible({ timeout: 10000 });
	await expect(widget.locator('canvas').first()).toBeVisible();

	// reload persists the embed directive and re-renders the widget
	await page.reload();
	await expect(editor).toBeVisible({ timeout: 10000 });
	await expect(page.locator('.mdx-host .map-widget')).toBeVisible({ timeout: 10000 });

	await anon.close();
	await dm.close();
});
