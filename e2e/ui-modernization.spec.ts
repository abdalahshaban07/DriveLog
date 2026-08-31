import { test, expect } from '@playwright/test';

test.describe('UI modernization smoke', () => {
  test('home tabs and fill-up tank fallback render', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/');
    await expect(page.getByRole('tab', { name: /dashboard|لوحة/i })).toBeVisible();
    await page.getByRole('link', { name: /fill-up|تعبئة/i }).first().click();
    await expect(page.getByLabel(/tank visual|عرض التنك/i)).toBeVisible();
  });

  test('maintenance and more routes load', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/maintenance');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.goto('/more');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });
});
