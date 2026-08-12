import { expect, test, type Browser } from '@playwright/test';

const PASSCODE = 'test-passcode';

async function createCampaign(request: import('@playwright/test').APIRequestContext): Promise<string> {
	const res = await request.post('/?/create', {
		form: { title: 'Hierarchy Campaign' },
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

test('show/hide is hierarchical: hiding a heading hides everything below it', async ({ browser }) => {
	const anon = await browser.newContext();
	const id = await createCampaign(anon.request);
	const { dm, page } = await loginDM(browser);

	await page.goto(`/c/${id}`);
	const editor = page.locator('.mdx-host .ProseMirror');
	await expect(editor).toBeVisible({ timeout: 10000 });
	await editor.click();
	await page.keyboard.type('# Parent');
	await page.keyboard.press('Enter');
	await page.keyboard.type('## Child');
	await page.keyboard.press('Enter');
	await page.keyboard.type('Child body');
	await page.keyboard.press('Enter');
	await page.keyboard.press('Enter');
	await page.keyboard.type('# Sibling');
	await expect(page.getByText('Saved')).toBeVisible({ timeout: 5000 });

	const player = await browser.newPage();
	await player.goto(`/c/${id}/play`);
	await player.waitForTimeout(900);
	const rendered = player.locator('.rendered');

	// nothing shared yet -> empty state
	await expect(player.getByText("The DM hasn't shared anything yet")).toBeVisible();

	// reveal Parent (top control = first). Player should now see Parent AND Child (hierarchical).
	const controls = editor.locator('.dm-heading-controls');
	const parentControls = controls.nth(0);
	const childControls = controls.nth(1);
	await parentControls.locator('.dhc-vis').click();
	await expect(rendered.getByText('Parent')).toBeVisible({ timeout: 10000 });
	await expect(rendered.getByText('Child', { exact: true })).toBeVisible();

	// the child's own toggle reflects the inherited visibility (🙈 = visible)
	await expect(childControls.locator('.dhc-vis')).toHaveText('🙈');

	// hide Parent -> everything below (Child) hides too, back to empty state
	await parentControls.locator('.dhc-vis').click();
	await expect(player.getByText("The DM hasn't shared anything yet")).toBeVisible({ timeout: 10000 });
	await expect(childControls.locator('.dhc-vis')).toHaveText('👁');

	// reveal Parent again -> Child reappears live
	await parentControls.locator('.dhc-vis').click();
	await expect(rendered.getByText('Child', { exact: true })).toBeVisible({ timeout: 10000 });

	await anon.close();
	await dm.close();
	await player.close();
});
