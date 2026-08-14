import { expect, test, type Browser, type APIRequestContext } from '@playwright/test';
const ORIGIN = 'http://localhost:4173';
async function createCampaign(request: APIRequestContext): Promise<string> {
	const res = await request.post('/?/create', { form: { title: 'Heading Probe' }, maxRedirects: 0, headers: { Origin: ORIGIN } });
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

test('headings render as plain styled text (no # marker in the editor) and round-trip cleanly', async ({ browser }) => {
	const dm = await loginDM(browser);
	const id = await createCampaign(dm.request);
	await dm.page.goto(`/c/${id}`);
	await dm.page.waitForSelector('.mdx-host .ProseMirror');
	const pm = dm.page.locator('.mdx-host .ProseMirror');
	await pm.click();
	await dm.page.keyboard.type('# One\n\n## Two\n\n### Three\n\nBody.\n');
	await dm.page.waitForTimeout(400);

	// headings exist at the right levels and show only the plain text (no `#`)
	await expect(pm.locator('h1')).toHaveText('One');
	await expect(pm.locator('h2')).toHaveText('Two');
	await expect(pm.locator('h3')).toHaveText('Three');
	// no `#` anywhere in the editor, and no decorative hash widget
	await expect(pm.locator('text=# One')).toHaveCount(0);
	await expect(pm.locator('.dhc-hash')).toHaveCount(0);

	// different levels get different styling (font size scales down)
	const h1size = await pm.locator('h1').evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
	const h3size = await pm.locator('h3').evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
	expect(h1size).toBeGreaterThan(h3size);

	// stored markdown keeps the hashes (single prefix, no doubling/escaping)
	await dm.page.waitForTimeout(900); // debounced save
	const res = await dm.request.get(`/c/${id}/export`, { headers: { Origin: ORIGIN } });
	const json = JSON.parse(await res.text());
	const docContent = (json.documents?.[0]?.content as string) ?? (json.content as string) ?? '';
	expect(docContent).not.toContain('<!--id:');
	expect(docContent).not.toContain('\\#');
	const headingLines = docContent.split('\n').filter((l: string) => /^#{1,6} /.test(l));
	expect(headingLines).toEqual(['# One', '## Two', '### Three']);
});

test('typing ## then space creates a clean H2 (no # shown, stored with ##)', async ({ browser }) => {
	const dm = await loginDM(browser);
	const id = await createCampaign(dm.request);
	await dm.page.goto(`/c/${id}`);
	await dm.page.waitForSelector('.mdx-host .ProseMirror');
	const pm = dm.page.locator('.mdx-host .ProseMirror');
	await pm.click();
	await dm.page.keyboard.type('##');
	await dm.page.keyboard.press(' ');
	await dm.page.keyboard.type('Room');
	await expect(pm.locator('h2')).toHaveText('Room');
	await dm.page.waitForTimeout(900);
	const res = await dm.request.get(`/c/${id}/export`, { headers: { Origin: ORIGIN } });
	const json = JSON.parse(await res.text());
	const docContent = (json.documents?.[0]?.content as string) ?? '';
	expect(docContent.trim()).toBe('## Room');
});

test('backspacing an empty heading downgrades it to a paragraph', async ({ browser }) => {
	const dm = await loginDM(browser);
	const id = await createCampaign(dm.request);
	await dm.page.goto(`/c/${id}`);
	await dm.page.waitForSelector('.mdx-host .ProseMirror');
	const pm = dm.page.locator('.mdx-host .ProseMirror');
	await pm.click();
	await dm.page.keyboard.type('#');
	await dm.page.keyboard.press(' ');
	await expect(pm.locator('h1')).toHaveText('');
	// backspace the empty heading: downgrades to a paragraph
	await dm.page.keyboard.press('Backspace');
	await expect(pm.locator('h1,h2,h3,h4,h5,h6')).toHaveCount(0);
});
