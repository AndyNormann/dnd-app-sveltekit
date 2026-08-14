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
test('roll input stays docked at the visible bottom on the DM notes page', async ({ browser }) => {
	const dm = await loginDM(browser);
	const id = await createCampaign(dm.request);
	// write to the campaign's first document
	const list = await dm.request.get(`/c/${id}/documents`, { headers: { Origin: ORIGIN } });
	const { documents } = (await list.json()) as { documents: { id: string }[] };
	const docId = documents[0].id;
	const body = Array.from({ length: 30 }, (_, i) => `# Heading ${i}\n\nParagraph text.\n\n`).join('');
	await dm.request.post(`/c/${id}/documents/${docId}/content`, {
		headers: { Origin: ORIGIN },
		data: { content: body }
	});

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
});
