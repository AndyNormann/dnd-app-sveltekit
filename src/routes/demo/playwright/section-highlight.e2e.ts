import { expect, test, type Browser, type APIRequestContext, type Page } from '@playwright/test';
const PASSCODE = 'test-passcode';

async function createCampaign(request: APIRequestContext): Promise<string> {
	const res = await request.post('/?/create', {
		form: { title: 'Section HL' },
		headers: { Origin: 'http://localhost:4173' },
		maxRedirects: 0
	});
	const loc = res.headers()['location'] ?? '';
	if (loc) return loc.split('/').pop() as string;
	return ((await res.json()) as { location?: string }).location?.split('/').pop() as string;
}

async function loginDM(browser: Browser): Promise<{ page: Page; request: APIRequestContext }> {
	const ctx = await browser.newContext();
	const page = await ctx.newPage();
	await page.goto('/login');
	await page.fill('input[name=passcode]', PASSCODE);
	await page.click('button[type=submit]');
	await expect(page).toHaveURL('/');
	return { page, request: ctx.request };
}

test('hovering anywhere in a section highlights that whole section', async ({ browser }) => {
	const dm = await loginDM(browser);
	const id = await createCampaign(dm.request);
	await dm.page.goto(`/c/${id}`);
	const pm = dm.page.locator('.mdx-host .ProseMirror');
	await expect(pm).toBeVisible({ timeout: 10000 });
	await pm.click();
	await dm.page.keyboard.type(
		'# Section One\nPara A.\nMore A.\n## Sub A\nSub body.\n# Section Two\nPara B.\n'
	);
	await dm.page.waitForTimeout(700);
	await expect(pm.locator('h1').first()).toBeVisible();
	const hl = () => pm.locator('.section-hl').count();

	// hovering the top heading highlights the whole top-level section (h1+p+p+h2+p)
	await pm.locator('h1').first().hover();
	await dm.page.waitForTimeout(250);
	expect(await hl()).toBe(5);

	// hovering body text inside the section highlights the same whole section
	await pm.locator('text=More A.').hover();
	await dm.page.waitForTimeout(250);
	expect(await hl()).toBe(5);

	// hovering a nested sub-section's body highlights only that subsection (h2+p)
	await pm.locator('text=Sub body').hover();
	await dm.page.waitForTimeout(250);
	expect(await hl()).toBe(2);

	// hovering a different top-level section highlights only that section (h1+p)
	await pm.locator('text=Para B.').hover();
	await dm.page.waitForTimeout(250);
	expect(await hl()).toBe(2);

	// highlighted blocks carry the tinted background
	const bg = await pm
		.locator('.section-hl')
		.first()
		.evaluate((el) => getComputedStyle(el).backgroundColor);
	expect(bg).toMatch(/rgba?\(/);

	// caret placement should also highlight the section (not just mouse hover)
	await pm.locator('text=Para B.').click();
	await dm.page.waitForTimeout(250);
	expect(await hl()).toBe(2);

	// highlighting must not shift the layout: an un-highlighted paragraph keeps its
	// vertical position while a different section is hovered
	await pm.locator('h1').first().hover();
	await dm.page.waitForTimeout(250);
	const sb = await pm.locator('text=Sub body').boundingBox();
	expect(sb).toBeTruthy();
	await pm.locator('text=Para A.').hover();
	await dm.page.waitForTimeout(250);
	const sb2 = await pm.locator('text=Sub body').boundingBox();
	expect(sb2).toBeTruthy();
	expect(sb!.y).toBeCloseTo(sb2!.y, 1);
});
