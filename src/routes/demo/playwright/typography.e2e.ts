import { test, expect } from '@playwright/test';

test('typography is fixed: system-ui chrome, Source Serif 4 editor prose', async ({ page }) => {
	await page.goto('/');
	const def = await page.evaluate(() => {
		const rs = getComputedStyle(document.documentElement);
		return {
			display: rs.getPropertyValue('--font-display').trim(),
			body: rs.getPropertyValue('--font-body').trim(),
			ui: rs.getPropertyValue('--font-ui').trim(),
			root: rs.getPropertyValue('font-size').trim()
		};
	});
	expect(def.display).toContain('system-ui');
	expect(def.ui).toContain('system-ui');
	expect(def.body).toContain('Source Serif 4');
	expect(def.root).toBe('16px');
	// no TypeSwitcher remains
	await expect(page.locator('.type-switch')).toHaveCount(0);
	// body chrome uses sans, editor prose uses serif
	const bodyFont = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
	expect(bodyFont).toContain('Source Serif 4');
});
