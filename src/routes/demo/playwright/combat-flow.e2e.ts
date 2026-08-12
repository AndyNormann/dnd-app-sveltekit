import { expect, test, type Browser, type APIRequestContext, type Page } from '@playwright/test';

const ORIGIN = 'http://localhost:4173';

async function createCampaign(request: APIRequestContext): Promise<string> {
	const res = await request.post('/?/create', {
		form: { title: 'Combat Flow Campaign' },
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

test('combat: characters -> links -> board -> initiative -> movement gating -> hp hiding', async ({
	browser
}) => {
	const dm = await loginDM(browser);
	const id = await createCampaign(dm.request);

	// DM creates a character via the roster UI
	await dm.page.goto(`/c/${id}/combat`);
	await dm.page.click('.bar button:has-text("Characters")');
	await dm.page.fill('.add-char input[placeholder="Character"]', 'Aria');
	await dm.page.fill('.add-char input[placeholder="Player name"]', 'Bob');
	await dm.page.fill('.add-char input[placeholder="Speed"]', '30');
	await dm.page.fill('.add-char input[placeholder="Init+"]', '2');
	await dm.page.fill('.add-char input[placeholder="Max HP"]', '20');
	await dm.page.click('.add-char button[type=submit]');
	await expect(dm.page.locator('.char-list li').first().getByText('Aria')).toBeVisible();

	// fetch the character to get its secret link
	const chars = (await (await dm.request.get(`/c/${id}/characters`)).json()) as Array<{
		id: string;
		link_token: string;
		name: string;
		hp: number;
		max_hp: number;
	}>;
	const aria = chars.find((c) => c.name === 'Aria');
	expect(aria).toBeTruthy();

	// player opens their link -> portal loads, cookie set
	const playerCtx = await browser.newContext();
	const player = await playerCtx.newPage();
	await player.goto(`/p/${aria!.link_token}/combat`);
	await expect(player.locator('.you')).toHaveText('Aria');
	await expect(player.locator('.combat .board')).toBeVisible({ timeout: 10000 });

	// DM adds Aria to the board and an enemy
	await dm.page.locator('.char-list li').first().locator('button[title="Add to board"]').click();
	await expect(dm.page.locator('.board .token').filter({ hasText: 'Aria' })).toBeVisible();
	await dm.page.fill('.add-enemy input[placeholder="Enemy name"]', 'Goblin');
	await dm.page.fill('.add-enemy input[placeholder="Init+"]', '1');
	await dm.page.fill('.add-enemy input[placeholder="HP"]', '7');
	await dm.page.click('.add-enemy button[type=submit]');
	await expect(dm.page.locator('.board .token').filter({ hasText: 'Goblin' })).toBeVisible();

	// roll initiative
	await dm.page.click('button:has-text("Roll initiative")');
	await expect(dm.page.locator('.order .initiative .entry').first()).toBeVisible({ timeout: 10000 });

	// advance turns until Aria is active (deterministic movement test)
	const activeUnit = await activeUnitId(dm.request, id);
	const playerUnit = await playerUnitId(dm.request, id);
	let guard = 0;
	while (activeUnit !== playerUnit && guard++ < 20) {
		await dm.request.post(`/c/${id}/initiative`, { data: { action: 'next' } });
	}
	// enemy token move as the player must be rejected
	const enemy = await firstEnemyUnit(dm.request, id);
	const enemyMove = await playerCtx.request.post(`/c/${id}/combat/units/${enemy.id}`, {
		data: { action: 'move', x: 3, y: 3 }
	});
	expect(enemyMove.status()).toBe(401);

	// own token move as the player when it's their turn succeeds (within budget)
	const ownMove = await playerCtx.request.post(`/c/${id}/combat/units/${playerUnit}`, {
		data: { action: 'move', x: 2, y: 14 }
	});
	expect(ownMove.status()).toBe(200);

	// player cannot exceed the remaining budget (server-enforced): Aria moved 2 cells,
	// so a big leap must be rejected with 409
	const over = await playerCtx.request.post(`/c/${id}/combat/units/${playerUnit}`, {
		data: { action: 'move', x: 2, y: 3 }
	});
	expect(over.status()).toBe(409);

	// DM can move any token freely
	const dmMove = await dm.request.post(`/c/${id}/combat/units/${playerUnit}`, {
		data: { action: 'move', x: 2, y: 2 }
	});
	expect(dmMove.status()).toBe(200);

	// player sees own hp but NOT enemy hp in the turn order
	await player.waitForTimeout(800);
	await expect(player.locator('.order .initiative').getByText(/20\/20/)).toBeVisible();
	// goblin hp (7) must not appear for the player
	await expect(player.locator('.order .initiative').getByText(/\/7/)).toHaveCount(0);

	await dm.ctx.close();
	await playerCtx.close();
});

async function activeUnitId(request: APIRequestContext, id: string): Promise<string | null> {
	const entries = (await (await request.get(`/c/${id}/initiative`)).json()) as Array<{
		active: number;
		unit_id: string | null;
	}>;
	return entries.find((e) => e.active === 1)?.unit_id ?? null;
}

async function playerUnitId(request: APIRequestContext, id: string): Promise<string | null> {
	const units = (await (await request.get(`/c/${id}/combat/units`)).json()) as Array<{
		kind: string;
		id: string;
	}>;
	return units.find((u) => u.kind === 'player')?.id ?? null;
}

async function firstEnemyUnit(request: APIRequestContext, id: string): Promise<{ id: string }> {
	const units = (await (await request.get(`/c/${id}/combat/units`)).json()) as Array<{
		kind: string;
		id: string;
	}>;
	return units.find((u) => u.kind === 'enemy') ?? { id: '' };
}
