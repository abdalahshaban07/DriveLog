import { test, expect, type Page } from '@playwright/test';
import { dismissWhatsNewIfOpen, ensureEnglishUi, ensureSampleCar, watchConsole } from './helpers';

type FakeRec = {
  lang: string;
  onresult:
    | ((e: {
        resultIndex: number;
        results: { isFinal: boolean; 0: { transcript: string } }[];
      }) => void)
    | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};

declare global {
  interface Window {
    __voiceRec?: FakeRec;
  }
}

/** Replace the native SpeechRecognition seam the app reads, for deterministic runs. */
async function stubVoice(page: Page, supported: boolean): Promise<void> {
  await page.addInitScript((ok) => {
    const w = window as unknown as Record<string, unknown>;
    if (!ok) {
      w.SpeechRecognition = undefined;
      w.webkitSpeechRecognition = undefined;
      return;
    }
    class FakeRecognition {
      lang = '';
      continuous = false;
      interimResults = false;
      onresult: FakeRec['onresult'] = null;
      onerror: FakeRec['onerror'] = null;
      onend: FakeRec['onend'] = null;
      start(): void {
        (window as unknown as { __voiceRec: unknown }).__voiceRec = this;
      }
      stop(): void {
        this.onend?.();
      }
      abort(): void {
        /* discard */
      }
    }
    w.SpeechRecognition = FakeRecognition;
  }, supported);
}

async function openFillUp(page: Page): Promise<void> {
  await ensureSampleCar(page);
  await ensureEnglishUi(page);
  await page.goto('/fill-up');
  await dismissWhatsNewIfOpen(page);
  await expect(page.locator('app-voice-log')).toBeAttached();
}

function speak(page: Page, transcript: string): Promise<void> {
  return page.evaluate((text) => {
    const rec = window.__voiceRec;
    rec?.onresult?.({
      resultIndex: 0,
      results: [{ isFinal: true, 0: { transcript: text } }],
    });
    rec?.onend?.();
  }, transcript);
}

async function expectNoAppErrors(issues: { text: string }[]): Promise<void> {
  const real = issues.filter(
    (i) => !/Failed to load resource|net::ERR|openvan|CORS policy|restcountries/i.test(i.text),
  );
  expect(real, real.map((i) => i.text).join('\n')).toEqual([]);
}

/** Leave sample mode with one real fill so the home quick-log card renders. */
async function seedRealFill(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const d = new Date();
    const day =
      d.getFullYear() +
      '-' +
      String(d.getMonth() + 1).padStart(2, '0') +
      '-' +
      String(d.getDate()).padStart(2, '0');
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open('drivelog');
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction(['settings', 'fillUps'], 'readwrite');
        const settings = tx.objectStore('settings');
        const get = settings.get('settings');
        get.onsuccess = () => {
          settings.put({ ...(get.result ?? {}), id: 'settings', sampleMode: false });
        };
        tx.objectStore('fillUps').put({
          id: 'voice-real-f1',
          carId: 'sample-car',
          odometer: 45000,
          liters: 40,
          cost: 560,
          unitPrice: 14,
          tankFull: true,
          fuelGrade: 'gasoline92',
          currency: 'EGP',
          distanceKm: 500,
          date: day,
          createdAt: `${day}T10:00:00.000Z`,
          updatedAt: `${day}T10:00:00.000Z`,
        });
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

test.describe('Voice quick-log', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
  });

  test('mic is hidden when the browser has no speech recognition', async ({ page }) => {
    const issues = watchConsole(page);
    await stubVoice(page, false);
    await openFillUp(page);
    await expect(page.locator('app-voice-log .voice-mic')).toHaveCount(0);
    await expectNoAppErrors(issues);
  });

  test('a spoken fill-up populates the form after review confirm', async ({ page }) => {
    const issues = watchConsole(page);
    await stubVoice(page, true);
    await openFillUp(page);
    const voice = page.locator('app-voice-log');
    await voice.getByRole('button', { name: 'Log by voice' }).click();
    await expect(voice.getByRole('button', { name: 'Listening…' })).toBeVisible();
    await speak(page, '40 liters 500 km gasoline 95');
    const review = voice.locator('.voice-review');
    await expect(review).toBeVisible();
    await expect(review.locator('.voice-chip')).toHaveCount(3);
    await review.evaluate((el) => el.scrollIntoView({ block: 'center' }));
    await voice.screenshot({ path: '.qa/voice-review-en.png' });
    await voice.getByRole('button', { name: 'Use these values' }).click();
    await expect(voice.locator('.voice-review')).toHaveCount(0);
    await expect(page.getByLabel('Liters', { exact: true })).toHaveValue('40');
    await expect(page.getByLabel(/Distance/)).toHaveValue('500');
    await expectNoAppErrors(issues);
  });

  test('cancel discards a late recognition result', async ({ page }) => {
    const issues = watchConsole(page);
    await stubVoice(page, true);
    await openFillUp(page);
    const voice = page.locator('app-voice-log');
    await voice.getByRole('button', { name: 'Log by voice' }).click();
    await expect(voice.getByRole('button', { name: 'Listening…' })).toBeVisible();
    await voice.getByRole('button', { name: 'Cancel', exact: true }).click();
    await speak(page, '40 liters 500 km gasoline 95');
    await page.waitForTimeout(200);
    await expect(voice.locator('.voice-review')).toHaveCount(0);
    await expect(voice.locator('.voice-error')).toHaveCount(0);
    await expect(voice.getByRole('button', { name: 'Log by voice' })).toBeVisible();
    await expect(page.getByLabel('Liters', { exact: true })).toHaveValue('');
    await expectNoAppErrors(issues);
  });

  test('a denied microphone shows a friendly fallback', async ({ page }) => {
    const issues = watchConsole(page);
    await stubVoice(page, true);
    await openFillUp(page);
    const voice = page.locator('app-voice-log');
    await voice.getByRole('button', { name: 'Log by voice' }).click();
    await page.evaluate(() => {
      window.__voiceRec?.onerror?.({ error: 'not-allowed' });
    });
    const err = voice.locator('.voice-error');
    await expect(err).toBeVisible();
    await expect(err).toContainText('Microphone is blocked');
    await expect(voice.locator('.voice-review')).toHaveCount(0);
    await voice.evaluate((el) => el.scrollIntoView({ block: 'center' }));
    await voice.screenshot({ path: '.qa/voice-error-en.png' });
    await expectNoAppErrors(issues);
  });

  test('Arabic RTL renders the localized mic without overflow', async ({ page }) => {
    const issues = watchConsole(page);
    await stubVoice(page, true);
    await ensureSampleCar(page);
    await page.goto('/fill-up');
    await dismissWhatsNewIfOpen(page);
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    const voice = page.locator('app-voice-log');
    await expect(voice.getByRole('button', { name: 'سجّل بصوتك' })).toBeVisible();
    const card = page.locator('.console').first();
    const fits = await card.evaluate((el) => el.scrollWidth <= el.clientWidth + 1);
    expect(fits, 'RTL console overflows horizontally').toBe(true);
    await voice.evaluate((el) => el.scrollIntoView({ block: 'center' }));
    await voice.screenshot({ path: '.qa/voice-log-ar.png' });
    await expectNoAppErrors(issues);
  });

  test('home quick-log accepts a spoken fill-up on the normal surface', async ({ page }) => {
    const issues = watchConsole(page);
    await stubVoice(page, true);
    await ensureSampleCar(page);
    await ensureEnglishUi(page);
    await seedRealFill(page);
    await page.goto('/');
    await dismissWhatsNewIfOpen(page);
    const quick = page.locator('app-quick-log');
    await expect(quick).toBeVisible();
    const voice = quick.locator('app-voice-log');
    await expect(voice.getByRole('button', { name: 'Log by voice' })).toBeVisible();
    await quick.evaluate((el) => el.scrollIntoView({ block: 'center' }));
    await quick.screenshot({ path: '.qa/voice-quick-log-en.png' });
    await voice.getByRole('button', { name: 'Log by voice' }).click();
    await speak(page, '30 liters 200 km');
    await expect(voice.locator('.voice-review')).toBeVisible();
    await voice.getByRole('button', { name: 'Use these values' }).click();
    await expect(quick.getByLabel('Liters', { exact: true })).toHaveValue('30');
    await expect(quick.getByLabel(/Distance/)).toHaveValue('200');
    await expectNoAppErrors(issues);
  });
});