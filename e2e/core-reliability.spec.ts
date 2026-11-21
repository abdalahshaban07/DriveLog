import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
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
async function exportData(page: Page) {
  await page.goto('/settings');
  await dismissWhatsNewIfOpen(page);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export backup', exact: true }).click();
  const file = await download;
  return JSON.parse(await readFile((await file.path())!, 'utf8'));
}
const stable = (value: any) => JSON.parse(JSON.stringify(value));
const records = (data: any) =>
  Object.fromEntries(
    [
      'cars',
      'fillUps',
      'maintenance',
      'breakdowns',
      'otherExpenses',
      'vehicleDocuments',
      'parts',
      'partOverrides',
      'chargeSessions',
      'preTripChecks',
      'expensePeriods',
    ].map((key) => [
      key,
      (data[key] ?? []).slice().sort((a: any, b: any) => a.id.localeCompare(b.id)),
    ]),
  );
async function importData(page: Page, data: any, mode: 'replace' | 'merge') {
  await page
    .locator('#backup-import')
    .setInputFiles({
      name: 'qa-backup.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(data)),
    });
  await page
    .getByRole('button', {
      name: mode === 'replace' ? 'Replace existing data' : 'Merge with existing data',
      exact: true,
    })
    .click();
  await expect(page.getByText('Backup restored', { exact: true })).toBeVisible();
}

test('backup replace and repeated merge round-trip all sample ledgers without duplicates', async ({
  page,
}) => {
  await prepare(page);
  const original = await exportData(page);
  const expected = stable(records(original));
  await page.goto('/maintenance?id=' + original.maintenance[0].id);
  await page.locator('app-numeric-field').nth(1).locator('input').fill('9999');
  await page.getByRole('button', { name: 'Save record correction', exact: true }).click();
  await expect(page.locator('.maint-form__edit')).toHaveCount(0);
  await page.goto('/settings');
  await importData(page, original, 'replace');
  expect(records(await exportData(page))).toEqual(expected);
  await importData(page, original, 'merge');
  expect(records(await exportData(page))).toEqual(expected);
  await importData(page, original, 'merge');
  expect(records(await exportData(page))).toEqual(expected);
  await page.reload();
  expect(records(await exportData(page))).toEqual(expected);
});

test('malformed import and cancel never change existing records', async ({ page }) => {
  await prepare(page);
  const original = await exportData(page);
  await page
    .locator('#backup-import')
    .setInputFiles({
      name: 'broken.json',
      mimeType: 'application/json',
      buffer: Buffer.from('{broken'),
    });
  await expect(
    page.getByText('Import failed. Your data was not changed.', { exact: true }),
  ).toBeVisible();
  expect(records(await exportData(page))).toEqual(records(original));
  await page
    .locator('#backup-import')
    .setInputFiles({
      name: 'valid.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(original)),
    });
  await page
    .locator('app-confirm-bar')
    .getByRole('button', { name: 'Cancel', exact: true })
    .click();
  expect(records(await exportData(page))).toEqual(records(original));
});

test('correcting a price preserves imported details not exposed by the current form and permits clearing a model', async ({
  page,
}) => {
  await prepare(page);
  const data = await exportData(page);
  const old = data.maintenance.find((m: any) => m.partDefinitionId === 'sys-engine-oil');
  Object.assign(old, {
    centerName: 'QA garage',
    technicianName: 'QA technician',
    partBrand: 'QA brand',
    partCost: 700,
    laborCost: 150,
    partModel: 'QA 5W30',
  });
  await importData(page, data, 'replace');
  await page.goto('/maintenance?id=' + old.id);
  await page.locator('app-numeric-field').nth(1).locator('input').fill('900');
  await page.locator('app-text-field').first().locator('input').fill('');
  await page.getByRole('button', { name: 'Save record correction', exact: true }).click();
  await expect(page.locator('.maint-form__edit')).toHaveCount(0);
  const after = await exportData(page);
  const changed = after.maintenance.find((m: any) => m.id === old.id);
  for (const key of ['centerName', 'technicianName', 'partBrand', 'partCost', 'laborCost'])
    expect(changed[key], key).toEqual(old[key]);
  expect(changed.partModel).toBeUndefined();
  expect(changed.cost).toBe(900);
  expect(after.maintenance).toHaveLength(data.maintenance.length);
});

test('merge keeps newer local corrections and applies newer incoming corrections once', async ({
  page,
}) => {
  await prepare(page);
  const original = await exportData(page);
  const older = structuredClone(original);
  older.maintenance[0].cost = 1;
  older.maintenance[0].updatedAt = '2000-01-01T00:00:00.000Z';
  await importData(page, older, 'merge');
  expect(records(await exportData(page))).toEqual(records(original));
  const newer = structuredClone(original);
  newer.maintenance[0].cost = 777;
  newer.maintenance[0].updatedAt = '2099-01-01T00:00:00.000Z';
  await importData(page, newer, 'merge');
  const expected = records(newer);
  expect(records(await exportData(page))).toEqual(expected);
  await importData(page, newer, 'merge');
  expect(records(await exportData(page))).toEqual(expected);
});
