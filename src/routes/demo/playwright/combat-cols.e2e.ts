import { test, expect, type Browser, type APIRequestContext } from '@playwright/test';
const ORIGIN = 'http://localhost:4173';

async function createCampaign(request: APIRequestContext): Promise<string> {
	const res = await request.post('/?/create', {
		form: { title: 'Cols' },
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

test('combat: initiative left, board center, combat log right', async ({ browser }) => {
	const dm = await loginDM(browser);
	const id = await createCampaign(dm.request);
	await dm.page.goto(`/c/${id}/combat`);
	const left = await dm.page.locator('.rail.left').boundingBox();
	const center = await dm.page.locator('.col').boundingBox();
	const right = await dm.page.locator('.rail.right').boundingBox();
	expect(left).toBeTruthy();
	expect(center).toBeTruthy();
	expect(right).toBeTruthy();
	// left sidebar is left of center, right sidebar is right of center
	expect(left!.x).toBeLessThan(center!.x);
	expect(right!.x).toBeGreaterThan(center!.x + center!.width / 2);
});
