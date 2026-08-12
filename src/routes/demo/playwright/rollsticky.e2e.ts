import { expect, test, type Browser, type APIRequestContext } from '@playwright/test';
const ORIGIN = 'http://localhost:4173';

async function createCampaign(request: APIRequestContext): Promise<string> {
	const res = await request.post('/?/create', {
		form: { title: 'Roll Sticky Probe' },
		maxRedirects: 0,
		headers: { Origin: ORIGIN }
	});
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
	return { page, request: ctx.request, ctx };
}
test('roll input stays docked at the visible bottom on both notes pages', async ({ browser }) => {
	const dm = await loginDM(browser);
	const id = await createCampaign(dm.request);
	const body = Array.from({ length: 30 }, (_, i) => `# Heading ${i}\n\nParagraph text.\n\n`).join('');
	const saved = (await (
		await dm.request.post(`/c/${id}/content`, { headers: { Origin: ORIGIN }, data: { content: body } })
	).json()) as { content: string };
	const ids = [...saved.content.matchAll(/<!--id:([A-Za-z0-9_-]+)-->/g)].map((m) => m[1]);
	for (const hid of ids) {
		await dm.request.post(`/c/${id}/share`, { headers: { Origin: ORIGIN }, data: { headingId: hid, state: 1 } });
	}

	// DM page: scroll body down, input should still be at the visible bottom
	await dm.page.goto(`/c/${id}`);
	await dm.page.waitForSelector('.rail.rolls .input');
	await dm.page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
	await dm.page.waitForTimeout(150);
	const dmBottom = await dm.page.locator('.rail.rolls .input').evaluate((el) => {
		const r = el.getBoundingClientRect();
		return { bottom: r.bottom, vh: window.innerHeight };
	});
	expect(dmBottom.bottom).toBeGreaterThan(dmBottom.vh - 10);
	expect(dmBottom.bottom).toBeLessThanOrEqual(dmBottom.vh + 1);
	await dm.ctx.close();

	// Player page: same check
	const player = await browser.newPage();
	await player.goto(`/c/${id}/play`);
	await player.waitForSelector('.rail.rolls .input');
	await player.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
	await player.waitForTimeout(150);
	const plBottom = await player.locator('.rail.rolls .input').evaluate((el) => {
		const r = el.getBoundingClientRect();
		return { bottom: r.bottom, vh: window.innerHeight };
	});
	expect(plBottom.bottom).toBeGreaterThan(plBottom.vh - 10);
	expect(plBottom.bottom).toBeLessThanOrEqual(plBottom.vh + 1);
	await player.close();
});
