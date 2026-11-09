import { test, expect, type Page } from '@playwright/test';
import { dismissWhatsNewIfOpen, ensureEnglishUi, ensureSampleCar, watchConsole } from './helpers';

declare global {
  interface Window {
    __backupFiles?: Map<string, string>;
  }
}

/** Replace showDirectoryPicker (the DIRECTORY_PICKER seam) with an in-memory folder. */
async function stubPicker(page: Page, supported: boolean): Promise<void> {
  await page.addInitScript((ok) => {
    const w = window as unknown as Record<string, unknown>;
    if (!ok) {
      w.showDirectoryPicker = undefined;
      return;
    }
    w.showDirectoryPicker = async () => {
      const files = new Map<string, string>();
      (window as unknown as { __backupFiles: Map<string, string> }).__backupFiles = files;
      // Class instance: IDB clones own data (name/files); prototype methods stay in memory.
      class FakeDir {
        name = 'My Backups';
        files = files;
        async getFileHandle(name: string) {
          return {
            createWritable: async () => ({
              write: async (data: string) => {
                files.set(name, data);
              },
              close: async () => {},
            }),
          };
        }
        async removeEntry(name: string) {
          files.delete(name);
        }
        async *values() {
          for (const name of files.keys()) {
            yield { name };
          }
        }
        async queryPermission() {
          return 'granted';
        }
        async requestPermission() {
          return 'granted';
        }
      }
      return new FakeDir();
    };
  }, supported);
}

async function openSettings(page: Page): Promise<void> {
  await ensureSampleCar(page);
  await ensureEnglishUi(page);
  await page.goto('/settings');
  await dismissWhatsNewIfOpen(page);
}

function autoSection(page: Page, label = 'Auto backup') {
  return page.locator(`section[aria-label="${label}"]`);
}

async function shotSection(page: Page, label: string, path: string): Promise<void> {
  const el = autoSection(page, label);
  await el.scrollIntoViewIfNeeded();
  await page.evaluate((sel) => {
    document.querySelector(sel)?.scrollIntoView({ block: 'center' });
  }, `section[aria-label="${label}"]`);
  await el.screenshot({ path });
}

async function expectNoAppErrors(issues: { text: string }[]): Promise<void> {
  const real = issues.filter(
    (i) => !/Failed to load resource|net::ERR|openvan|CORS policy|restcountries/i.test(i.text),
  );
  expect(real, real.map((i) => i.text).join('\n')).toEqual([]);
}

test('unsupported browser shows the export fallback, no folder picker', async ({ page }) => {
  const issues = watchConsole(page);
  await stubPicker(page, false);
  await openSettings(page);

  const section = autoSection(page);
  await expect(section.getByText(/can't save to folders automatically/i)).toBeVisible();
  await expect(section.getByRole('button', { name: 'Choose backup folder' })).toHaveCount(0);
  await shotSection(page, 'Auto backup', '.qa/auto-backup-unsupported-en.png');
  await expectNoAppErrors(issues);
});

test('choose folder writes a dated copy and shows status', async ({ page }) => {
  const issues = watchConsole(page);
  await stubPicker(page, true);
  await openSettings(page);

  const section = autoSection(page);
  await section.getByRole('button', { name: 'Choose backup folder' }).click();
  await expect(section.getByText('My Backups')).toBeVisible();
  await expect(section.getByText('Backup saved', { exact: true })).toBeVisible();
  await expect(section.getByText(/Last backup:/)).toBeVisible();
  await expect(section.getByText('Never', { exact: true })).toHaveCount(0);

  const files = await page.evaluate(() => [...(window.__backupFiles?.entries() ?? [])]);
  expect(files.length).toBe(1);
  expect(files[0]![0]).toMatch(/^drivelog-backup-\d{4}-\d{2}-\d{2}\.json$/);
  expect(JSON.parse(files[0]![1]).version).toBe(7);

  await section.getByRole('button', { name: 'Back up now' }).click();
  await expect(section.getByText('Backup saved', { exact: true })).toBeVisible();
  const after = await page.evaluate(() => window.__backupFiles?.size ?? 0);
  expect(after).toBe(1); // same-day copy is overwritten, not duplicated

  await shotSection(page, 'Auto backup', '.qa/auto-backup-en.png');
  await expectNoAppErrors(issues);
});

test('passphrase encrypts the copy; import decrypts it end to end', async ({ page }) => {
  const issues = watchConsole(page);
  await stubPicker(page, true);
  await openSettings(page);

  const section = autoSection(page);
  await section.getByRole('button', { name: 'Choose backup folder' }).click();
  await expect(section.getByText('My Backups')).toBeVisible();

  await section.getByLabel('Passphrase (optional)').fill('s3cret phrase');
  await section.getByRole('button', { name: 'Save passphrase' }).click();
  await expect(section.getByText('Passphrase saved')).toBeVisible();
  await section.getByRole('button', { name: 'Back up now' }).click();
  await expect(section.getByText('Backup saved', { exact: true })).toBeVisible();

  const enc = await page.evaluate(() => {
    const entries = [...(window.__backupFiles?.entries() ?? [])];
    return entries.find(([n]) => n.endsWith('.json.enc'));
  });
  expect(enc, 'encrypted copy written').toBeTruthy();
  const payload = JSON.parse(enc![1]);
  expect(payload.encrypted).toBe(true);
  expect(enc![1]).not.toContain('fillUps');

  await page.locator('#backup-import').setInputFiles({
    name: 'drivelog-backup.json.enc',
    mimeType: 'application/json',
    buffer: Buffer.from(enc![1]),
  });
  await expect(page.getByText('This file is encrypted. Enter its passphrase to import.')).toBeVisible();

  await page.getByLabel('File passphrase').fill('wrong');
  await page.getByRole('button', { name: 'Decrypt & import' }).click();
  await expect(page.getByText('Wrong passphrase or damaged file.')).toBeVisible();

  await page.getByLabel('File passphrase').fill('s3cret phrase');
  await page.getByRole('button', { name: 'Decrypt & import' }).click();
  await page.getByRole('button', { name: 'Merge with existing data' }).click();
  await expect(page.getByText('Backup restored')).toBeVisible();
  await expectNoAppErrors(issues);
});

test('stop unlinks the folder and returns to the chooser', async ({ page }) => {
  const issues = watchConsole(page);
  await stubPicker(page, true);
  await openSettings(page);

  const section = autoSection(page);
  await section.getByRole('button', { name: 'Choose backup folder' }).click();
  await expect(section.getByText('My Backups')).toBeVisible();
  await section.getByRole('button', { name: 'Stop auto backup' }).click();
  await expect(section.getByRole('button', { name: 'Choose backup folder' })).toBeVisible();
  await expect(section.getByText('My Backups')).toHaveCount(0);
  await expectNoAppErrors(issues);
});

test('auto backup reads correctly in Arabic RTL', async ({ page }) => {
  const issues = watchConsole(page);
  await stubPicker(page, true);
  await openSettings(page);

  const section = autoSection(page);
  await section.getByRole('button', { name: 'Choose backup folder' }).click();
  await expect(section.getByText('My Backups')).toBeVisible();

  await page.getByRole('button', { name: 'Language', exact: true }).click();
  await page.getByRole('option', { name: 'Arabic', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  const ar = autoSection(page, 'نسخ احتياطي تلقائي');
  await expect(ar.getByText('احفظ نسخة دلوقتي')).toBeVisible();
  await shotSection(page, 'نسخ احتياطي تلقائي', '.qa/auto-backup-ar.png');
  await expectNoAppErrors(issues);
});