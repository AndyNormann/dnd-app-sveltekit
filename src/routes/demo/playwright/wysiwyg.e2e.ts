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

test('WYSIWYG editor renders interactive markdown, saves, and collapse hides content', async ({
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

	// server injects a heading id -> heading gets its DM controls
	const controls = editor.locator('.dm-heading-controls');
	await expect(controls).toHaveCount(1, { timeout: 5000 });

	// collapse: hides the paragraph below the heading
	const body = editor.locator('p', { hasText: '2d6+3' });
	await expect(body).toBeVisible();
	await controls.locator('.dhc-collapse').click();
	await expect(body).toBeHidden();

	// expand again
	await controls.locator('.dhc-collapse').click();
	await expect(body).toBeVisible();

	// reload and confirm the WYSIWYG persisted the typed markdown
	await page.reload();
	await expect(editor).toBeVisible({ timeout: 10000 });
	await expect(editor).toContainText('New Section');
	await expect(editor).toContainText('2d6+3');

	await anon.close();
	await dm.close();
});
