import { expect, test, type Browser, type APIRequestContext } from '@playwright/test';
const ORIGIN = 'http://localhost:4173';
async function createCampaign(request: APIRequestContext): Promise<string> {
	const res = await request.post('/?/create', { form: { title: 'HS' }, maxRedirects: 0, headers: { Origin: ORIGIN } });
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
test('hash next to text, controls inside heading', async ({ browser }) => {
	const dm = await loginDM(browser);
	const id = await createCampaign(dm.request);
	await dm.page.goto(`/c/${id}`);
	await dm.page.waitForSelector('.mdx-host .ProseMirror');
	await dm.page.locator('.mdx-host .ProseMirror').click();
	await dm.page.keyboard.type('# Main Section\n\nBody text.\n');
	await dm.page.locator('.mdx-host .ProseMirror h1 .dm-heading-controls').waitFor({ timeout: 8000 });
	await dm.page.waitForTimeout(400);
	const info = await dm.page.locator('.mdx-host .ProseMirror h1').first().evaluate((h1) => {
		const hash = h1.querySelector('.dhc-hash') as HTMLElement | null;
		const ctrl = h1.querySelector('.dm-heading-controls') as HTMLElement | null;
		const hashR = hash ? hash.getBoundingClientRect() : null;
		const ctrlR = ctrl ? ctrl.getBoundingClientRect() : null;
		// x of the heading's own text (a direct text node containing 'Main')
		let textX = -1;
		const walker = document.createTreeWalker(h1, NodeFilter.SHOW_TEXT, {
			acceptNode: (n) => (n.nodeValue && n.nodeValue.includes('Main') ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT)
		});
		const t = walker.nextNode();
		if (t) { const r = document.createRange(); r.selectNodeContents(t); textX = r.getBoundingClientRect().left; }
		return {
			h1html: h1.outerHTML.slice(0, 300),
			hashInH1: !!hash, ctrlInH1: !!ctrl,
			hashText: hash ? hash.textContent : null,
			hashRight: hashR ? hashR.right : -1, textX,
			ctrlRight: ctrlR ? ctrlR.right : -1,
			hashNextToText: hashR ? hashR.right <= textX + 20 : false,
			ctrlBeforeHash: ctrlR ? ctrlR.right <= hashR!.left + 5 : false
		};
	});
	console.log('ORDER', JSON.stringify(info, null, 0));
	expect(info.hashInH1).toBe(true);
	expect(info.ctrlInH1).toBe(true);
	expect(info.hashText).toBe('# ');
	expect(info.hashNextToText).toBe(true);
	expect(info.ctrlBeforeHash).toBe(true);
});
