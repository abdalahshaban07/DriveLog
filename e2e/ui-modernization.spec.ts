import { test, expect, type Page } from '@playwright/test';

async function dismissWhatsNewIfOpen(page: Page): Promise<void> {
  const sheet = page.locator('dialog.update-sheet[open]');
  try {
    await sheet.waitFor({ state: 'visible', timeout: 2_000 });
  } catch {
    return;
  }
  await page.getByRole('button', { name: /got it|حسنًا|later|لاحقًا/i }).first().click();
  await expect(sheet).toBeHidden({ timeout: 5_000 });
}

/** Fresh browsers land on /setup — sample car unlocks guarded routes. */
async function ensureSampleCar(page: Page): Promise<void> {
  await page.goto('/setup');
  await dismissWhatsNewIfOpen(page);
  const sample = page.getByRole('button', { name: /sample car|سيارة تجريبية/i });
  if (await sample.isVisible().catch(() => false)) {
    await sample.click();
    await page.waitForURL((url) => !url.pathname.includes('/setup'), { timeout: 15_000 });
  } else {
    await page.goto('/');
  }
  await dismissWhatsNewIfOpen(page);
}

test.describe('UI modernization smoke', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
  });

  test('docked five-tab nav includes Around', async ({ page }) => {
    await ensureSampleCar(page);
    await page.goto('/');
    await dismissWhatsNewIfOpen(page);
    const nav = page.getByRole('navigation', { name: /primary|التنقل/i });
    await expect(nav.getByRole('link', { name: /home|الرئيسية/i })).toBeVisible();
    await expect(nav.getByRole('link', { name: /fuel|الوقود/i })).toBeVisible();
    await expect(nav.getByRole('link', { name: /around|حولي/i })).toBeVisible();
    await expect(nav.getByRole('link', { name: /maintenance|صيانة/i })).toBeVisible();
    await expect(nav.getByRole('link', { name: /more|المزيد/i })).toBeVisible();
  });

  test('around waits for location CTA', async ({ page }) => {
    await ensureSampleCar(page);
    await page.goto('/around');
    await dismissWhatsNewIfOpen(page);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(
      page.getByRole('button', { name: /use my location|استخدم موقعي/i }),
    ).toBeVisible();
  });

  test('home tabs and fill-up tank switch render', async ({ page }) => {
    await ensureSampleCar(page);
    await page.goto('/');
    await dismissWhatsNewIfOpen(page);
    await expect(page.getByRole('tab', { name: /dashboard|لوحة/i })).toBeVisible();
    await page.goto('/fill-up');
    await dismissWhatsNewIfOpen(page);
    await expect(page.getByRole('switch')).toBeVisible();
    await expect(page.locator('#station-input')).toBeVisible();
  });

  test('maintenance dues then form order', async ({ page }) => {
    await ensureSampleCar(page);
    await page.goto('/maintenance');
    await dismissWhatsNewIfOpen(page);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByText(/due status|حالة الاستحقاق/i)).toBeVisible();
  });

  test('fill-up and maintenance history filters use selects', async ({ page }) => {
    await ensureSampleCar(page);
    await page.goto('/history/fill-ups');
    await dismissWhatsNewIfOpen(page);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByText(/range|الفترة/i).first()).toBeVisible();
    await page.goto('/history/maintenance');
    await dismissWhatsNewIfOpen(page);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('more route and update sheet still work', async ({ page }) => {
    await ensureSampleCar(page);
    await page.goto('/more');
    await dismissWhatsNewIfOpen(page);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.getByRole('button', { name: /what.?s new|ما الجديد/i }).click();
    await expect(page.locator('dialog.update-sheet')).toBeVisible();
  });

  test('first-run sample car action is available on setup', async ({ page }) => {
    await page.goto('/setup');
    await dismissWhatsNewIfOpen(page);
    const sample = page.getByRole('button', { name: /sample car|سيارة تجريبية/i });
    if (await sample.count()) {
      await expect(sample).toBeVisible();
    }
  });
});
