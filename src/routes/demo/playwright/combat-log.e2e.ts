import { test, expect } from '@playwright/test';
const ORIGIN = 'http://localhost:4173';
const PASSCODE = 'test-passcode';

async function createCampaign(request: any) {
	const res = await request.post('/?/create', {
		form: { title: 'CombatLog' },
		maxRedirects: 0,
		headers: { Origin: ORIGIN }
	});
	const loc = res.headers()['location'] ?? (await res.json()).location;
	return loc.split('/').pop();
}

test('combat: HP apply marks a unit down, combat log is live, next skips the dead', async ({
	request,
	browser
}) => {
	const id = await createCampaign(request);
	await request.post('/login', { headers: { Origin: ORIGIN }, form: { passcode: PASSCODE } });
	const st = await request.storageState();
	const dmCookie = st.cookies.map((c: any) => `${c.name}=${c.value}`).join('; ');
	const dm = { Origin: ORIGIN, Cookie: dmCookie };

	// a player character + an enemy on the board
	await request.post(`/c/${id}/characters`, { headers: dm, data: { name: 'Aria', speed: 30, max_hp: 20 } });
	const chars = await (await request.get(`/c/${id}/characters`, { headers: dm })).json();
	const ch = chars.find((x: any) => x.name === 'Aria');
	await request.post(`/c/${id}/combat/units`, { headers: dm, data: { action: 'add-player', character_id: ch.id } });
	await request.post(`/c/${id}/combat/units`, { headers: dm, data: { action: 'add-enemy', name: 'Goblin', max_hp: 7 } });

	await request.post(`/c/${id}/initiative`, { headers: dm, data: { action: 'roll' } });
	const units0 = await (await request.get(`/c/${id}/combat/units`, { headers: dm })).json();
	const aria = units0.find((x: any) => x.name === 'Aria');
	const goblin = units0.find((x: any) => x.name === 'Goblin');

	// open a player portal and connect its SSE before applying damage
	const pctx = await browser.newContext();
	await pctx.addCookies([{ name: 'dnd_player', value: ch.id, domain: 'localhost', path: '/' }]);
	const page = await pctx.newPage();
	await page.goto(`/p/${ch.link_token}/combat`);
	await page.waitForSelector('.token .dot');
	await page.waitForTimeout(700); // SSE connect

	// DM takes Aria down to 0 HP via the board HP endpoint
	const hpRes = await request.post(`/c/${id}/combat/units/${aria.id}`, {
		headers: dm,
		data: { action: 'hp', hp: 0 }
	});
	expect(hpRes.status()).toBe(200);
	const hpBody = await hpRes.json();
	expect(hpBody.alive).toBe(0);

	// unit is now alive=0
	const units1 = await (await request.get(`/c/${id}/combat/units`, { headers: dm })).json();
	expect(units1.find((x: any) => x.id === aria.id).alive).toBe(0);

	// combat log entry reaches the open player page live
	await expect(page.locator('.clog .feed .row').first()).toContainText('Aria is down');

	// healing brings it back to alive=1
	await request.post(`/c/${id}/combat/units/${aria.id}`, { headers: dm, data: { action: 'hp', hp: 10 } });
	const units2 = await (await request.get(`/c/${id}/combat/units`, { headers: dm })).json();
	expect(units2.find((x: any) => x.id === aria.id).alive).toBe(1);

	// now down Aria again, and verify 'next' skips the dead goblin or aria appropriately
	await request.post(`/c/${id}/combat/units/${aria.id}`, { headers: dm, data: { action: 'hp', hp: 0 } });
	// make the DEAD aria the active combatant so 'next' must skip her
	let entries = await (await request.get(`/c/${id}/initiative`, { headers: dm })).json();
	const ariaEntry = entries.find((e: any) => e.unit_id === aria.id);
	await request.post(`/c/${id}/initiative/${ariaEntry.id}`, { headers: dm, data: { action: 'update', active: true } });
	// advance 'next': it must skip the downed aria and land on a LIVE combatant (goblin)
	await request.post(`/c/${id}/initiative`, { headers: dm, data: { action: 'next' } });
	const ent1 = await (await request.get(`/c/${id}/initiative`, { headers: dm })).json();
	const active1 = ent1.find((e: any) => e.active === 1);
	expect(active1.unit_id).toBe(goblin.id);

	await pctx.close();
});
