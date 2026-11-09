import { test, expect, type Page, type Route } from '@playwright/test';
import { dismissWhatsNewIfOpen, ensureEnglishUi, ensureSampleCar, watchConsole } from './helpers';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);
const photo = { name: 'odometer.png', mimeType: 'image/png', buffer: PNG };

async function openFillUp(page: Page): Promise<void> {
  await ensureSampleCar(page);
  await ensureEnglishUi(page);
  await page.goto('/fill-up');
  await dismissWhatsNewIfOpen(page);
  await expect(page.locator('app-odometer-scan')).toBeAttached();
}

async function expectNoAppErrors(issues: { text: string }[]): Promise<void> {
  const real = issues.filter(
    (i) => !/Failed to load resource|net::ERR|openvan|CORS policy|restcountries/i.test(i.text),
  );
  expect(real, real.map((i) => i.text).join('\n')).toEqual([]);
}

test.describe('Odometer photo scan', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
  });

  test('capture card offers camera and gallery odometer tiles in fuel mode', async ({ page }) => {
    const issues = watchConsole(page);
    await openFillUp(page);
    const row = page.locator('app-odometer-scan');
    await expect(row.getByRole('button', { name: 'Scan odometer' })).toBeVisible();
    await expect(row.getByRole('button', { name: 'From gallery' })).toBeVisible();
    await expect(row.locator('.odo-tile')).toHaveCount(2);
    const card = page.locator('.capture');
    const fits = await card.evaluate((el) => el.scrollWidth <= el.clientWidth + 1);
    expect(fits, 'capture card overflows horizontally').toBe(true);
    await card.evaluate((el) => el.scrollIntoView({ block: 'center' }));
    await card.screenshot({ path: '.qa/odometer-scan-en.png' });
    await expectNoAppErrors(issues);
  });

  test('odometer tiles remain available in charge mode', async ({ page }) => {
    await openFillUp(page);
    await page.getByRole('radio', { name: /charge/i }).click();
    const row = page.locator('app-odometer-scan');
    await expect(row.getByRole('button', { name: 'Scan odometer' })).toBeVisible();
    await expect(row.locator('.odo-tile')).toHaveCount(2);
  });

  test('the camera tile opens the file picker', async ({ page }) => {
    await openFillUp(page);
    const chooser = page.waitForEvent('filechooser');
    await page.locator('app-odometer-scan').getByRole('button', { name: 'Scan odometer' }).click();
    const fc = await chooser;
    expect(fc.isMultiple()).toBe(false);
    await fc.setFiles([]);
  });

  test('cancel mid-scan discards the late OCR result', async ({ page }) => {
    const issues = watchConsole(page);
    await openFillUp(page);
    const held: Route[] = [];
    await page.route('**/*', (route) => {
      const url = route.request().url();
      if (url.includes('127.0.0.1') || url.includes('localhost')) {
        void route.continue();
      } else {
        held.push(route);
      }
    });
    await page.locator('#odo-scan-input').setInputFiles(photo);
    const cancel = page.locator('app-odometer-scan').getByRole('button', { name: 'Cancel scan' });
    await expect(cancel).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('app-odometer-scan .odo-tile').first()).toBeDisabled();
    const row = page.locator('app-odometer-scan');
    await row.evaluate((el) => el.scrollIntoView({ block: 'center' }));
    await row.screenshot({ path: '.qa/odometer-scan-busy.png' });
    await cancel.click();
    await expect(page.locator('app-odometer-scan').getByRole('button', { name: 'Scan odometer' })).toBeVisible();
    for (const r of held) {
      await r.abort().catch(() => {});
    }
    await page.waitForTimeout(300);
    await expect(page.locator('app-odometer-review .odo-review')).toHaveCount(0);
    await expect(page.locator('app-odometer-scan .error-state')).toHaveCount(0);
    await page.unroute('**/*');
    await expectNoAppErrors(issues);
  });

  test('a failed read shows a friendly manual-entry fallback', async ({ page }) => {
    await openFillUp(page);
    await page.route('**/*', (route) => {
      const url = route.request().url();
      if (url.includes('127.0.0.1') || url.includes('localhost')) {
        void route.continue();
      } else {
        void route.abort();
      }
    });
    await page.locator('#odo-scan-input').setInputFiles(photo);
    const err = page.locator('app-odometer-scan .error-state');
    await expect(err).toBeVisible({ timeout: 20_000 });
    await expect(err).toContainText('Could not read the odometer');
    await expect(page.locator('app-odometer-review .odo-review')).toHaveCount(0);
    await expect(page.locator('app-odometer-scan').getByRole('button', { name: 'Scan odometer' })).toBeEnabled();
    const row = page.locator('app-odometer-scan');
    await row.evaluate((el) => el.scrollIntoView({ block: 'center' }));
    await row.screenshot({ path: '.qa/odometer-scan-error.png' });
    await page.unroute('**/*');
  });

  test('Arabic RTL renders the localized tiles without overflow', async ({ page }) => {
    const issues = watchConsole(page);
    await ensureSampleCar(page);
    await page.goto('/fill-up');
    await dismissWhatsNewIfOpen(page);
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    const row = page.locator('app-odometer-scan');
    await expect(row.getByRole('button', { name: 'صوّر العداد' })).toBeVisible();
    await expect(row.getByRole('button', { name: 'من المعرض' })).toBeVisible();
    const card = page.locator('.capture');
    const fits = await card.evaluate((el) => el.scrollWidth <= el.clientWidth + 1);
    expect(fits, 'RTL capture card overflows horizontally').toBe(true);
    await card.evaluate((el) => el.scrollIntoView({ block: 'center' }));
    await card.screenshot({ path: '.qa/odometer-scan-ar.png' });
    await expectNoAppErrors(issues);
  });
});