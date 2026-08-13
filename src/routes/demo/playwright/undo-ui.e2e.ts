import { expect, test } from '@playwright/test';

const PASSCODE = 'test-passcode';

test('undo toast: DM clears persisted rolls and restores them via Undo', async ({ browser }) => {
	const anon = await browser.newContext();
	const res = await anon.request.post('/?/create', {
		form: { title: 'Undo Test' },
		maxRedirects: 0,
		headers: { Origin: 'http://localhost:4173' }
	});
	const loc = res.headers()['location'] ?? '';
	const id = (loc || ((await res.json()) as { location: string }).location).split('/').pop()!;

	// login DM
	const dmCtx = await browser.newContext();
	const dmPage = await dmCtx.newPage();
	await dmPage.goto('/login');
	await dmPage.fill('input[name=passcode]', PASSCODE);
	await dmPage.click('button[type=submit]');
	await dmPage.waitForURL('/');
	const cookieHeader = (await dmCtx.cookies()).map((c) => `${c.name}=${c.value}`).join('; ');

	// create a roll via API BEFORE opening the page (persisted history)
	await dmCtx.request.post(`/c/${id}/roll`, {
		data: { expression: '1d20', label: 'PERSIST-ROLL' },
		headers: { cookie: cookieHeader }
	});

	// open DM notes page — the roll loads from the snapshot
	await dmPage.goto(`/c/${id}`);
	await expect(dmPage.locator('.roll-log .roll')).toHaveCount(1);

	// Clear wipes it and shows the undo toast
	await dmPage.locator('.roll-log .clear').click();
	await expect(dmPage.locator('.roll-log .roll')).toHaveCount(0);
	const undoBar = dmPage.locator('.roll-log .undo');
	await expect(undoBar).toBeVisible();
	await expect(undoBar).toContainText('Undo');

	// Undo brings the roll back
	await undoBar.locator('button').click();
	await expect(dmPage.locator('.roll-log .roll')).toHaveCount(1);
	await expect(dmPage.locator('.roll-log .roll')).toContainText('PERSIST-ROLL');

	await dmCtx.close();
	await anon.close();
});
