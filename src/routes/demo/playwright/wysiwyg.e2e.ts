import { expect, test, type Browser } from '@playwright/test';

const PASSCODE = 'test-passcode';

async function createCampaign(request: import('@playwright/test').APIRequestContext): Promise<string> {
	const res = await request.post('/?/create', {
		form: { title: 'Wysiwyg Campaign' },
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
	return { dm, page };
}

test('WYSIWYG editor renders interactive markdown, saves, and the document list shows the doc', async ({
	browser
}) => {
	const anon = await browser.newContext();
	const id = await createCampaign(anon.request);
	const { dm, page } = await loginDM(browser);

	await page.goto(`/c/${id}`);
	const editor = page.locator('.mdx-host .ProseMirror');
	await expect(editor).toBeVisible({ timeout: 10000 });
	await editor.click();
	await page.keyboard.type('# New Section');
	await page.keyboard.press('Enter');
	await page.keyboard.type('Roll 2d6+3 and see [[Tavern]]');

	await expect(editor.locator('.dice-dec')).toHaveCount(1);
	await expect(editor.locator('.wiki-dec')).toHaveCount(1);
	await expect(page.locator('.save-state')).toContainText('Saved', { timeout: 5000 });

	// the document list shows the seeded document
	await expect(page.locator('.doc-list .doc')).toHaveCount(1);
	await expect(page.locator('.doc-list .doc .doc-name')).toContainText('Wysiwyg Campaign');

	// reload and confirm the WYSIWYG persisted the typed markdown
	await page.reload();
	await expect(editor).toBeVisible({ timeout: 10000 });
	await expect(editor).toContainText('New Section');
	await expect(editor).toContainText('2d6+3');

	await anon.close();
	await dm.close();
});
