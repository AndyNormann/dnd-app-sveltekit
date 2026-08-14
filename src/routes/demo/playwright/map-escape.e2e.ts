import { expect, test, type Browser } from '@playwright/test';
const PASSCODE = 'test-passcode';
const PNG = Buffer.from(
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
	'base64'
);
async function createCampaign(request: import('@playwright/test').APIRequestContext): Promise<string> {
	const res = await request.post('/?/create', {
		form: { title: 'Map Escape' },
		maxRedirects: 0,
		headers: { Origin: 'http://localhost:4173' }
	});
	const loc = res.headers()['location'] ?? '';
	if (loc) return loc.split('/').pop() as string;
	return ((await res.json()) as { location?: string }).location!.split('/').pop() as string;
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
test('escaped map id (_) parses in editor and renders in a player portal', async ({ browser }) => {
	const anon = await browser.newContext();
	const id = await createCampaign(anon.request);
	const { dm, page, cookieHeader } = await loginDM(browser);

	const docList = await dm.request.get(`/c/${id}/documents`, { headers: { cookie: cookieHeader } });
	const { documents } = (await docList.json()) as { documents: { id: string }[] };
	const docId = documents[0].id;

	// upload a map via API to get a real id, then force the escaped underscore form in content
	const up = await page.request.post(`/c/${id}/maps`, {
		headers: { Cookie: cookieHeader, Origin: 'http://localhost:4173' },
		multipart: { file: { name: 'm.png', mimeType: 'image/png', buffer: PNG }, width: '10', height: '10' }
	});
	const map = await up.json();
	const escapedId = map.id.replace(/_/g, '\\_');
	const content = `# Main\n\n::map{id=${escapedId}}\n`;
	await dm.request.post(`/c/${id}/documents/${docId}/content`, {
		headers: { cookie: cookieHeader },
		data: { content }
	});

	// DM editor must recognize the escaped directive as a map widget
	await page.goto(`/c/${id}`);
	const editor = page.locator('.mdx-host .ProseMirror');
	await expect(editor).toBeVisible({ timeout: 10000 });
	await expect(page.locator('.mdx-host .map-widget')).toBeVisible({ timeout: 10000 });

	// share the doc + create a player -> portal must render the map (not the literal directive)
	await dm.request.post(`/c/${id}/documents/${docId}`, {
		headers: { cookie: cookieHeader },
		data: { action: 'share', shared: true }
	});
	const chRes = await dm.request.post(`/c/${id}/characters`, {
		headers: { cookie: cookieHeader },
		data: { name: 'Aria' }
	});
	const { link_token } = (await chRes.json()) as { link_token: string };

	const player = await browser.newPage();
	await player.goto(`/p/${link_token}`);
	await player.waitForTimeout(1200);
	await expect(player.locator('.map-embed')).toHaveCount(1, { timeout: 10000 });
	await expect(player.locator('.map-embed[data-map-id]')).not.toHaveAttribute('data-map-id', /\\/);
	await expect(player.getByText(/::map\{id=/)).toHaveCount(0);
	await anon.close();
	await dm.close();
	await player.close();
});
