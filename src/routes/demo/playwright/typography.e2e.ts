import { test, expect } from '@playwright/test';

test('typography switcher cycles fonts and sizes', async ({ page }) => {
	await page.goto('/');
	await page.waitForSelector('.type-switch');

	// default = standard size
	const sizeBtn = page.locator('.type-switch .size');
	await expect(sizeBtn).toContainText('M');

	const fontBtn = page.locator('.type-switch .t-btn:not(.size)');
	await expect(fontBtn).toContainText('Serif');

	// cycle fonts: Serif -> Sans -> Classic -> Plain
	await fontBtn.click();
	await expect(fontBtn).toContainText('Sans');
	await expect(page.locator('html')).toHaveAttribute('data-type', 'modern');

	await fontBtn.click();
	await expect(page.locator('html')).toHaveAttribute('data-type', 'classic');

	await fontBtn.click();
	await expect(page.locator('html')).toHaveAttribute('data-type', 'plain');

	// cycle sizes: M -> L -> S
	await sizeBtn.click();
	await expect(page.locator('html')).toHaveAttribute('data-size', 'large');
	const largeBase = await page.evaluate(() =>
		getComputedStyle(document.documentElement).getPropertyValue('--text-base').trim()
	);
	await sizeBtn.click();
	await expect(page.locator('html')).toHaveAttribute('data-size', 'compact');
	await sizeBtn.click();
	await expect(page.locator('html')).toHaveAttribute('data-size', 'standard');

	// persisted to localStorage
	const stored = await page.evaluate(() => ({
		type: localStorage.getItem('dnd-type'),
		size: localStorage.getItem('dnd-size')
	}));
	expect(stored.type).toBe('plain');
	expect(stored.size).toBe('standard');
	expect(largeBase).toBe('1.5rem');
});
