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

test('typing # stays literal text (no auto-conversion to a heading)', async ({ browser }) => {
	const dm = await loginDM(browser);
	const id = await createCampaign(dm.request);
	await dm.page.goto(`/c/${id}`);
	await dm.page.waitForSelector('.mdx-host .ProseMirror');
	const pm = dm.page.locator('.mdx-host .ProseMirror');
	await pm.click();
	// typing '# ' + more must NOT turn into a heading
	await dm.page.keyboard.type('# Room');
	await expect(pm.locator('h1,h2,h3,h4,h5,h6')).toHaveCount(0);
	// the '#' stays on screen as plain paragraph text
	await expect(pm.locator('p').first()).toContainText('# Room');
	await dm.page.waitForTimeout(900);
	const res = await dm.request.get(`/c/${id}/export`, { headers: { Origin: ORIGIN } });
	const json = JSON.parse(await res.text());
	expect((json.documents?.[0]?.content as string) ?? '').toContain('# Room');
});

test('the / slash menu still creates styled headings that round-trip with hashes', async ({ browser }) => {
	const dm = await loginDM(browser);
	const id = await createCampaign(dm.request);
	await dm.page.goto(`/c/${id}`);
	await dm.page.waitForSelector('.mdx-host .ProseMirror');
	const pm = dm.page.locator('.mdx-host .ProseMirror');
	await pm.click();
	// type '/' at the block start to open the slash menu, then pick H2
	await dm.page.keyboard.type('/');
	await dm.page.waitForSelector('.dnd-slash-h2');
	await dm.page.click('.dnd-slash-h2');
	await dm.page.keyboard.type('Room');
	await expect(pm.locator('h2')).toHaveText('Room');
	await dm.page.waitForTimeout(900);
	const res = await dm.request.get(`/c/${id}/export`, { headers: { Origin: ORIGIN } });
	const json = JSON.parse(await res.text());
	const content = (json.documents?.[0]?.content as string) ?? '';
	expect(content.trim()).toBe('## Room');
});
