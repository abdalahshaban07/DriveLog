import { test, expect, type Page } from '@playwright/test';
import { ensureSampleCar, ensureEnglishUi, dismissWhatsNewIfOpen } from './helpers';
async function prepare(page: Page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/*', (r) =>
    new URL(r.request().url()).hostname === '127.0.0.1' ? r.continue() : r.abort(),
  );
  await ensureSampleCar(page);
  await ensureEnglishUi(page);
}
async function state(page: Page) {
  return page.evaluate(
    () =>
      new Promise<any>((resolve, reject) => {
        const req = indexedDB.open('drivelog');
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction(['maintenance', 'maintenanceRevisions', 'fillUps']);
          const m = tx.objectStore('maintenance').getAll(),
            r = tx.objectStore('maintenanceRevisions').getAll(),
            f = tx.objectStore('fillUps').getAll();
          tx.oncomplete = () => {
            db.close();
            resolve({ maintenance: m.result, revisions: r.result, fills: f.result });
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
  );
}
test('revision captures previous service, restore updates same id and preserves a redo version', async ({
  page,
}) => {
  page.on('pageerror', (error) => console.log('PAGEERROR', String(error)));
  await prepare(page);
  const before = await state(page);
  const lowerVersionError = await page.evaluate(() => new Promise<string>(resolve => {
    const req = indexedDB.open('drivelog',8);
    req.onerror = () => resolve(req.error?.name ?? 'unknown');
    req.onsuccess = () => {req.result.close();resolve('unexpected-success');};
  }));
  expect(lowerVersionError).toBe('VersionError');
  const old = before.maintenance.find((m: any) => m.partDefinitionId === 'sys-engine-oil');
  await page.goto('/maintenance?id=' + old.id);
  await page.locator('app-numeric-field').nth(1).locator('input').fill('1999');
  await page.getByRole('button', { name: 'Save record correction', exact: true }).click();
  await expect(page.locator('.maint-form__edit')).toHaveCount(0);
  const after = await state(page);
  expect(after.revisions).toHaveLength(1);
  expect(after.revisions[0].snapshot).toEqual(old);
  await page.goto('/maintenance?id=' + old.id);
  await page.getByRole('button', { name: 'Restore this version', exact: true }).click();
  await page
    .locator('app-confirm-bar')
    .getByRole('button', { name: 'Restore this version', exact: true })
    .click();
  await expect(page.locator('app-numeric-field').nth(1).locator('input')).toHaveValue(
    String(old.cost),
  );
  const restored = await state(page);
  expect(restored.maintenance).toHaveLength(before.maintenance.length);
  expect(restored.revisions).toHaveLength(2);
  expect(restored.maintenance.find((m: any) => m.id === old.id).cost).toBe(old.cost);
  expect(restored.revisions.some((r: any) => r.snapshot.cost === 1999)).toBe(true);
  await page.reload();
  await expect(page.locator('.revision-entry')).toHaveCount(2);
  await page.goto('/settings');
  await page.getByRole('button', { name: 'Language', exact: true }).click();
  await page.getByRole('option', { name: 'Arabic', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
  await page.goto('/maintenance?id=' + old.id);
  await page.locator('.revisions').scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  await page.screenshot({ path: '.qa/revisions-ar.png' });
});
test('maintenance draft survives navigation/reload, does not write a record, and discards', async ({
  page,
}) => {
  await prepare(page);
  const before = await state(page);
  await page.goto('/maintenance');
  await page.locator('app-numeric-field').nth(1).locator('input').fill('2222');
  await page.locator('app-text-field').first().locator('input').fill('Draft only');
  await page.getByRole('link', { name: 'Home', exact: true }).click();
  await page.goto('/maintenance');
  await expect(page.locator('app-numeric-field').nth(1).locator('input')).toHaveValue('2222');
  await expect(
    page.getByText('Draft restored on this device. It is not a saved transaction yet.', {
      exact: true,
    }),
  ).toBeVisible();
  await page.reload();
  await expect(page.locator('app-text-field').first().locator('input')).toHaveValue('Draft only');
  expect((await state(page)).maintenance).toEqual(before.maintenance);
  await page.getByRole('button', { name: 'Discard draft', exact: true }).click();
  await expect(page.locator('app-numeric-field').nth(1).locator('input')).toHaveValue('');
  await page.reload();
  await expect(page.locator('app-numeric-field').nth(1).locator('input')).toHaveValue('');
});
test('fuel draft survives reload and never creates a fill-up before save', async ({ page }) => {
  await prepare(page);
  const before = await state(page);
  await page.goto('/fill-up');
  await page.locator('app-numeric-field').first().locator('input').fill('321');
  await page.locator('app-numeric-field').nth(1).locator('input').fill('27');
  await page.goto('/fuel');
  await page.goto('/fill-up');
  await expect(page.locator('app-numeric-field').first().locator('input')).toHaveValue('321');
  await expect(page.locator('app-numeric-field').nth(1).locator('input')).toHaveValue('27');
  expect((await state(page)).fills).toEqual(before.fills);
  await page.getByRole('button', { name: 'Discard draft', exact: true }).click();
  await expect(page.locator('app-numeric-field').first().locator('input')).toHaveValue('');
});

test('maintenance saved draft clears, revisions round-trip through backup and restore remains prospective', async ({
  page,
}) => {
  await prepare(page);
  const before = await state(page);
  const old = before.maintenance[0];
  await page.goto('/maintenance?id=' + old.id);
  await page.locator('app-numeric-field').nth(1).locator('input').fill('1234');
  await page.reload();
  await expect(page.locator('app-numeric-field').nth(1).locator('input')).toHaveValue('1234');
  await page.getByRole('button', { name: 'Save record correction', exact: true }).click();
  await expect(page.locator('.maint-form__edit')).toHaveCount(0);
  await page.goto('/maintenance?id=' + old.id);
  await expect(page.getByRole('button', { name: 'Discard draft', exact: true })).toHaveCount(0);
  await page.goto('/settings');
  const event = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export backup', exact: true }).click();
  const download = await event;
  const path = (await download.path())!;
  await page.locator('#backup-import').setInputFiles(path);
  await page.getByRole('button', { name: 'Replace existing data', exact: true }).click();
  await expect(page.getByText('Backup restored', { exact: true })).toBeVisible();
  await page.reload();
  expect((await state(page)).revisions).toHaveLength(1);
  expect((await state(page)).maintenance).toHaveLength(before.maintenance.length);
});

test('Arabic draft status is visible and saved fuel drafts do not return after save', async ({
  page,
}) => {
  await prepare(page);
  await page.goto('/fill-up');
  await page.locator('app-numeric-field').first().locator('input').fill('321');
  await page.locator('app-numeric-field').nth(1).locator('input').fill('27');
  await page.goto('/settings');
  await page.getByRole('button', { name: 'Language', exact: true }).click();
  await page.getByRole('option', { name: 'Arabic', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
  await page.goto('/fill-up');
  await expect(
    page.getByText('رجّعنا المسودة على الجهاز ده. لسه ما اتحفظتش كعملية.', { exact: true }),
  ).toBeVisible();
  await page.waitForTimeout(500);
  await page.screenshot({ path: '.qa/fuel-draft-ar.png' });
  const before = await state(page);
  await page
    .locator('app-primary-button')
    .getByRole('button', { name: 'حفظ', exact: true })
    .click();
  await expect(page).toHaveURL(/\/fuel$/);
  expect((await state(page)).fills).toHaveLength(before.fills.length + 1);
  await page.goto('/fill-up');
  await expect(page.locator('app-numeric-field').first().locator('input')).toHaveValue('');
  await page.goto('/maintenance');
  await page.locator('app-numeric-field').nth(1).locator('input').fill('555');
  await page.reload();
  await expect(
    page.getByText('رجّعنا المسودة على الجهاز ده. لسه ما اتحفظتش كعملية.', { exact: true }),
  ).toBeVisible();
  await page.waitForTimeout(500);
  await page.screenshot({ path: '.qa/maintenance-draft-ar.png' });
});

test('upgrades a v8 database in place without changing saved maintenance or fuel', async ({
  page,
  browser,
}) => {
  await prepare(page);
  const before = await state(page);
  const stores = await page.evaluate(
    () =>
      new Promise<any>((resolve) => {
        const req = indexedDB.open('drivelog');
        req.onsuccess = () => {
          const db = req.result;
          const names = Array.from(db.objectStoreNames).filter((n) => n !== 'maintenanceRevisions');
          const tx = db.transaction(names);
          const values: Record<string, any[]> = {};
          for (const name of names) {
            const r = tx.objectStore(name).getAll();
            r.onsuccess = () => (values[name] = r.result);
          }
          tx.oncomplete = () => {
            db.close();
            resolve(values);
          };
        };
      }),
  );
  const context = await browser.newContext();
  const legacy = await context.newPage();
  await legacy.route('**/qa-seed', (r) =>
    r.fulfill({ contentType: 'text/html', body: '<html><body>seed</body></html>' }),
  );
  await legacy.goto('http://127.0.0.1:4200/qa-seed');
  await legacy.evaluate(
    (data) =>
      new Promise<void>((resolve, reject) => {
        const req = indexedDB.open('drivelog', 8);
        req.onupgradeneeded = () => {
          for (const name of Object.keys(data))
            req.result.createObjectStore(name, { keyPath: 'id' });
        };
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction(Object.keys(data), 'readwrite');
          for (const [name, rows] of Object.entries(data))
            for (const row of rows as any[]) tx.objectStore(name).put(row);
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
    stores,
  );
  await legacy.route('**/*', (r) =>
    new URL(r.request().url()).hostname === '127.0.0.1' ? r.continue() : r.abort(),
  );
  await legacy.goto('http://127.0.0.1:4200/maintenance');
  await dismissWhatsNewIfOpen(legacy);
  await expect(legacy.locator('.maint-form')).toBeVisible();
  const after = await state(legacy);
  expect(after.maintenance).toEqual(before.maintenance);
  expect(after.fills).toEqual(before.fills);
  expect(after.revisions).toEqual([]);
  await context.close();
});
