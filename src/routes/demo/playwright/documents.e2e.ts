import { expect, test, type Browser } from '@playwright/test';

const PASSCODE = 'test-passcode';

async function createCampaign(request: import('@playwright/test').APIRequestContext): Promise<string> {
	const res = await request.post('/?/create', {
		form: { title: 'Docs Campaign' },
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

test('document management: create, rename, share, switch, delete', async ({ browser }) => {
	const anon = await browser.newContext();
	const id = await createCampaign(anon.request);
	const { dm, page } = await loginDM(browser);

	await page.goto(`/c/${id}`);
	await expect(page.locator('.mdx-host .ProseMirror')).toBeVisible({ timeout: 10000 });
	// one seeded document, named after the campaign
	await expect(page.locator('.doc-list .doc')).toHaveCount(1);
	await expect(page.locator('.doc-list .doc-name')).toContainText('Docs Campaign');

	// create a second document via +
	await page.locator('.docs-head .add').click();
	await page.waitForURL(`**?doc=**`);
	await expect(page.locator('.doc-list .doc')).toHaveCount(2);

	// rename via the title input
	await page.locator('.title-btn').click();
	await page.locator('.title-input').fill('Quest Log');
	await page.locator('.title-input').press('Enter');
	await expect(page.locator('.title-btn')).toHaveText('Quest Log');
	await expect(page.locator('.doc-list .doc-name', { hasText: 'Quest Log' })).toBeVisible();

	// type into the new doc and save
	const editor = page.locator('.mdx-host .ProseMirror');
	await editor.click();
	await page.keyboard.type('# Step 1');
	await expect(page.locator('.save-state')).toContainText('Saved', { timeout: 5000 });

	// share the doc -> toggle shows 👁/shared
	const shareBtn = page.locator('.doc-list .doc', { hasText: 'Quest Log' }).locator('.share');
	await shareBtn.click();
	await expect(shareBtn).toHaveText('👁');

	// switch back to the seeded doc via the list
	await page.locator('.doc-list .doc-name', { hasText: 'Docs Campaign' }).click();
	await page.waitForURL(`**?doc=**`);
	await expect(editor).toContainText('');

	// delete the renamed doc
	const del = page.locator('.doc-list .doc', { hasText: 'Quest Log' }).locator('.del');
	page.on('dialog', (d) => d.accept());
	await del.click();
	await expect(page.locator('.doc-list .doc', { hasText: 'Quest Log' })).toHaveCount(0);

	await anon.close();
	await dm.close();
});
