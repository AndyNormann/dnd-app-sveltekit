import { test, expect } from '@playwright/test';

async function createCampaign(request: any) {
	const res = await request.post('/?/create', {
		form: { title: `Resize ${Date.now()}` },
		headers: { origin: 'http://localhost:4173' },
		maxRedirects: 0
	});
	const loc = res.headers()['location'];
	if (loc) return loc.split('/').filter(Boolean)[1];
	const body = (await res.json()) as { location?: string };
	return body.location!.split('/').filter(Boolean)[1];
}

test('resize handles adjust the two sidebars', async ({ browser }) => {
	const dm = await browser.newContext();
	const page = await dm.newPage();
	// login DM
	await page.goto('/login');
	await page.fill('input[type=password]', 'test-passcode');
	await page.click('button[type=submit]');
	await page.waitForURL('**/');

	const id = await createCampaign(dm.request);
	await page.goto(`/c/${id}`);

	const outline = page.locator('.layout > aside.rail:not(.rolls)');
	const rolls = page.locator('.layout > .rail.rolls');
	await expect(outline).toBeVisible();
	await expect(rolls).toBeVisible();
	await page.waitForTimeout(200);

	const outlineBefore = (await outline.boundingBox())!.width;
	const rollsBefore = (await rolls.boundingBox())!.width;

	// drag the outline handle right by 100px
	const rh = page.locator('.rh-outline');
	await rh.scrollIntoViewIfNeeded();
	const hb = (await rh.boundingBox())!;
	await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
	await page.mouse.down();
	await page.mouse.move(hb.x + hb.width / 2 + 100, hb.y + hb.height / 2, { steps: 6 });
	await page.mouse.up();
	await page.waitForTimeout(150);
	const outlineAfter = (await outline.boundingBox())!.width;
	console.log('OUTLINE', outlineBefore, '->', outlineAfter);

	// drag the rolls handle left by 80px (grows rolls)
	const rhr = page.locator('.rh-rolls');
	await rhr.scrollIntoViewIfNeeded();
	const hbr = (await rhr.boundingBox())!;
	await page.mouse.move(hbr.x + hbr.width / 2, hbr.y + hbr.height / 2);
	await page.mouse.down();
	await page.mouse.move(hbr.x + hbr.width / 2 - 80, hbr.y + hbr.height / 2, { steps: 6 });
	await page.mouse.up();
	await page.waitForTimeout(150);
	const rollsAfter = (await rolls.boundingBox())!.width;
	console.log('ROLLS', rollsBefore, '->', rollsAfter);

	expect(outlineAfter).toBeGreaterThan(outlineBefore + 40);
	expect(rollsAfter).toBeGreaterThan(rollsBefore + 40);
	await dm.close();
});
