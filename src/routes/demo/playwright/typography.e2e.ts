import { test, expect } from '@playwright/test';

test('typography switcher cycles fonts and sizes', async ({ page }) => {
	await page.goto('/');
	await page.waitForSelector('.type-switch');

	// default = standard size
	const sizeBtn = page.locator('.type-switch .size');
	await expect(sizeBtn).toContainText('M');

	const fontBtn = page.locator('.type-switch .t-btn:not(.size)');
	await expect(fontBtn).toContainText('Literata');

	// cycle serifs then sans/plain: Literata -> Garamond -> Source -> Lora -> Crimson -> Sans -> Plain
	await fontBtn.click();
	await expect(fontBtn).toContainText('Garamond');
	await expect(page.locator('html')).toHaveAttribute('data-type', 'garamond');

	await fontBtn.click();
	await expect(page.locator('html')).toHaveAttribute('data-type', 'source');

	await fontBtn.click();
	await expect(page.locator('html')).toHaveAttribute('data-type', 'lora');

	await fontBtn.click();
	await expect(page.locator('html')).toHaveAttribute('data-type', 'crimson');

	await fontBtn.click();
	await expect(page.locator('html')).toHaveAttribute('data-type', 'modern');

	await fontBtn.click();
	await expect(page.locator('html')).toHaveAttribute('data-type', 'plain');

	// confirm the serif body actually applies
	const garamondBody = await page.evaluate(() => {
		document.documentElement.dataset.type = 'garamond';
		return getComputedStyle(document.documentElement).getPropertyValue('--font-body').trim();
	});
	expect(garamondBody).toContain('EB Garamond');

	// cycle sizes: M -> L -> S
	await sizeBtn.click();
	await expect(page.locator('html')).toHaveAttribute('data-size', 'large');
	const largeRoot = await page.evaluate(() =>
		getComputedStyle(document.documentElement).getPropertyValue('--type-root').trim()
	);
	await sizeBtn.click();
	await expect(page.locator('html')).toHaveAttribute('data-size', 'compact');
	await sizeBtn.click();
	await expect(page.locator('html')).toHaveAttribute('data-size', 'standard');

	// serif preset also drives headings + UI font, not just body
	// currently on 'plain' (index 6): click twice to reach garamond (index 1)
	await fontBtn.click();
	await fontBtn.click();
	const serif = await page.evaluate(() => ({
		type: document.documentElement.dataset.type,
		display: getComputedStyle(document.documentElement).getPropertyValue('--font-display').trim(),
		ui: getComputedStyle(document.documentElement).getPropertyValue('--font-ui').trim()
	}));
	expect(serif.type).toBe('garamond');
	expect(serif.display).toContain('EB Garamond');
	expect(serif.ui).toContain('EB Garamond');
	await fontBtn.click(); // -> source

	// persisted to localStorage
	const stored = await page.evaluate(() => ({
		type: localStorage.getItem('dnd-type'),
		size: localStorage.getItem('dnd-size')
	}));
	expect(stored.type).toBe('source');
	expect(stored.size).toBe('standard');
	expect(largeRoot).toBe('17.5px');
});
