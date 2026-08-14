import { test, expect, type Browser, type APIRequestContext } from '@playwright/test';
const ORIGIN = 'http://localhost:4173';

async function createCampaign(request: APIRequestContext): Promise<string> {
	const res = await request.post('/?/create', {
		form: { title: 'Roster Page' },
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

test('roster: characters and monsters are managed on the Roster page, reached via the tab', async ({
	browser
}) => {
	const dm = await loginDM(browser);
	const id = await createCampaign(dm.request);

	// the Roster tab is on the Combat page
	await dm.page.goto(`/c/${id}/combat`);
	const rosterLink = dm.page.locator('.tabs a', { hasText: 'Roster' });
	await expect(rosterLink).toBeVisible();
	await rosterLink.click();
	await expect(dm.page).toHaveURL(`/c/${id}/combat/roster`);

	// both panels render
	await expect(dm.page.locator('.roster .panel', { hasText: 'Characters' })).toBeVisible();
	await expect(dm.page.locator('.roster .panel', { hasText: 'Monsters' })).toBeVisible();

	// add a monster, it appears in the list
	await dm.page.locator('.roster .panel', { hasText: 'Monsters' }).locator('input[placeholder="Monster name"]').fill('Orc');
	await dm.page.locator('.roster .panel', { hasText: 'Monsters' }).locator('input[placeholder="Max HP"]').fill('15');
	await dm.page.locator('.roster .panel', { hasText: 'Monsters' }).locator('button[type=submit]').click();
	await expect(dm.page.locator('.roster .panel', { hasText: 'Monsters' }).locator('.char-list li').first()).toContainText('Orc');

	// edit the monster (max HP) and save
	const monsterPanel = dm.page.locator('.roster .panel', { hasText: 'Monsters' });
	await monsterPanel.locator('button[title="Edit"]').click();
	await monsterPanel.locator('input[placeholder="Max HP"]').fill('22');
	await monsterPanel.locator('button:has-text("Save")').click();
	await expect(monsterPanel).toContainText('22hp');

	// add a character, appears in the characters list
	const charPanel = dm.page.locator('.roster .panel', { hasText: 'Characters' });
	await charPanel.locator('input[placeholder="Character"]').fill('Lena');
	await charPanel.locator('button[type=submit]').click();
	await expect(charPanel.locator('.char-list li').first()).toContainText('Lena');

	// the new character is always on the board (auto-added on creation)
	await dm.page.goto(`/c/${id}/combat`);
	await expect(dm.page.locator('.board .token').filter({ hasText: 'Lena' })).toBeVisible({ timeout: 10000 });
});
