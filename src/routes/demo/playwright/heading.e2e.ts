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

test('typing # renders the hash as editable text, re-derives level, and round-trips cleanly', async ({ browser }) => {
	const dm = await loginDM(browser);
	const id = await createCampaign(dm.request);
	await dm.page.goto(`/c/${id}`);
	await dm.page.waitForSelector('.mdx-host .ProseMirror');
	const pm = dm.page.locator('.mdx-host .ProseMirror');
	await pm.click();
	// type several heading levels in quick succession
	await dm.page.keyboard.type('# One\n\n## Two\n\n### Three\n\nBody.\n');
	await dm.page.waitForTimeout(400);

	// 1. native headings at the right levels, and the `#` markers are visible as
	//    real editable text (not a decorative widget)
	await expect(pm.locator('h1')).toHaveText('# One');
	await expect(pm.locator('h2')).toHaveText('## Two');
	await expect(pm.locator('h3')).toHaveText('### Three');
	// no decorative hash widget — the hashes are actual text
	await expect(pm.locator('.dhc-hash')).toHaveCount(0);

	// 2. editing the hashes re-derives the level: Home + add '#' deepens H1 -> H2
	await pm.locator('h1').click();
	await dm.page.keyboard.press('Home');
	await dm.page.keyboard.type('#');
	await expect(pm.locator('h1')).toHaveCount(0);
	await expect(pm.locator('h2').first()).toHaveText('## One');

	// 3. clean round-trip: each heading serializes to a single hash prefix (no `# # ` doubling)
	await dm.page.waitForTimeout(900); // debounced save
	const res = await dm.request.get(`/c/${id}/export`, { headers: { Origin: ORIGIN } });
	const json = JSON.parse(await res.text());
	const docContent = (json.documents?.[0]?.content as string) ?? (json.content as string) ?? '';
	expect(docContent).not.toContain('<!--id:');
	expect(docContent).not.toContain('\\#');
	const headingLines = docContent.split('\n').filter((l: string) => /^#{1,6} /.test(l));
	expect(headingLines).toEqual(['## One', '## Two', '### Three']);
});

test('typing ## then space creates a clean H2 (no extra hashes)', async ({ browser }) => {
	const dm = await loginDM(browser);
	const id = await createCampaign(dm.request);
	await dm.page.goto(`/c/${id}`);
	await dm.page.waitForSelector('.mdx-host .ProseMirror');
	const pm = dm.page.locator('.mdx-host .ProseMirror');
	await pm.click();
	await dm.page.keyboard.type('##');
	await dm.page.keyboard.press(' ');
	await dm.page.keyboard.type('Room');
	await expect(pm.locator('h2')).toHaveText('## Room');
	// no extra hashes inserted
	expect(await pm.locator('h2').textContent()).not.toContain('####');
	await dm.page.waitForTimeout(900);
	const res = await dm.request.get(`/c/${id}/export`, { headers: { Origin: ORIGIN } });
	const json = JSON.parse(await res.text());
	const docContent = (json.documents?.[0]?.content as string) ?? '';
	expect(docContent.trim()).toBe('## Room');
});

test('backspacing a lone # removes it (heading downgrades to paragraph)', async ({ browser }) => {
	const dm = await loginDM(browser);
	const id = await createCampaign(dm.request);
	await dm.page.goto(`/c/${id}`);
	await dm.page.waitForSelector('.mdx-host .ProseMirror');
	const pm = dm.page.locator('.mdx-host .ProseMirror');
	await pm.click();
	await dm.page.keyboard.type('#');
	await dm.page.keyboard.press(' ');
	await expect(pm.locator('h1')).toHaveText('#');
	// backspace twice: remove the hash, then the empty heading downgrades
	await dm.page.keyboard.press('Backspace');
	await dm.page.keyboard.press('Backspace');
	await expect(pm.locator('h1,h2,h3,h4,h5,h6')).toHaveCount(0);
});
