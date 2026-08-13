import { expect, test, type Browser } from '@playwright/test';

const PASSCODE = 'test-passcode';

async function createCampaign(request: import('@playwright/test').APIRequestContext): Promise<string> {
	const res = await request.post('/?/create', {
		form: { title: 'Combat Extra Campaign' },
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

test('combat: DM sets conditions, attacks (logged), and applies damage to a token', async ({
	browser
}) => {
	const anon = await browser.newContext();
	const id = await createCampaign(anon.request);
	await anon.close();

	const { dm, page } = await loginDM(browser);
	await page.goto(`/c/${id}/combat`);

	// add an enemy to the board
	await page.locator('.add-enemy input[placeholder="Enemy name"]').fill('Goblin');
	await page.locator('.add-enemy input[placeholder="HP"]').fill('12');
	await page.click('.add-enemy button[type=submit]');
	const token = page.locator('.board-wrap .token').filter({ hasText: 'Goblin' });
	await expect(token).toBeVisible({ timeout: 10000 });

	// select it with the HP tool -> popover opens
	await page.click('button:has-text("💔 HP")');
	await token.click();
	const pop = page.locator('.hp-pop');
	await expect(pop).toBeVisible({ timeout: 5000 });

	// set a condition via a chip and save it
	await pop.locator('.chips button', { hasText: 'Prone' }).click();
	await pop.locator('.crow button:has-text("Save")').click();
	await expect(page.locator('.board-wrap .token .cond', { hasText: 'Prone' })).toBeVisible({
		timeout: 5000
	});
	const units = (await (
		await dm.request.get(`/c/${id}/combat/units`)
	).json()) as { conditions: string; hp: number }[];
	const goblin = units.find((u) => (u as unknown as { name: string }).name === 'Goblin')!;
	expect((goblin as unknown as { conditions: string }).conditions).toContain('Prone');

	// attack -> logged to the combat log
	await pop.locator('.row button:has-text("⚔ Attack")').click();
	await expect(page.locator('.clog .row').first()).toContainText('Goblin attacks', {
		timeout: 5000
	});

	// damage -> applies to HP (1d6, so hp drops below the 12 max)
	await pop.locator('.dice').fill('1d6');
	await pop.locator('.row button:has-text("💥 Damage")').click();
	await page.waitForTimeout(600);
	const after = (await (
		await dm.request.get(`/c/${id}/combat/units`)
	).json()) as { name: string; hp: number }[];
	const gobAfter = after.find((u) => u.name === 'Goblin')!;
	expect(gobAfter.hp).toBeGreaterThanOrEqual(6);
	expect(gobAfter.hp).toBeLessThan(12);

	await dm.close();
});
