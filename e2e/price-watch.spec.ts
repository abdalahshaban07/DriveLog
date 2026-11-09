import { test, expect, type Page } from '@playwright/test';
import { dismissWhatsNewIfOpen, ensureEnglishUi, ensureSampleCar, watchConsole } from './helpers';

/** Two change points 22 days apart; the live price API stays blocked so seeds win. */
async function seedPriceChange(page: Page): Promise<void> {
  await page.route('**/api/fuel/prices', (route) => route.abort());
  await page.evaluate(async () => {
    const day = (offset: number): string => {
      const d = new Date();
      d.setDate(d.getDate() - offset);
      return (
        d.getFullYear() +
        '-' +
        String(d.getMonth() + 1).padStart(2, '0') +
        '-' +
        String(d.getDate()).padStart(2, '0')
      );
    };
    const oldDay = day(22);
    const newDay = day(0);
    const snaps = [
      {
        id: `EG:${oldDay}`,
        countryCode: 'EG',
        day: oldDay,
        currency: 'EGP',
        gasoline92: 15.25,
        gasoline95: 17.5,
        diesel: 13.5,
        solar: 13.5,
      },
      {
        id: `EG:${newDay}`,
        countryCode: 'EG',
        day: newDay,
        currency: 'EGP',
        gasoline92: 17.25,
        gasoline95: 19.75,
        diesel: 15.25,
        solar: 15.25,
      },
    ];
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open('drivelog');
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction('fuelPriceHistory', 'readwrite');
        for (const s of snaps) tx.objectStore('fuelPriceHistory').put(s);
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
      req.onerror = () => reject(req.error);
    });
  });
}

async function expectNoAppErrors(page: Page, issues: { text: string }[]): Promise<void> {
  // restcountries CORS noise comes from the settings currency fetch in sandboxes.
  const real = issues.filter(
    (i) => !/Failed to load resource|net::ERR|openvan|CORS policy|restcountries/i.test(i.text),
  );
  expect(real, real.map((i) => i.text).join('\n')).toEqual([]);
}

test.describe('Fuel price watch', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
  });

  test('silent without history, alert after a change, dismiss persists', async ({ page }) => {
    const issues = watchConsole(page);
    await ensureSampleCar(page);
    await ensureEnglishUi(page);
    await page.goto('/');
    await dismissWhatsNewIfOpen(page);
    await expect(page.locator('app-price-watch .price-watch')).toHaveCount(0);

    await seedPriceChange(page);
    await page.goto('/');
    await dismissWhatsNewIfOpen(page);
    const card = page.locator('app-price-watch .price-watch');
    await expect(card).toBeVisible();
    await expect(card.getByRole('heading', { name: /Prices changed/i })).toBeVisible();
    await expect(card.locator('.price-watch__row')).toHaveCount(4);
    await expect(card.locator('.price-watch__spark')).toHaveCount(4);
    await expect(card.locator('.price-watch__delta--up').first()).toContainText('+13.1%');
    await expect(card.locator('.price-watch__impact')).toContainText('less before the change');

    const fits = await card.evaluate((el) => el.scrollWidth <= el.clientWidth + 1);
    expect(fits, 'price card overflows horizontally').toBe(true);
    await card.scrollIntoViewIfNeeded();
    await page.screenshot({ path: '.qa/price-watch-en.png' });

    await card.getByRole('button', { name: 'Dismiss price alert' }).click();
    await expect(card).toHaveCount(0);
    await page.reload();
    await dismissWhatsNewIfOpen(page);
    await expect(page.locator('app-price-watch .price-watch')).toHaveCount(0);
    await expectNoAppErrors(page, issues);
  });

  test('Arabic RTL renders the localized alert without overflow', async ({ page }) => {
    const issues = watchConsole(page);
    await ensureSampleCar(page);
    await seedPriceChange(page);
    await page.goto('/');
    await dismissWhatsNewIfOpen(page);
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    const card = page.locator('app-price-watch .price-watch');
    await expect(card).toBeVisible();
    await expect(card.locator('.price-watch__kicker')).toHaveText('أسعار الوقود الرسمية');
    await expect(card.getByRole('heading', { name: /الأسعار اتغيّرت/ })).toBeVisible();
    await expect(card.locator('.price-watch__impact')).toContainText('هتكلف أقل');
    const fits = await card.evaluate((el) => el.scrollWidth <= el.clientWidth + 1);
    expect(fits, 'RTL price card overflows horizontally').toBe(true);
    await card.scrollIntoViewIfNeeded();
    await page.screenshot({ path: '.qa/price-watch-ar.png' });
    await expectNoAppErrors(page, issues);
  });

  test('settings toggle for fuel price notifications persists', async ({ page }) => {
    await ensureSampleCar(page);
    await ensureEnglishUi(page);
    await page.goto('/settings');
    await dismissWhatsNewIfOpen(page);
    // Sub-toggles render only while the master reminders switch is on.
    const master = page.getByRole('switch', { name: 'Reminders', exact: true });
    if (!(await master.isChecked())) {
      await master.click();
      await expect(master).toBeChecked();
    }
    const toggle = page.getByRole('switch', { name: 'Fuel price notifications' });
    await expect(toggle).toBeChecked();
    await toggle.click();
    await expect(toggle).not.toBeChecked();
    await page.reload();
    await dismissWhatsNewIfOpen(page);
    await expect(page.getByRole('switch', { name: 'Fuel price notifications' })).not.toBeChecked();
  });
});