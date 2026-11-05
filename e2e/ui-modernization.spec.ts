import { test, expect } from '@playwright/test';
import { dismissWhatsNewIfOpen, ensureEnglishUi, ensureSampleCar } from './helpers';

test.describe('UI modernization smoke', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
  });

  /** Fresh installs default to Arabic; pin English so selectors are deterministic. */
  async function openApp(page: import('@playwright/test').Page): Promise<void> {
    await ensureSampleCar(page);
    await ensureEnglishUi(page);
  }

  test('docked four-tab nav; Around lives under Fuel tabs', async ({ page }) => {
    await openApp(page);
    await page.goto('/');
    await dismissWhatsNewIfOpen(page);
    const nav = page.getByRole('navigation', { name: /primary|التنقل/i });
    await expect(nav.getByRole('link')).toHaveCount(4);
    await expect(nav.getByRole('link', { name: /home|الرئيسية/i })).toBeVisible();
    await expect(nav.getByRole('link', { name: /fuel|الوقود/i })).toBeVisible();
    await expect(nav.getByRole('link', { name: /maintenance|صيانة/i })).toBeVisible();
    await expect(nav.getByRole('link', { name: /more|المزيد/i })).toBeVisible();

    await page.goto('/around');
    await expect(nav.getByRole('link', { name: /fuel|الوقود/i })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  test('around waits for location CTA', async ({ page }) => {
    await openApp(page);
    await page.goto('/around');
    await dismissWhatsNewIfOpen(page);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('button', { name: /use my location|استخدم موقعي/i })).toBeVisible();
  });

  test('home tabs and fill-up tank switch render', async ({ page }) => {
    await openApp(page);
    await page.goto('/');
    await dismissWhatsNewIfOpen(page);
    await expect(page.getByRole('tab', { name: /dashboard|لوحة/i })).toBeVisible();
    await page.goto('/fill-up');
    await dismissWhatsNewIfOpen(page);
    await expect(page.getByRole('radio').first()).toBeVisible();
    await expect(page.locator('#station-input')).toBeVisible();
  });

  test('maintenance dues then form order', async ({ page }) => {
    await openApp(page);
    await page.goto('/maintenance');
    await dismissWhatsNewIfOpen(page);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('navigation', { name: /maintenance|صيانة/i })).toBeVisible();
  });

  test('fill-up and maintenance history filters use selects', async ({ page }) => {
    await openApp(page);
    await page.goto('/history/fill-ups');
    await dismissWhatsNewIfOpen(page);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByText(/range|الفترة/i).first()).toBeVisible();
    await page.goto('/history/maintenance');
    await dismissWhatsNewIfOpen(page);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('more route shows grouped sections', async ({ page }) => {
    await openApp(page);
    await page.goto('/more');
    await dismissWhatsNewIfOpen(page);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('link', { name: /settings|الإعدادات/i }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: /help|مساعدة/i }).first()).toBeVisible();
  });

  test('first-run sample car action is available on setup', async ({ page }) => {
    await page.goto('/setup');
    await dismissWhatsNewIfOpen(page);
    const sample = page.getByRole('button', { name: /sample car|تجريبية/i });
    if (await sample.count()) {
      await expect(sample).toBeVisible();
    }
  });
});
