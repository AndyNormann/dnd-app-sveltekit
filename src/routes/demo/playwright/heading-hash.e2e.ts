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
test('heading hashes are real editable text, adjacent to the heading text', async ({ browser }) => {
	const dm = await loginDM(browser);
	const id = await createCampaign(dm.request);
	await dm.page.goto(`/c/${id}`);
	await dm.page.waitForSelector('.mdx-host .ProseMirror');
	const pm = dm.page.locator('.mdx-host .ProseMirror');
	await pm.click();
	await dm.page.keyboard.type('# One\n\n## Two\n\n### Three\n');
	await dm.page.waitForTimeout(900);

	const info = await dm.page.evaluate(() => {
		const read = (sel: string) => {
			const el = document.querySelector(sel);
			if (!el) return null;
			const txts = Array.from(el.childNodes)
				.filter((n) => n.nodeName === '#text')
				.map((n) => (n as Text).textContent)
				.join('');
			const hasWidget = !!el.querySelector('.dhc-hash');
			return { txts, hasWidget };
		};
		return { h1: read('.mdx-host .ProseMirror h1'), h2: read('.mdx-host .ProseMirror h2'), h3: read('.mdx-host .ProseMirror h3') };
	});
	console.log('H', JSON.stringify(info));

	// the hash is plain editable text (no locked widget), sitting right before the heading text
	expect(info.h1!.hasWidget).toBe(false);
	expect(info.h1!.txts).toContain('# One');
	expect(info.h2!.txts).toContain('## Two');
	expect(info.h3!.txts).toContain('### Three');
	// the hash is immediately adjacent to the text (no space gap beyond the markdown space)
	expect(info.h1!.txts.trim()).toBe('# One');
	expect(info.h2!.txts.trim()).toBe('## Two');
	expect(info.h3!.txts.trim()).toBe('### Three');
});
