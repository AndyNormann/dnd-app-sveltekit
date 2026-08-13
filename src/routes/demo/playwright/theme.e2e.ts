import { test, expect, type Browser } from '@playwright/test';
const PASSCODE = 'test-passcode';

async function loginDM(browser: Browser) {
	const ctx = await browser.newContext();
	const page = await ctx.newPage();
	await page.goto('/login');
	await page.fill('input[name=passcode]', PASSCODE);
	await page.click('button[type=submit]');
	await expect(page).toHaveURL('/');
	return { page, request: ctx.request };
}

const lum = (c: string) => {
	const m = c.match(/rgba?\((\d+)/);
	return m ? +m[1] : 0;
};
const noOverlap = (a: any, b: any) => !a || !b || a.x + a.width <= b.x || b.x + b.width <= a.x;

test('dark parchment theme: dark backgrounds, light text', async ({ browser }) => {
	const { page, request } = await loginDM(browser);
	const res = await request.post('/?/create', {
		form: { title: 'Dark' },
		headers: { Origin: 'http://localhost:4173' },
		maxRedirects: 0
	});
	const loc = res.headers()['location'] ?? ((await res.json()) as any).location;
	await page.goto(loc);
	const pm = page.locator('.mdx-host .ProseMirror');
	await expect(pm).toBeVisible({ timeout: 10000 });
	await pm.click();
	await page.keyboard.type('# Section One\nBody text here.\n');
	await page.waitForTimeout(700);

	const dump = await page.evaluate(() => {
		const host = document.querySelector('.mdx-host .ProseMirror') as HTMLElement;
		const get = (el: Element | null, prop: string) =>
			el ? getComputedStyle(el).getPropertyValue(prop).trim() : '';
		return {
			pageBg: get(document.body, 'background-color'),
			editorBg: get(host?.closest('.source'), 'background-color'),
			text: get(host, 'color'),
			heading: get(host.querySelector('h1'), 'color')
		};
	});
	expect(lum(dump.pageBg)).toBeLessThan(80);
	expect(lum(dump.editorBg)).toBeLessThan(80);
	expect(lum(dump.text)).toBeGreaterThan(180);
	expect(lum(dump.heading)).toBeGreaterThan(180);
});

test('theme switcher: present, switches dark themes, no header overlap', async ({ browser }) => {
	const { page, request } = await loginDM(browser);
	const switcher = page.locator('.themes');
	await expect(switcher).toBeVisible();

	// home: switcher clear of the auth pill
	const s0 = await switcher.boundingBox();
	const auth = await page.locator('.auth').last().boundingBox();
	expect(noOverlap(s0, auth)).toBeTruthy();

	// open a campaign page
	const res = await request.post('/?/create', {
		form: { title: 'T' },
		headers: { Origin: 'http://localhost:4173' },
		maxRedirects: 0
	});
	const loc = res.headers()['location'] ?? ((await res.json()) as any).location;
	await page.goto(loc);
	await expect(switcher).toBeVisible({ timeout: 10000 });

	// each theme gives a distinct dark background and updates the active label
	const bodies: Record<string, string> = {};
	for (const lbl of ['Midnight', 'Ember', 'Forest', 'Obsidian', 'Parchment']) {
		await page.locator('.themes .dotbtn[title="' + lbl + '"]').click();
		await expect(page.locator('.themes .name')).toHaveText(lbl);
		const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
		bodies[lbl] = bg;
		expect(lum(bg)).toBeLessThan(80); // always dark
	}
	const uniq = new Set(Object.values(bodies));
	expect(uniq.size).toBe(5); // all five distinct

	// DM header: switcher clear of the Log out button
	const s = await switcher.boundingBox();
	const logout = await page.getByRole('button', { name: /log out/i }).boundingBox();
	expect(noOverlap(s, logout)).toBeTruthy();
});
