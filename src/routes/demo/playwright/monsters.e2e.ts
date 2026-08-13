import { test, expect } from '@playwright/test';
const ORIGIN = 'http://localhost:4173';
const PASSCODE = 'test-passcode';

async function createCampaign(request: any) {
	const res = await request.post('/?/create', {
		form: { title: 'Monsters' },
		maxRedirects: 0,
		headers: { Origin: ORIGIN }
	});
	const loc = res.headers()['location'] ?? (await res.json()).location;
	return loc.split('/').pop();
}

test('monsters: add a template, spawn an encounter from it, and edit it', async ({ request }) => {
	const id = await createCampaign(request);
	await request.post('/login', { headers: { Origin: ORIGIN }, form: { passcode: PASSCODE } });
	const st = await request.storageState();
	const dm = { Origin: ORIGIN, Cookie: st.cookies.map((c: any) => `${c.name}=${c.value}`).join('; ') };

	// create a monster template
	const m = await (
		await request.post(`/c/${id}/monsters`, {
			headers: dm,
			data: { name: 'Goblin', speed: 30, init_bonus: 2, max_hp: 7, color: '#a33' }
		})
	).json();
	expect(m.id).toBeTruthy();
	expect(m.hp).toBe(7);

	// listMonsters returns it
	const list = await (await request.get(`/c/${id}/monsters`, { headers: dm })).json();
	expect(list.find((x: any) => x.name === 'Goblin').max_hp).toBe(7);

	// spawn 3 goblins via the encounter action
	const spawn = await request.post(`/c/${id}/combat/units`, {
		headers: dm,
		data: { action: 'add-monster', monster_id: m.id, count: 3 }
	});
	expect(spawn.status()).toBe(200);
	const units = await (await request.get(`/c/${id}/combat/units`, { headers: dm })).json();
	const goblins = units.filter((u: any) => u.kind === 'enemy');
	expect(goblins.length).toBe(3);
	expect(goblins.every((g: any) => g.max_hp === 7 && g.hp === 7 && g.speed === 30 && g.init_bonus === 2)).toBe(
		true
	);

	// update the template
	const up = await request.post(`/c/${id}/monsters/${m.id}`, {
		headers: dm,
		data: { action: 'update', max_hp: 9 }
	});
	expect(up.status()).toBe(200);
	const upBody = await up.json();
	expect(upBody.max_hp).toBe(9);

	// delete it
	const del = await request.post(`/c/${id}/monsters/${m.id}`, {
		headers: dm,
		data: { action: 'delete' }
	});
	expect(del.status()).toBe(200);
	const list2 = await (await request.get(`/c/${id}/monsters`, { headers: dm })).json();
	expect(list2.length).toBe(0);
});
