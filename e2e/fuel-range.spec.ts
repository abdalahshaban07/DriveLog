import { test, expect, type Page } from '@playwright/test';
import { dismissWhatsNewIfOpen, ensureEnglishUi, ensureSampleCar, watchConsole } from './helpers';

/**
 * Replace sample fills with a controlled 9 L/100km scenario. The app derives
 * currentOdometer from records, so an inspection pins it at the target.
 */
async function seedRange(page: Page, odometer: number): Promise<void> {
  await page.evaluate(async (odo) => {
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
    const fill = (id: string, o: number, liters: number, offset: number) => ({
      id,
      carId: 'sample-car',
      odometer: o,
      liters,
      cost: liters * 14,
      tankFull: true,
      fuelGrade: 'gasoline92',
      currency: 'EGP',
      date: day(offset),
      createdAt: `${day(offset)}T10:00:00.000Z`,
      updatedAt: `${day(offset)}T10:00:00.000Z`,
    });
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open('drivelog');
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction(['fillUps', 'maintenance'], 'readwrite');
        const fills = tx.objectStore('fillUps');
        fills.clear();
        fills.put(fill('range-f1', 44000, 40, 30));
        fills.put(fill('range-f2', 44500, 45, 10));
        const maint = tx.objectStore('maintenance');
        maint.clear();
        maint.put({
          id: 'range-odo',
          carId: 'sample-car',
          type: 'other',
          recordType: 'inspection',
          odometer: odo,
          date: day(0),
          createdAt: `${day(0)}T10:00:00.000Z`,
          updatedAt: `${day(0)}T10:00:00.000Z`,
        });
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
      req.onerror = () => reject(req.error);
    });
  }, odometer);
}

async function expectNoAppErrors(issues: { text: string }[]): Promise<void> {
  const real = issues.filter(
    (i) => !/Failed to load resource|net::ERR|openvan|CORS policy|restcountries/i.test(i.text),
  );
  expect(real, real.map((i) => i.text).join('\n')).toEqual([]);
}

test.describe('Fuel range predictor', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
  });

  test('sample car shows range, gauge and pace without a nudge', async ({ page }) => {
    const issues = watchConsole(page);
    await ensureSampleCar(page);
    await ensureEnglishUi(page);
    await page.goto('/');
    await dismissWhatsNewIfOpen(page);
    const card = page.locator('app-fuel-range .fuel-range');
    await expect(card).toBeVisible();
    await expect(card.locator('.fuel-range__kicker')).toHaveText('Range left');
    await expect(card.locator('.fuel-range__km')).toContainText('320');
    await expect(card.locator('.fuel-range__days')).toContainText(/\d+ days/);
    await expect(card.locator('.fuel-range__basis')).toContainText('km/day');
    const meter = card.getByRole('meter');
    await expect(meter).toHaveAttribute('aria-valuenow', '100');
    await expect(card.locator('.fuel-range__nudge')).toHaveCount(0);
    const fits = await card.evaluate((el) => el.scrollWidth <= el.clientWidth + 1);
    expect(fits, 'range card overflows horizontally').toBe(true);
    await card.evaluate((el) => el.scrollIntoView({ block: 'center' }));
    await card.screenshot({ path: '.qa/fuel-range-en.png' });
    await expectNoAppErrors(issues);
  });

  test('low range nudges with a fill-up CTA that navigates', async ({ page }) => {
    const issues = watchConsole(page);
    await ensureSampleCar(page);
    await ensureEnglishUi(page);
    await seedRange(page, 44950);
    await page.goto('/');
    await dismissWhatsNewIfOpen(page);
    const card = page.locator('app-fuel-range .fuel-range');
    await expect(card).toBeVisible();
    await expect(card).toHaveClass(/fuel-range--low/);
    await expect(card.locator('.fuel-range__km')).toContainText('50');
    await expect(card.getByRole('meter')).toHaveAttribute('aria-valuenow', '10');
    const nudge = card.locator('.fuel-range__nudge');
    await expect(nudge).toBeVisible();
    await expect(nudge).toContainText('Time to fill up');
    await expect(nudge).toContainText('driving left');
    await card.evaluate((el) => el.scrollIntoView({ block: 'center' }));
    await card.screenshot({ path: '.qa/fuel-range-low.png' });
    await nudge.getByRole('link', { name: 'Log fill-up' }).click();
    await expect(page).toHaveURL(/\/fill-up/);
    await expectNoAppErrors(issues);
  });

  test('burned tank reads empty and still offers the CTA', async ({ page }) => {
    await ensureSampleCar(page);
    await ensureEnglishUi(page);
    await seedRange(page, 45300);
    await page.goto('/');
    await dismissWhatsNewIfOpen(page);
    const card = page.locator('app-fuel-range .fuel-range');
    await expect(card).toBeVisible();
    await expect(card.locator('.fuel-range__km')).toContainText('0');
    await expect(card.locator('.fuel-range__days')).toHaveText('today');
    await expect(card.locator('.fuel-range__nudge')).toContainText('Tank is likely empty');
    await expect(card.getByRole('meter')).toHaveAttribute('aria-valuenow', '0');
    await card.evaluate((el) => el.scrollIntoView({ block: 'center' }));
    await card.screenshot({ path: '.qa/fuel-range-empty.png' });
  });

  test('hidden until two full fills exist', async ({ page }) => {
    await ensureSampleCar(page);
    await ensureEnglishUi(page);
    await page.evaluate(async () => {
      await new Promise<void>((resolve, reject) => {
        const req = indexedDB.open('drivelog');
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction('fillUps', 'readwrite');
          const store = tx.objectStore('fillUps');
          const all = store.getAll();
          all.onsuccess = () => {
            store.clear();
            const first = all.result[0];
            if (first) store.put(first);
          };
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
        req.onerror = () => reject(req.error);
      });
    });
    await page.goto('/');
    await dismissWhatsNewIfOpen(page);
    await expect(page.locator('app-price-watch')).toBeAttached();
    await expect(page.locator('app-fuel-range .fuel-range')).toHaveCount(0);
  });

  test('Arabic RTL renders the localized strip without overflow', async ({ page }) => {
    const issues = watchConsole(page);
    await ensureSampleCar(page);
    await page.goto('/');
    await dismissWhatsNewIfOpen(page);
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    const card = page.locator('app-fuel-range .fuel-range');
    await expect(card).toBeVisible({ timeout: 15_000 });
    await expect(card.locator('.fuel-range__kicker')).toHaveText('المدى المتبقي');
    await expect(card.locator('.fuel-range__basis')).toContainText('كم/يوم');
    const fits = await card.evaluate((el) => el.scrollWidth <= el.clientWidth + 1);
    expect(fits, 'RTL range card overflows horizontally').toBe(true);
    await card.evaluate((el) => el.scrollIntoView({ block: 'center' }));
    await card.screenshot({ path: '.qa/fuel-range-ar.png' });
    await expectNoAppErrors(issues);
  });
});