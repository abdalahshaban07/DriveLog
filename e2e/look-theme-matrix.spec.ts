import { test, expect } from '@playwright/test';
import {
  LOOK_LABELS,
  THEME_LABELS,
  assertDockClearsNav,
  dismissWhatsNewIfOpen,
  ensureEnglishUi,
  ensureSampleCar,
  readTokenContrast,
  setAppearance,
  watchConsole,
} from './helpers';

const LOOKS = Object.keys(LOOK_LABELS) as (keyof typeof LOOK_LABELS)[];
const THEMES = Object.keys(THEME_LABELS) as (keyof typeof THEME_LABELS)[];

const PAGES = ['/', '/fuel', '/maintenance', '/history/fill-ups', '/more', '/settings'];

/** Pages whose fixed docks must clear the bottom nav. */
const DOCKS: Record<string, string> = {
  '/fuel': '.fuel-dock',
  '/maintenance': '.dock',
};

// Settings lazily fetches country currencies; keep that call offline-stable.
test.beforeEach(async ({ page }) => {
  await page.route('**restcountries.com/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  );
  // The daily page-line polish POSTs to the free LLM gateway; stub it so
  // rate-limit 429s can't fail the visual matrix.
  await page.route('**/chat/completions**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ choices: [{ message: { content: 'Polished line.' } }] }),
    }),
  );
});

for (const look of LOOKS) {
  for (const theme of THEMES) {
    test(`look ${look} x theme ${theme}`, async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 812 });
      const issues = watchConsole(page);
      await ensureSampleCar(page);
      await ensureEnglishUi(page);
      await setAppearance(page, look, theme);

      for (const path of PAGES) {
        await page.goto(path);
        await dismissWhatsNewIfOpen(page);
        await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible();

        const contrast = await readTokenContrast(page);
        for (const entry of contrast) {
          // Muted secondary text has a lighter bar than primary text.
          const floor = entry.pair.startsWith('--muted') ? 3 : 4.5;
          expect(
            entry.ratio,
            `${look}/${theme} ${path}: ${entry.pair} = ${entry.ratio.toFixed(2)} (< ${floor})`,
          ).toBeGreaterThanOrEqual(floor);
        }

        const dock = DOCKS[path];
        if (dock) await assertDockClearsNav(page, dock);

        if (path === '/' || path === '/fuel') {
          await page.screenshot({
            path: `public/screenshots/matrix/${look}-${theme}${path === '/' ? '-home' : '-fuel'}.png`,
          });
        }
      }

      expect(issues, `${look}/${theme} console issues`).toEqual([]);
    });
  }
}
