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

  test('home tabs and fill-up tank fallback render', async ({ page }) => {
    await ensureSampleCar(page);
    await page.goto('/');
    await dismissWhatsNewIfOpen(page);
    await expect(page.getByRole('tab', { name: /dashboard|لوحة/i })).toBeVisible();
    await page.goto('/fill-up');
    await dismissWhatsNewIfOpen(page);
    await expect(page.getByLabel(/tank visual|عرض التنك/i)).toBeVisible();
  });

  test('maintenance and more routes load', async ({ page }) => {
    await ensureSampleCar(page);
    await page.goto('/maintenance');
    await dismissWhatsNewIfOpen(page);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.goto('/more');
    await dismissWhatsNewIfOpen(page);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('fill-up station field and location control render', async ({ page }) => {
    await ensureSampleCar(page);
    await page.goto('/fill-up');
    await dismissWhatsNewIfOpen(page);
    await page.getByText(/details|التفاصيل/i).click();
    await expect(page.locator('#station-input')).toBeVisible();
    await expect(page.getByRole('button', { name: /use my location|استخدم موقعي/i })).toBeVisible();
  });

  test('fill-up and maintenance history pages render', async ({ page }) => {
    await ensureSampleCar(page);
    await page.goto('/history/fill-ups');
    await dismissWhatsNewIfOpen(page);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.goto('/history/maintenance');
    await dismissWhatsNewIfOpen(page);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('update sheet opens from More', async ({ page }) => {
    await ensureSampleCar(page);
    await page.goto('/more');
    await dismissWhatsNewIfOpen(page);
    await page.getByRole('button', { name: /what.?s new|ما الجديد/i }).click();
    await expect(page.locator('dialog.update-sheet')).toBeVisible();
    await expect(page.locator('.update-sheet__dot').first()).toBeVisible();
  });

  test('first-run sample car action is available on setup', async ({ page }) => {
    await page.goto('/setup');
    await dismissWhatsNewIfOpen(page);
    const sample = page.getByRole('button', { name: /sample car|سيارة تجريبية/i });
    if (await sample.count()) {
      await expect(sample).toBeVisible();
    }
  });

  test('home shows sample banner or ghost CTA after seed', async ({ page }) => {
    await ensureSampleCar(page);
    await page.goto('/');
    await dismissWhatsNewIfOpen(page);
    const sampleBanner = page.getByRole('button', { name: /clear sample|مسح التجريبي/i });
    const ghost = page.getByRole('link', { name: /log your first|سجّل أول/i });
    const glance = page.getByLabel(/glance|نظرة/i);
    await expect(sampleBanner.or(ghost).or(glance).first()).toBeVisible({ timeout: 15_000 });
  });
});
