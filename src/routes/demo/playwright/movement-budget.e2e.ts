import { test, expect } from '@playwright/test';
const ORIGIN = 'http://localhost:4173';
const PASSCODE = 'test-passcode';

async function createCampaign(request: import('@playwright/test').APIRequestContext): Promise<string> {
	const res = await request.post('/?/create', {
		form: { title: 'Budget' },
		maxRedirects: 0,
		headers: { Origin: ORIGIN }
	});
	const loc = res.headers()['location'] ?? '';
	if (loc) return loc.split('/').pop() as string;
	const body = (await res.json()) as { location?: string };
	return (body.location ?? '').split('/').pop() as string;
}

async function loginDM(request: import('@playwright/test').APIRequestContext): Promise<string> {
	await request.post('/login', { headers: { Origin: ORIGIN }, form: { passcode: PASSCODE } });
	const st = await request.storageState();
	return st.cookies.map((c: any) => `${c.name}=${c.value}`).join('; ');
}

async function advanceToActive(
	request: import('@playwright/test').APIRequestContext,
	id: string,
	dm: Record<string, string>,
	unitId: string
) {
	let entries = await (await request.get(`/c/${id}/initiative`, { headers: dm })).json();
	let active = entries.find((e: any) => e.active);
	let guard = 0;
	while ((!active || active.unit_id !== unitId) && guard++ < 10) {
		await request.post(`/c/${id}/initiative`, { headers: dm, data: { action: 'next' } });
		entries = await (await request.get(`/c/${id}/initiative`, { headers: dm })).json();
		active = entries.find((e: any) => e.active);
	}
	expect(active?.unit_id).toBe(unitId);
}

test('player movement budget is enforced even when a DM session is present (player portal in DM browser)', async ({
	request
}) => {
	const id = await createCampaign(request);
	const dmCookie = await loginDM(request);
	const dm = { Origin: ORIGIN, Cookie: dmCookie };
	await request.post(`/c/${id}/characters`, { headers: dm, data: { name: 'Aria', speed: 30 } });
	const units0 = await (await request.get(`/c/${id}/characters`, { headers: dm })).json();
	const ch = units0.find((x: any) => x.name === 'Aria');
	expect(ch).toBeTruthy();
	const units = await (await request.get(`/c/${id}/combat/units`, { headers: dm })).json();
	const playerUnit = units.find((u: any) => u.character_id === ch.id);
	expect(playerUnit).toBeTruthy();
	await request.post(`/c/${id}/initiative`, { headers: dm, data: { action: 'roll' } });
	await advanceToActive(request, id, dm, playerUnit.id);

	// acting through the player portal while ALSO holding a DM cookie must still respect the budget
	const both = { Origin: ORIGIN, Cookie: `dnd_player=${ch.id}; ${dmCookie}` };
	const statuses: number[] = [];
	for (let i = 1; i <= 9; i++) {
		const res = await request.post(`/c/${id}/combat/units/${playerUnit.id}`, {
			headers: both,
			data: { action: 'move', x: playerUnit.x + i, y: playerUnit.y }
		});
		statuses.push(res.status());
	}
	expect(statuses.filter((s) => s === 200).length).toBe(6);
	expect(statuses.filter((s) => s === 409).length).toBe(3);
});

test('DM can move any token freely (override) without a player cookie', async ({ request }) => {
	const id = await createCampaign(request);
	const dmCookie = await loginDM(request);
	const dm = { Origin: ORIGIN, Cookie: dmCookie };
	await request.post(`/c/${id}/characters`, { headers: dm, data: { name: 'Brutus', speed: 30 } });
	const chars = await (await request.get(`/c/${id}/characters`, { headers: dm })).json();
	const ch = chars.find((x: any) => x.name === 'Brutus');
	const units = await (await request.get(`/c/${id}/combat/units`, { headers: dm })).json();
	const u = units.find((x: any) => x.character_id === ch.id);
	// DM-only cookie (no player cookie): a big leap across the whole board is allowed
	const res = await request.post(`/c/${id}/combat/units/${u.id}`, {
		headers: dm,
		data: { action: 'move', x: 20, y: 15 }
	});
	expect(res.status()).toBe(200);
});
