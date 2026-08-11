import { expect, test, type Browser } from '@playwright/test';
const PASSCODE = 'test-passcode';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==','base64');
async function createCampaign(request: import('@playwright/test').APIRequestContext): Promise<string> {
  const res = await request.post('/?/create', { form: { title: 'Map Escape' }, maxRedirects: 0, headers: { Origin: 'http://localhost:4173' } });
  const loc = res.headers()['location'] ?? '';
  if (loc) return loc.split('/').pop() as string;
  return ((await res.json()) as { location?: string }).location!.split('/').pop() as string;
}
async function loginDM(browser: Browser) {
  const dm = await browser.newContext(); const page = await dm.newPage();
  await page.goto('/login'); await page.fill('input[name=passcode]', PASSCODE); await page.click('button[type=submit]');
  await expect(page).toHaveURL('/'); return { dm, page };
}
test('escaped map id (\\_) parses in editor and renders in player', async ({ browser }) => {
  const anon = await browser.newContext();
  const id = await createCampaign(anon.request);
  const { dm, page } = await loginDM(browser);
  // upload a map via API to get a real id, then force the escaped underscore form in content
  const ck = (await dm.cookies()).map(c => `${c.name}=${c.value}`).join('; ');
  const up = await page.request.post(`/c/${id}/maps`, {
    headers: { Cookie: ck, Origin: 'http://localhost:4173' },
    multipart: { file: { name: 'm.png', mimeType: 'image/png', buffer: PNG }, width: '10', height: '10' }
  });
  const map = await up.json();
  const escapedId = map.id.replace(/_/g, '\\_');
  const content = `# Main <!--id:aaa111-->\n\n::map{id=${escapedId}}\n`;
  await page.request.post(`/c/${id}/content`, { headers: { Cookie: ck }, data: { content, rev: 0 } });

  // DM editor must recognize the escaped directive as a map widget
  await page.goto(`/c/${id}`);
  const editor = page.locator('.mdx-host .ProseMirror');
  await expect(editor).toBeVisible({ timeout: 10000 });
  await expect(page.locator('.mdx-host .map-widget')).toBeVisible({ timeout: 10000 });

  // player must render the map (not the literal directive)
  await page.request.post(`/c/${id}/share`, { headers: { Cookie: ck }, data: { headingId: 'aaa111', state: 1 } });
  const player = await browser.newPage();
  await player.goto(`/c/${id}/play`);
  await player.waitForTimeout(1200);
  await expect(player.locator('.map-embed')).toHaveCount(1, { timeout: 10000 });
  await expect(player.locator('.map-embed[data-map-id]')).not.toHaveAttribute('data-map-id', /\\/);
  await expect(player.getByText(/::map\{id=/)).toHaveCount(0);
  await anon.close(); await dm.close(); await player.close();
});
