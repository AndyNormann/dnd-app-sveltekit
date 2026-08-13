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

test('hovering anywhere in a section wraps that whole section in a box', async ({ browser }) => {
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
	const box = dm.page.locator('.mdx-host .section-box');

	// hovering the top heading highlights the whole top-level section (h1+p+p+h2+p)
	await pm.locator('h1').first().hover();
	await dm.page.waitForTimeout(250);
	expect(await hl()).toBe(5);

	// a single box overlay wraps the whole highlighted section (heading top -> last block bottom)
	await expect(box).toBeVisible({ timeout: 3000 });
	// the quick fade-in should have completed, leaving the box opaque and actually painted on top
	await dm.page.waitForTimeout(300);
	const boxOp = await box.evaluate((el) => getComputedStyle(el).opacity);
	expect(parseFloat(boxOp)).toBeGreaterThan(0.9);
	const bb = await box.boundingBox();
	const h1b = await pm.locator('h1').first().boundingBox();
	const lastb = await pm.locator('text=Sub body').boundingBox();
	expect(bb).toBeTruthy();
	expect(bb!.width).toBeGreaterThan(200);
	expect(bb!.y).toBeLessThanOrEqual((h1b?.y ?? Infinity) + 2);
	expect(bb!.y + bb!.height).toBeGreaterThanOrEqual((lastb?.y ?? 0) + (lastb?.height ?? 0) - 2);

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

test('box stays glued to the section while the editor scrolls', async ({ browser }) => {
	const dm = await loginDM(browser);
	const id = await createCampaign(dm.request);
	await dm.page.goto(`/c/${id}`);
	const pm = dm.page.locator('.mdx-host .ProseMirror');
	await expect(pm).toBeVisible({ timeout: 10000 });
	await pm.click();
	// enough content that the editor can actually scroll
	let body = '';
	for (let i = 1; i <= 12; i++) body += `# Section ${i}\nBody ${i}.\n\n`;
	await dm.page.keyboard.type(body);
	await dm.page.waitForTimeout(700);

	// highlight a mid-section and confirm the box covers its heading
	const h = pm.locator('h1').nth(5);
	await h.scrollIntoViewIfNeeded();
	await h.hover();
	await dm.page.waitForTimeout(250);
	const box = dm.page.locator('.mdx-host .section-box');
	await expect(box).toBeVisible({ timeout: 3000 });
	const before = await box.boundingBox();
	const hb = await h.boundingBox();
	expect(before).toBeTruthy();
	const pad = before!.y - hb!.y; // the box's padding above the heading
	expect(Math.abs(pad)).toBeLessThanOrEqual(12);

	// scroll the editor container down, then re-hover the same heading
	await dm.page.evaluate(() => {
		const host = document.querySelector('.mdx-host') as HTMLElement;
		host.scrollTop = Math.min(host.scrollHeight, host.scrollTop + 250);
	});
	await dm.page.waitForTimeout(120);
	await h.scrollIntoViewIfNeeded();
	await h.hover();
	await dm.page.waitForTimeout(250);
	const after = await box.boundingBox();
	const hb2 = await h.boundingBox();
	expect(after).toBeTruthy();
	// the same padding must hold at the new scroll offset — the box stayed glued
	expect(Math.abs(after!.y - hb2!.y - pad)).toBeLessThanOrEqual(3);
});

test('hovering the gap between lines keeps the highlighted section (does not jump to caret)', async ({
	browser
}) => {
	const dm = await loginDM(browser);
	const id = await createCampaign(dm.request);
	await dm.page.goto(`/c/${id}`);
	const pm = dm.page.locator('.mdx-host .ProseMirror');
	await expect(pm).toBeVisible({ timeout: 10000 });
	await pm.click();
	await dm.page.keyboard.type(
		'# Section One\nPara A.\nMore A.\n# Section Two\nPara B.\n'
	);
	await dm.page.waitForTimeout(700);
	const hl = () => pm.locator('.section-hl').count();

	// put the caret in section one
	await pm.locator('h1').first().click();
	await dm.page.waitForTimeout(250);
	expect(await hl()).toBe(3); // h1 + 2 paras = caret highlights section one

	// hover over a block in section two -> section two highlights
	await pm.locator('text=Para B.').hover();
	await dm.page.waitForTimeout(250);
	expect(await hl()).toBe(2);

	// move the pointer into the gap between the two paragraphs of section two.
	// compute a point in the empty space between 'More A.' and 'Para B.'
	const gap = await dm.page.evaluate(() => {
		const more = [...document.querySelectorAll('.mdx-host .ProseMirror p')].find(
			(el) => (el.textContent ?? '').trim() === 'More A.'
		) as HTMLElement;
		const paraB = [...document.querySelectorAll('.mdx-host .ProseMirror p')].find(
			(el) => (el.textContent ?? '').trim() === 'Para B.'
		) as HTMLElement;
		const a = more.getBoundingClientRect();
		const b = paraB.getBoundingClientRect();
		return { x: (a.left + a.right) / 2, y: (a.bottom + b.top) / 2 };
	});
	await dm.page.mouse.move(gap.x, gap.y);
	await dm.page.waitForTimeout(300);

	// the gap is still within section two -> it must keep section two highlighted,
	// NOT jump back to the caret's section one
	expect(await hl()).toBe(2);
});
