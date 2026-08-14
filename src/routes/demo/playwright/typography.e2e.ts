import { test, expect } from '@playwright/test';

test('typography defaults to Source + Large and cycles fonts/sizes', async ({ page }) => {
	await page.goto('/');
	await page.waitForSelector('.type-switch');

	// default = Source Serif 4 font, Large size
	await expect(page.locator('html')).toHaveAttribute('data-type', 'source');
	await expect(page.locator('html')).toHaveAttribute('data-size', 'large');
	await expect(page.locator('.type-switch .t-btn:not(.size)')).toContainText('Source');
	await expect(page.locator('.type-switch .size')).toContainText('L');

	// default serif drives headings + body + UI
	const def = await page.evaluate(() => ({
		display: getComputedStyle(document.documentElement).getPropertyValue('--font-display').trim(),
		body: getComputedStyle(document.documentElement).getPropertyValue('--font-body').trim(),
		ui: getComputedStyle(document.documentElement).getPropertyValue('--font-ui').trim(),
		root: getComputedStyle(document.documentElement).getPropertyValue('font-size').trim()
	}));
	expect(def.display).toContain('Source Serif 4');
	expect(def.body).toContain('Source Serif 4');
	expect(def.ui).toContain('Source Serif 4');
	expect(def.root).toBe('17.5px');

	// cycle sizes: large(2) -> compact -> standard -> large
	const sizeBtn = page.locator('.type-switch .size');
	await sizeBtn.click();
	await expect(page.locator('html')).toHaveAttribute('data-size', 'compact');
	const compactRoot = await page.evaluate(() =>
		getComputedStyle(document.documentElement).getPropertyValue('--type-root').trim()
	);
	await sizeBtn.click();
	await expect(page.locator('html')).toHaveAttribute('data-size', 'standard');
	await sizeBtn.click();
	await expect(page.locator('html')).toHaveAttribute('data-size', 'large');

	// cycle fonts from source(2): lora -> crimson -> modern -> plain -> literata -> garamond
	const fontBtn = page.locator('.type-switch .t-btn:not(.size)');
	await fontBtn.click();
	await expect(page.locator('html')).toHaveAttribute('data-type', 'lora');
	await fontBtn.click();
	await expect(page.locator('html')).toHaveAttribute('data-type', 'crimson');
	await fontBtn.click();
	await expect(page.locator('html')).toHaveAttribute('data-type', 'modern');
	await fontBtn.click();
	await expect(page.locator('html')).toHaveAttribute('data-type', 'plain');
	await fontBtn.click();
	await expect(page.locator('html')).toHaveAttribute('data-type', 'literata');
	await fontBtn.click();
	await expect(page.locator('html')).toHaveAttribute('data-type', 'garamond');

	// garamond drives all three
	const g = await page.evaluate(() => ({
		display: getComputedStyle(document.documentElement).getPropertyValue('--font-display').trim(),
		ui: getComputedStyle(document.documentElement).getPropertyValue('--font-ui').trim()
	}));
	expect(g.display).toContain('EB Garamond');
	expect(g.ui).toContain('EB Garamond');

	// persisted
	const stored = await page.evaluate(() => ({
		type: localStorage.getItem('dnd-type'),
		size: localStorage.getItem('dnd-size')
	}));
	expect(stored.type).toBe('garamond');
	expect(stored.size).toBe('large');
	expect(compactRoot).toBe('15px');
});
