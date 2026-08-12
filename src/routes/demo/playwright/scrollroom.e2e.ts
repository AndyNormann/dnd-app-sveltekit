import { expect, test, type Browser, type APIRequestContext } from '@playwright/test';
const ORIGIN = 'http://localhost:4173';

async function createCampaign(request: APIRequestContext): Promise<string> {
	const res = await request.post('/?/create', {
		form: { title: 'Scroll Room Probe' },
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

test('notes pages let you scroll past the last content', async ({ browser }) => {
	const dm = await loginDM(browser);
	const id = await createCampaign(dm.request);
	const body = Array.from({ length: 20 }, (_, i) => `# Heading ${i}\n\nParagraph ${i} text.`).join('\n\n');
	const saved = (await (
		await dm.request.post(`/c/${id}/content`, { headers: { Origin: ORIGIN }, data: { content: body } })
	).json()) as { content: string };
	const ids = [...saved.content.matchAll(/<!--id:([A-Za-z0-9_-]+)-->/g)].map((m) => m[1]);
	for (const hid of ids) {
		await dm.request.post(`/c/${id}/share`, {
			headers: { Origin: ORIGIN },
			data: { headingId: hid, state: 1 }
		});
	}

	// --- DM editor: the pane scrolls internally; after scrolling it to the very
	// bottom the last text should sit above the pane's bottom edge (scroll room). ---
	await dm.page.goto(`/c/${id}`);
	await dm.page.waitForSelector('.pane.source');
	const dmGap = await dm.page.locator('.pane.source').evaluate((pane) => {
		pane.scrollTop = pane.scrollHeight;
		const last = pane.querySelector('.ProseMirror > :last-child');
		const pb = parseFloat(getComputedStyle(pane).paddingBottom) || 0;
		const contentBottom = last ? last.getBoundingClientRect().bottom - pane.getBoundingClientRect().top : 0;
		// room between the last content and the pane's content-box bottom
		const room = pane.clientHeight - pb - contentBottom + (pane.scrollTop > 0 ? pane.scrollHeight - pane.scrollTop - pane.clientHeight : 0);
		return { room, sh: pane.scrollHeight, ch: pane.clientHeight, scrollTop: pane.scrollTop };
	});
	// enough room below the last text to keep scrolling
	expect(dmGap.room).toBeGreaterThan(120);

	// --- player reading view ---
	const player = await browser.newPage();
	await player.goto(`/c/${id}/play`);
	await player.waitForSelector('main .rendered');
	await player.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
	await player.waitForTimeout(250);
	const plGap = await player
		.locator('main .rendered')
		.last()
		.evaluate((el) => {
			const rect = el.getBoundingClientRect();
			const room = window.innerHeight - rect.bottom;
			const extra = document.body.scrollHeight - (window.scrollY + window.innerHeight);
			return { room, extra, bottom: rect.bottom, inner: window.innerHeight };
		});
	expect(plGap.room).toBeGreaterThan(plGap.inner * 0.2);
	await player.close();

	await dm.ctx.close();
});
