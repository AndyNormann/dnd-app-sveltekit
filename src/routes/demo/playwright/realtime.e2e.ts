import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';

const PASSCODE = 'test-passcode';

async function createCampaign(request: import('@playwright/test').APIRequestContext): Promise<string> {
	const res = await request.post('/?/create', {
		form: { title: 'E2E Campaign' },
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
	const dmPage = await dm.newPage();
	await dmPage.goto('/login');
	await dmPage.fill('input[name=passcode]', PASSCODE);
	await dmPage.click('button[type=submit]');
	await expect(dmPage).toHaveURL('/');
	const cookieHeader = (await dm.cookies()).map((c) => `${c.name}=${c.value}`).join('; ');
	return { dm, dmPage, cookieHeader };
}

async function getOrCreateDocument(
	dm: import('@playwright/test').BrowserContext,
	id: string,
	cookieHeader: string
): Promise<string> {
	const list = await dm.request.get(`/c/${id}/documents`, { headers: { cookie: cookieHeader } });
	expect(list.status()).toBe(200);
	const { documents } = (await list.json()) as { documents: { id: string }[] };
	if (documents.length > 0) return documents[0].id;
	const res = await dm.request.post(`/c/${id}/documents`, {
		data: {},
		headers: { cookie: cookieHeader }
	});
	const { id: docId } = (await res.json()) as { id: string };
	return docId;
}

async function writeDoc(dm: import('@playwright/test').BrowserContext, id: string, docId: string, markdown: string, cookieHeader: string) {
	const res = await dm.request.post(`/c/${id}/documents/${docId}/content`, {
		data: { content: markdown },
		headers: { cookie: cookieHeader }
	});
	expect(res.status()).toBe(200);
}

async function shareDoc(
	dm: import('@playwright/test').BrowserContext,
	id: string,
	docId: string,
	cookieHeader: string,
	shared = true
) {
	const res = await dm.request.post(`/c/${id}/documents/${docId}`, {
		data: { action: 'share', shared },
		headers: { cookie: cookieHeader }
	});
	expect(res.status()).toBe(200);
}

async function createPlayer(
	dm: import('@playwright/test').BrowserContext,
	id: string,
	name: string,
	cookieHeader: string
): Promise<string> {
	const res = await dm.request.post(`/c/${id}/characters`, {
		data: { name },
		headers: { cookie: cookieHeader }
	});
	expect(res.status()).toBe(200);
	const { link_token } = (await res.json()) as { link_token: string };
	return link_token;
}

async function openPortal(anon: BrowserContext, token: string): Promise<Page> {
	const page = await anon.newPage();
	await page.goto(`/p/${token}`);
	await expect(page.getByText('Playing as')).toBeVisible();
	await page.waitForTimeout(800); // let EventSource connect
	return page;
}

test('realtime: DM sharing a document reveals it live to an open player portal', async ({ browser }) => {
	const anon = await browser.newContext();
	const { dm, cookieHeader } = await loginDM(browser);
	const id = await createCampaign(dm.request);
	const docId = await getOrCreateDocument(dm, id, cookieHeader);
	await writeDoc(dm, id, docId, '# Quest Log\nShared notes here.', cookieHeader);
	const token = await createPlayer(dm, id, 'Aria', cookieHeader);

	const portal = await openPortal(anon, token);
	// document is hidden by default -> empty state
	await expect(portal.locator('.empty')).toContainText('hasn\'t shared any documents');

	// DM shares the document -> it appears live on the open portal
	await shareDoc(dm, id, docId, cookieHeader);
	await expect(portal.locator('.doc-list .doc')).toHaveCount(1);
	await expect(portal.locator('.doc-list .doc-name')).toContainText('E2E Campaign');
	await expect(portal.locator('.doc-title')).toContainText('E2E Campaign');

	await anon.close();
	await dm.close();
});

test('realtime: a DM edit reaches an open player portal and a fresh portal self-heals via snapshot', async ({
	browser
}) => {
	const anon = await browser.newContext();
	const { dm, cookieHeader } = await loginDM(browser);
	const id = await createCampaign(dm.request);
	const docId = await getOrCreateDocument(dm, id, cookieHeader);
	await writeDoc(dm, id, docId, '# Quest Log\nVersion one.', cookieHeader);
	await shareDoc(dm, id, docId, cookieHeader);
	const token = await createPlayer(dm, id, 'Aria', cookieHeader);

	// open portal shows v1
	const portal = await openPortal(anon, token);
	await expect(portal.locator('.rendered')).toContainText('Version one');

	// DM edits -> live update on the open portal
	await writeDoc(dm, id, docId, '# Quest Log\nVersion two.', cookieHeader);
	await expect(portal.locator('.rendered')).toContainText('Version two', { timeout: 6000 });

	// fresh portal gets v2 via snapshot
	const fresh = await openPortal(anon, token);
	await expect(fresh.locator('.rendered')).toContainText('Version two');

	await anon.close();
	await dm.close();
});
