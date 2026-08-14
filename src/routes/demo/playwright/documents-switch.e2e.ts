import { expect, test, type Browser } from '@playwright/test';

const PASSCODE = 'test-passcode';

async function createCampaign(request: import('@playwright/test').APIRequestContext): Promise<string> {
	const res = await request.post('/?/create', {
		form: { title: 'Switch Campaign' },
		maxRedirects: 0,
		headers: { Origin: 'http://localhost:4173' }
	});
	const loc = res.headers()['location'] ?? '';
	if (loc) return loc.split('/').pop() as string;
	const body = (await res.json()) as { location?: string };
	return (body.location ?? '').split('/').pop() as string;
}

async function loginDM(browser: Browser) {
	const dm = await browser.newContext();
	const page = await dm.newPage();
	await page.goto('/login');
	await page.fill('input[name=passcode]', PASSCODE);
	await page.click('button[type=submit]');
	await expect(page).toHaveURL('/');
	const cookieHeader = (await dm.cookies()).map((c) => `${c.name}=${c.value}`).join('; ');
	return { dm, page, cookieHeader };
}

test('switching documents loads each document own content (no shared editor state)', async ({ browser }) => {
	const anon = await browser.newContext();
	const id = await createCampaign(anon.request);
	const { dm, page, cookieHeader } = await loginDM(browser);

	// create two documents with distinct content
	const a = await dm.request.post(`/c/${id}/documents`, { headers: { cookie: cookieHeader }, data: { title: 'Doc A' } });
	const aId = (await a.json()).id as string;
	const b = await dm.request.post(`/c/${id}/documents`, { headers: { cookie: cookieHeader }, data: { title: 'Doc B' } });
	const bId = (await b.json()).id as string;
	await dm.request.post(`/c/${id}/documents/${aId}/content`, {
		headers: { cookie: cookieHeader },
		data: { content: '# AAA only\n\nAlpha content.' }
	});
	await dm.request.post(`/c/${id}/documents/${bId}/content`, {
		headers: { cookie: cookieHeader },
		data: { content: '# BBB only\n\nBravo content.' }
	});

	const editor = page.locator('.mdx-host .ProseMirror');
	// open Doc A
	await page.goto(`/c/${id}?doc=${aId}`);
	await expect(editor).toBeVisible({ timeout: 10000 });
	await expect(editor).toContainText('Alpha content');

	// switch to Doc B via the list -> editor must show B's content, not A's
	await page.locator('.doc-list .doc-name', { hasText: 'Doc B' }).click();
	await expect(editor).toContainText('Bravo content', { timeout: 6000 });
	await expect(editor).not.toContainText('Alpha content');

	// edit B, save
	await editor.click();
	await page.keyboard.type('Edited in B. ');
	await expect(editor).toContainText('Edited in B', { timeout: 6000 });
	// wait for the debounced save, then confirm the edit persisted for B (not A)
	await page.waitForTimeout(900);
	const exp = await dm.request.get(`/c/${id}/export`, { headers: { cookie: cookieHeader } });
	const bundle = (await exp.json()) as { documents: { id: string; content: string }[] };
	const bContent = bundle.documents.find((d) => d.id === bId)!.content;
	const aContent = bundle.documents.find((d) => d.id === aId)!.content;
	expect(bContent).toContain('Edited in B');
	expect(aContent).not.toContain('Edited in B');

	// switch back to A -> A must still be its own content (not B's edit)
	await page.locator('.doc-list .doc-name', { hasText: 'Doc A' }).click();
	await expect(editor).toContainText('Alpha content', { timeout: 6000 });
	await expect(editor).not.toContainText('Edited in B');
	await expect(editor).not.toContainText('Bravo content');

	await anon.close();
	await dm.close();
});
