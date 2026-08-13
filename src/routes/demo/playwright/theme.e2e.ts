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

test('indigo-on-obsidian theme: dark backgrounds, light text, indigo accents', async ({ browser }) => {
	const { page, request } = await loginDM(browser);
	// base is dark with light text
	const home = await page.evaluate(() => ({
		bg: getComputedStyle(document.body).backgroundColor,
		text: getComputedStyle(document.body).color,
		accent: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()
	}));
	expect(lum(home.bg)).toBeLessThan(80);
	expect(lum(home.text)).toBeGreaterThan(180);
	expect(home.accent).toBe('#6f8ff5'); // indigo default

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
