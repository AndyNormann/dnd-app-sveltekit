import { expect, test, type Browser, type APIRequestContext } from '@playwright/test';
const ORIGIN = 'http://localhost:4173';
async function createCampaign(request: APIRequestContext): Promise<string> {
	const res = await request.post('/?/create', { form: { title: 'Wiki Probe' }, maxRedirects: 0, headers: { Origin: ORIGIN } });
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

test('typing [[ opens a wiki-link autocomplete and Enter completes the link', async ({ browser }) => {
	const dm = await loginDM(browser);
	const id = await createCampaign(dm.request);
	await dm.page.goto(`/c/${id}`);
	await dm.page.waitForSelector('.mdx-host .ProseMirror');
	const pm = dm.page.locator('.mdx-host .ProseMirror');
	await pm.click();
	await dm.page.keyboard.type('[[');
	// the popup appears listing the campaign's documents
	await expect(dm.page.locator('.dnd-wiki-pop')).toBeVisible();
	const itemCount = await dm.page.locator('.dnd-wiki-item').count();
	expect(itemCount).toBeGreaterThan(0);
	// Enter accepts the top suggestion and completes the [[link]]
	await dm.page.keyboard.press('Enter');
	await expect(dm.page.locator('.dnd-wiki-pop')).toBeHidden();
	await expect(pm.locator('.wiki-dec')).toHaveCount(1);
	await dm.page.waitForTimeout(900);
	// the stored markdown contains a closed [[...]] link
	const res = await dm.request.get(`/c/${id}/export`, { headers: { Origin: ORIGIN } });
	const json = JSON.parse(await res.text());
	const content = (json.documents?.[0]?.content as string) ?? '';
	expect(content).toMatch(/\[\[[^\]]+\]\]/);
});
