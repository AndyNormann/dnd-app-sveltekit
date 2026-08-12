import { expect, test, type Browser, type APIRequestContext } from '@playwright/test';
const ORIGIN = 'http://localhost:4173';
async function createCampaign(request: APIRequestContext): Promise<string> {
	const res = await request.post('/?/create', { form: { title: 'HP' }, maxRedirects: 0, headers: { Origin: ORIGIN } });
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
test('hash is real editable text, caret works at start of first word, clean round-trip', async ({ browser }) => {
	const dm = await loginDM(browser);
	const id = await createCampaign(dm.request);
	await dm.page.goto(`/c/${id}`);
	await dm.page.waitForSelector('.mdx-host .ProseMirror');
	const pm = dm.page.locator('.mdx-host .ProseMirror');
	await pm.click();
	await dm.page.keyboard.type('# Main Section\n\nBody text.\n');
	await dm.page.waitForTimeout(900);

	// 1. hash is real text (no locked widget) and sits next to the heading text
	const h1 = await dm.page.evaluate(() => {
		const el = document.querySelector('.mdx-host .ProseMirror h1')!;
		const hasWidget = !!el.querySelector('.dhc-hash');
		const txts = Array.from(el.childNodes)
			.filter((n) => n.nodeName === '#text')
			.map((n) => (n as Text).textContent)
			.join('');
		return { hasWidget, txts };
	});
	console.log('H1', JSON.stringify(h1));
	expect(h1.hasWidget).toBe(false);
	expect(h1.txts).toContain('# Main Section');

	// 2. place caret at the start of the first word (before 'Main') and type -> text goes there
	await dm.page.evaluate(() => {
		const h1 = document.querySelector('.mdx-host .ProseMirror h1')!;
		const sel = window.getSelection()!;
		const range = document.createRange();
		const walker = document.createTreeWalker(h1, NodeFilter.SHOW_TEXT, {
			acceptNode: (n) => (n.nodeValue && n.nodeValue.includes('Main') ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT)
		});
		const t = walker.nextNode() as Text;
		range.setStart(t, t.nodeValue!.indexOf('Main'));
		range.collapse(true);
		sel.removeAllRanges();
		sel.addRange(range);
		h1.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
		h1.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
		h1.dispatchEvent(new MouseEvent('click', { bubbles: true }));
	});
	await dm.page.keyboard.type('Hello ');
	await dm.page.waitForTimeout(1600);
	const typed = await dm.page.locator('.mdx-host .ProseMirror h1').innerText();
	console.log('TYPED', JSON.stringify(typed));
	expect(typed.replace('#', '').trim()).toContain('Hello Main');

	// 3. round-trip is clean: a single `#` prefix, not doubled
	const res = await dm.request.get(`/c/${id}/export`, { headers: { Origin: ORIGIN } });
	const json = JSON.parse(await res.text());
	console.log('CONTENT', JSON.stringify(json.content));
	const headingLine = json.content.split('\n').find((l: string) => /^#+ /.test(l));
	expect(headingLine).toMatch(/^# Hello Main/);
	expect(headingLine).not.toMatch(/^# # /);
	expect(headingLine).toContain('Hello Main');
});
