import { expect, test, type Browser, type APIRequestContext } from '@playwright/test';
const ORIGIN = 'http://localhost:4173';
async function createCampaign(request: APIRequestContext): Promise<string> {
	const res = await request.post('/?/create', { form: { title: 'Hash Probe' }, maxRedirects: 0, headers: { Origin: ORIGIN } });
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
test('heading hashes render', async ({ browser }) => {
	const dm = await loginDM(browser);
	const id = await createCampaign(dm.request);
	await dm.page.goto(`/c/${id}`);
	await dm.page.waitForSelector('.mdx-host .ProseMirror');
	await dm.page.locator('.mdx-host .ProseMirror').click();
	await dm.page.keyboard.type('# One\n\n## Two\n\n### Three\n');
	await dm.page.waitForSelector('.dhc-hash');
	await dm.page.waitForTimeout(400);
	const hashes = await dm.page.locator('.dhc-hash').evaluateAll((els) => els.map((e) => e.textContent));
	console.log('HASHES', JSON.stringify(hashes));
	expect(hashes.filter((h) => h === '# ').length).toBeGreaterThanOrEqual(1);
	expect(hashes.filter((h) => h === '## ').length).toBeGreaterThanOrEqual(1);
	expect(hashes.filter((h) => h === '### ').length).toBeGreaterThanOrEqual(1);
});
