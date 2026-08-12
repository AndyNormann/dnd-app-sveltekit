import { expect, test, type Browser, type APIRequestContext, type Page } from '@playwright/test';
const ORIGIN = 'http://localhost:4173';

async function createCampaign(request: APIRequestContext): Promise<string> {
	const res = await request.post('/?/create', { form: { title: 'Hover Probe' }, maxRedirects: 0, headers: { Origin: ORIGIN } });
	const loc = res.headers()['location'] ?? '';
	if (loc) return loc.split('/').pop() as string;
	return ((await res.json()) as { location?: string }).location?.split('/').pop() as string;
}
async function loginDM(browser: Browser) {
	const ctx = await browser.newContext();
	const page = await ctx.newPage();
	await page.goto('/login');
	await page.fill('input[name=passcode]', 'test-passcode');
	await page.click('button[type=submit]');
	await expect(page).toHaveURL('/');
	return { page, request: ctx.request };
}
test('heading controls are hidden until the heading is hovered', async ({ browser }) => {
	const dm = await loginDM(browser);
	const id = await createCampaign(dm.request);
	await dm.page.goto(`/c/${id}`);
	await dm.page.waitForSelector('.mdx-host .ProseMirror');
	await dm.page.locator('.mdx-host .ProseMirror').click();
	await dm.page.keyboard.type('# Hidden Controls\n\n');
	// wait for the heading-id marker to be injected server-side on save
	await expect(dm.page.locator('.dm-heading-controls').first()).toBeVisible({ timeout: 5000 });

	const h1 = dm.page.locator('.mdx-host .ProseMirror h1').first();
	await h1.scrollIntoViewIfNeeded();
	const hidden = await dm.page.locator('.dm-heading-controls').first().evaluate((el) => getComputedStyle(el).opacity);
	console.log('HOVPROBE hidden', hidden);
	expect(Number(hidden)).toBe(0);

	await h1.hover();
	await dm.page.waitForTimeout(250);
	const shown = await dm.page.locator('.dm-heading-controls').first().evaluate((el) => getComputedStyle(el).opacity);
	console.log('HOVPROBE shown', shown);
	expect(Number(shown)).toBe(1);
});
