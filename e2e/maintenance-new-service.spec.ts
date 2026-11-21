import { test, expect, type Page } from '@playwright/test';
import { ensureSampleCar, ensureEnglishUi, dismissWhatsNewIfOpen } from './helpers';

async function records(page: Page): Promise<any[]> {
  return page.evaluate(
    () =>
      new Promise<any[]>((resolve, reject) => {
        const req = indexedDB.open('drivelog');
        req.onsuccess = () => {
          const db = req.result;
          const read = db.transaction('maintenance').objectStore('maintenance').getAll();
          read.onsuccess = () => {
            db.close();
            resolve(read.result);
          };
          read.onerror = () => reject(read.error);
        };
      }),
  );
}

async function prepare(page: Page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  // Keep this test local: no live pricing, holiday, AI or geolocation requests.
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    return url.hostname === '127.0.0.1' || url.protocol === 'data:'
      ? route.continue()
      : route.abort();
  });
  await ensureSampleCar(page);
  await ensureEnglishUi(page);
  const old = (await records(page)).find((row) => row.partDefinitionId === 'sys-engine-oil');
  expect(old).toBeTruthy();
  await page.goto('/maintenance?id=' + old.id);
  await dismissWhatsNewIfOpen(page);
  return old;
}

test('new oil change preserves original record, clears old details, survives reload', async ({
  page,
}) => {
  const old = await prepare(page);
  const before = await records(page);
  await expect(page.getByText('Editing record', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Save record correction', exact: true }),
  ).toBeVisible();
  await page.locator('.maint-form__new').click();
  await expect(page.getByText('Editing record', { exact: true })).toHaveCount(0);
  await expect(page).not.toHaveURL(/[?&]id=/);
  await expect(page.locator('app-numeric-field').nth(1).locator('input')).toHaveValue('');
  await expect(page.locator('app-text-field').first().locator('input')).toHaveValue('');
  await expect(page.locator('app-numeric-field').nth(2).locator('input')).toHaveValue('');
  await page.reload();
  await dismissWhatsNewIfOpen(page);
  await expect(page.getByRole('heading', { name: 'Log a new oil change' })).toBeVisible();
  await page.locator('app-numeric-field').nth(1).locator('input').fill('1800');
  await page.locator('app-text-field').first().locator('input').fill('New oil 5W-30');
  await page.getByRole('button', { name: 'Save new service', exact: true }).click();
  await expect.poll(async () => (await records(page)).length).toBe(before.length + 1);
  const after = await records(page);
  expect(after.find((row) => row.id === old.id)).toEqual(old);
  const added = after.find((row) => !before.some((prior) => prior.id === row.id));
  expect(added).toMatchObject({
    partDefinitionId: 'sys-engine-oil',
    cost: 1800,
    partModel: 'New oil 5W-30',
  });
  expect(added.id).not.toBe(old.id);
  await page.reload();
  expect((await records(page)).find((row) => row.id === old.id)).toEqual(old);
});

test('correction updates the original without duplicating an expense', async ({ page }) => {
  const old = await prepare(page);
  const before = await records(page);
  await page.locator('app-numeric-field').nth(1).locator('input').fill('1234');
  await page.getByRole('button', { name: 'Save record correction', exact: true }).click();
  await expect
    .poll(async () => (await records(page)).find((row) => row.id === old.id)?.cost)
    .toBe(1234);
  const after = await records(page);
  expect(after).toHaveLength(before.length);
  expect(after.find((row) => row.id === old.id)?.createdAt).toBe(old.createdAt);
  expect(after.filter((row) => row.id !== old.id)).toEqual(
    before.filter((row) => row.id !== old.id),
  );
});

test('Arabic mobile edit and new-service views remain readable', async ({ page }) => {
  const old = await prepare(page);
  await page.goto('/settings');
  await page.getByRole('button', { name: 'Language', exact: true }).click();
  await page.getByRole('option', { name: 'Arabic', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
  await page.goto('/maintenance?id=' + old.id);
  await dismissWhatsNewIfOpen(page);
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('.maint-form__new')).toContainText('تسجيل تغيير زيت جديد');
  await page.waitForTimeout(700);
  await page.screenshot({ path: '.qa/maintenance-correction-ar.png', fullPage: true });
  await page.locator('.maint-form__new').click();
  await expect(page.getByRole('heading', { name: 'تسجيل تغيير زيت جديد' })).toBeVisible();
  await page.waitForTimeout(700);
  await page.screenshot({ path: '.qa/maintenance-new-oil-ar.png', fullPage: true });
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({ path: '.qa/maintenance-top-viewport.png' });
  const cost = page.locator('app-numeric-field').nth(1).locator('input');
  await cost.focus();
  await cost.scrollIntoViewIfNeeded();
  await cost.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await page.screenshot({ path: '.qa/maintenance-form-viewport.png' });
  const navTop = (await page.locator('nav.nav').boundingBox())!.y;
  const focused = (await cost.boundingBox())!;
  expect(focused.y + focused.height).toBeLessThan(navTop);
  const notes = page.locator('textarea');
  await notes.focus();
  await notes.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  const notesBox = (await notes.boundingBox())!;
  expect(notesBox.y + notesBox.height).toBeLessThan(navTop);
  await page.locator('.maint-list').scrollIntoViewIfNeeded();
  await page.locator('.maint-list').evaluate((el) => el.scrollIntoView({ block: 'start' }));
  await page.screenshot({ path: '.qa/maintenance-history-viewport.png' });
  for (const row of await page.locator('.maint-row').all()) {
    const name = (await row.locator('.maint-row__body strong').boundingBox())!;
    const price = (await row.locator('.maint-row__cost').boundingBox())!;
    const actions = (await row.locator('.maint-row__icons').boundingBox())!;
    expect(name.y + name.height).toBeLessThanOrEqual(price.y);
    expect(price.y + price.height).toBeLessThanOrEqual(actions.y);
  }
  await page.evaluate(() => scrollTo(0, document.body.scrollHeight));
  const finalLink = (await page.locator('.maint-see-all').boundingBox())!;
  expect(finalLink.y + finalLink.height).toBeLessThan(navTop);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  expect(overflow).toBe(false);
  await page.getByRole('button', { name: 'تصحيح بيانات السجل', exact: true }).first().click();
  await page.getByRole('button', { name: 'إلغاء التعديل', exact: true }).click();
  await expect(page.getByText('تعديل سجل', { exact: true })).toHaveCount(0);
  await expect(page.locator('app-numeric-field').nth(1).locator('input')).toHaveValue('');
});

test('history quick action and part details open a new service, not a correction', async ({
  page,
}) => {
  const old = await prepare(page);
  const before = await records(page);
  await page.locator('.maint-row__new').filter({ hasText: 'Log a new oil change' }).click();
  await expect(page.getByRole('heading', { name: 'Log a new oil change' })).toBeVisible();
  await expect(page.locator('.maint-form__edit')).toHaveCount(0);
  await expect(page.locator('app-numeric-field').nth(1).locator('input')).toHaveValue('');
  await page.goto('/health/sys-engine-oil');
  await page.getByRole('link', { name: 'Log a new oil change', exact: true }).click();
  await expect(page).toHaveURL(/maintenance\?partId=sys-engine-oil/);
  await expect(page.locator('.maint-form__edit')).toHaveCount(0);
  expect(await records(page)).toEqual(before);
  await page.goto('/maintenance?id=' + old.id);
  await page.locator('.maint-row__new').filter({ hasText: 'Log a new service' }).first().click();
  await expect(page.getByRole('heading', { name: 'Log a new service', exact: true })).toBeVisible();
  await expect(page.locator('.maint-form__edit')).toHaveCount(0);
  expect(await records(page)).toEqual(before);
});


test('history stays separate at 320px and desktop widths', async ({ page }) => {
  await prepare(page);
  for (const width of [320, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(page.locator('.maint-row').first()).toBeVisible();
    for (const row of await page.locator('.maint-row').all()) {
      const name = (await row.locator('.maint-row__body strong').boundingBox())!;
      const price = (await row.locator('.maint-row__cost').boundingBox())!;
      const actions = (await row.locator('.maint-row__icons').boundingBox())!;
      expect(name.y + name.height).toBeLessThanOrEqual(price.y);
      expect(price.y + price.height).toBeLessThanOrEqual(actions.y);
      expect(await row.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});

test('upcoming starts a fresh service and updates home/dues without losing the ledger or papers', async ({ page }) => {
  await prepare(page);
  // Controlled overdue baseline on the latest oil service, not an older historical one.
  await page.evaluate(() => new Promise<void>((resolve,reject) => {
    const req = indexedDB.open('drivelog');
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction('maintenance','readwrite');
      const store = tx.objectStore('maintenance');
      const all = store.getAll();
      all.onsuccess = () => {
        const oil = all.result.filter(r => r.partDefinitionId === 'sys-engine-oil')
          .sort((a,b) => b.date.localeCompare(a.date) || b.odometer-a.odometer)[0];
        store.put({...oil,dueKm:45500});
      };
      tx.oncomplete = () => {db.close();resolve();};
      tx.onerror = () => reject(tx.error);
    };
  }));
  const before = await records(page);
  const old = before.filter(r => r.partDefinitionId === 'sys-engine-oil')
    .sort((a,b) => b.date.localeCompare(a.date) || b.odometer-a.odometer)[0];
  await page.goto('/upcoming');
  const oldLink = page.locator(`.upcoming__link[href*="serviceFor=${old.id}"]`);
  await expect(oldLink).toBeVisible();
  const paperTitles = await page.locator('.upcoming__link[href="/vault"]').allTextContents();
  await oldLink.click();
  await expect(page.locator('.maint-form__edit')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Log a new oil change' })).toBeVisible();
  await expect(page.locator('app-numeric-field').nth(1).locator('input')).toHaveValue('');
  await page.locator('app-numeric-field').nth(1).locator('input').fill('1800');
  await page.locator('app-numeric-field').nth(2).locator('input').fill('45640');
  await page.getByRole('button', { name:'Save new service', exact:true }).click();
  await expect.poll(async () => (await records(page)).length).toBe(before.length + 1);
  const after = await records(page);
  expect(after.find(r => r.id === old.id)).toEqual(old);
  const added = after.find(r => !before.some(b => b.id === r.id))!;
  await page.goto('/upcoming');
  await expect(page.locator(`.upcoming__link[href*="serviceFor=${old.id}"]`)).toHaveCount(0);
  await expect(page.locator(`.upcoming__link[href*="serviceFor=${added.id}"]`)).toContainText('100');
  expect(await page.locator('.upcoming__link[href="/vault"]').allTextContents()).toEqual(paperTitles);
  await page.goto('/maintenance');
  await expect(page.locator('.maint-due--late').filter({hasText:'Engine oil'})).toHaveCount(0);
  await expect(page.locator('.maint-due').filter({hasText:'Engine oil'})).toHaveCount(1);
  await page.goto('/settings');
  await page.getByRole('button', { name:'Language', exact:true }).click();
  await page.getByRole('option', { name:'Arabic', exact:true }).click();
  await expect(page.locator('html')).toHaveAttribute('lang','ar');
  await page.goto('/upcoming');
  await page.waitForTimeout(700);
  await page.screenshot({path:'.qa/upcoming-fixed-ar.png'});
  // Remove urgent sample papers only in this isolated test so home's compact list is visible.
  await page.evaluate(() => new Promise<void>((resolve,reject) => {
    const req = indexedDB.open('drivelog');
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction(['car','vehicleDocuments'],'readwrite');
      tx.objectStore('vehicleDocuments').clear();
      const get = tx.objectStore('car').get('sample-car');
      get.onsuccess = () => tx.objectStore('car').put({...get.result,licenseExpiry:'2099-12-31',registrationExpiry:'2099-12-31'});
      tx.oncomplete = () => {db.close();resolve();};
      tx.onerror = () => reject(tx.error);
    };
  }));
  await page.goto('/');
  const current = page.locator(`.coming__link[href*="serviceFor=${added.id}"]`);
  await expect(current).toBeVisible();
  await expect(current).toContainText('١٠٠');
  await expect(page.locator(`.coming__link[href*="serviceFor=${old.id}"]`)).toHaveCount(0);
  await page.locator('.coming').scrollIntoViewIfNeeded();
  await page.waitForTimeout(700);
  await page.screenshot({path:'.qa/home-upcoming-fixed-ar.png'});
  await current.click();
  await expect(page.getByRole('heading',{name:'تسجيل تغيير زيت جديد'})).toBeVisible();
  await expect(page.locator('.maint-form__edit')).toHaveCount(0);
  expect(await records(page)).toEqual(after);
});
