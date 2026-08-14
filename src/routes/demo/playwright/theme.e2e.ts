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

test('war-table theme: dark oak page, parchment editor with dark ink', async ({ browser }) => {
	const { page, request } = await loginDM(browser);
	// the page is the dark oak table with warm light chrome text
	const home = await page.evaluate(() => ({
		bg: getComputedStyle(document.body).backgroundColor,
		text: getComputedStyle(document.body).color,
		paper: getComputedStyle(document.documentElement).getPropertyValue('--paper').trim(),
		paperInk: getComputedStyle(document.documentElement).getPropertyValue('--paper-ink').trim()
	}));
	expect(lum(home.bg)).toBeLessThan(80); // oak table is dark
	expect(lum(home.text)).toBeGreaterThan(180); // chrome text is warm light
	expect(home.paper).toBeTruthy();
	expect(home.paperInk).toBeTruthy();

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
	// create an H1 via the slash menu (auto `# ` conversion is disabled)
	await page.keyboard.type('/');
	await page.waitForSelector('.dnd-slash-h1');
	await page.click('.dnd-slash-h1');
	await page.keyboard.type('Section One');
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
	expect(lum(dump.pageBg)).toBeLessThan(80); // oak page stays dark
	expect(lum(dump.editorBg)).toBeGreaterThan(170); // the editor is cream parchment
	expect(lum(dump.text)).toBeLessThan(120); // ink is dark on the paper
	expect(lum(dump.heading)).toBeLessThan(120); // headings are dark ink too
});
