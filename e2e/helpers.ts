import { expect, type Page } from '@playwright/test';

/** Theme option labels as rendered after we pin the UI to English. */
export const THEME_LABELS = { dark: 'Dark', light: 'Light', contrast: 'Contrast' } as const;

/** Look option labels from settings.look.* (en.ts). */
export const LOOK_LABELS: Record<string, string> = {
  receipt: 'Night Receipt',
  skeuo: 'Pump Console',
  neu: 'Soft Clay',
  glass: 'Amber Glass',
  spatial: 'Cold Spatial',
  neo: 'Fuel Stamp',
  aurora: 'Aurora Mesh',
  plasma: 'Liquid Plasma',
};

export async function dismissWhatsNewIfOpen(page: Page): Promise<void> {
  const sheet = page.locator('dialog.update-sheet[open]');
  try {
    await sheet.waitFor({ state: 'visible', timeout: 2_000 });
  } catch {
    return;
  }
  await page
    .getByRole('button', { name: /got it|تمام|later|بعدين/i })
    .first()
    .click();
  await expect(sheet).toBeHidden({ timeout: 5_000 });
}

/** Fresh browsers land on /setup — sample car unlocks guarded routes. */
export async function ensureSampleCar(page: Page): Promise<void> {
  await page.goto('/setup');
  await dismissWhatsNewIfOpen(page);
  const sample = page.getByRole('button', { name: /sample car|تجريبية/i });
  if (await sample.isVisible().catch(() => false)) {
    await sample.click();
    await page.waitForURL((url) => !url.pathname.includes('/setup'), { timeout: 15_000 });
  } else {
    await page.goto('/');
  }
  await dismissWhatsNewIfOpen(page);
}

/** Open a settings combobox and pick the exact option. */
async function chooseSetting(page: Page, label: string, option: string): Promise<void> {
  await page.getByRole('button', { name: label, exact: true }).click();
  await page.getByRole('option', { name: option, exact: true }).click();
}

/** Pin language to English so matrix selectors are stable. */
export async function ensureEnglishUi(page: Page): Promise<void> {
  const root = page.locator('html');
  if ((await root.getAttribute('lang')) === 'en') return;
  await page.goto('/settings');
  await dismissWhatsNewIfOpen(page);
  // The first run may be Arabic; reach English through either label.
  await page.getByRole('button', { name: /^(Language|اللغة)$/ }).click();
  await page.getByRole('option', { name: /^(English|الإنجليزية)$/ }).click();
  await expect(root).toHaveAttribute('lang', 'en', { timeout: 5_000 });
}

/** Drive /settings selects to a look + theme; both persist in the DB. */
export async function setAppearance(
  page: Page,
  look: keyof typeof LOOK_LABELS,
  theme: keyof typeof THEME_LABELS,
): Promise<void> {
  await page.goto('/settings');
  await dismissWhatsNewIfOpen(page);
  const root = page.locator('html');
  if ((await root.getAttribute('data-theme')) !== theme) {
    await chooseSetting(page, 'Theme', THEME_LABELS[theme]);
  }
  if ((await root.getAttribute('data-look')) !== look) {
    await chooseSetting(page, 'Look', LOOK_LABELS[look]);
  }
  await expect(root).toHaveAttribute('data-look', look);
  await expect(root).toHaveAttribute('data-theme', theme);
}

export type ConsoleIssue = { type: string; text: string; url?: string };

/** Collect console errors + unhandled page errors; benign asset noise is filtered. */
export function watchConsole(page: Page): ConsoleIssue[] {
  const issues: ConsoleIssue[] = [];
  const benign = /favicon|\.webmanifest|drivelog-sw|net::ERR_ABORTED.*fonts/i;
  page.on('console', (msg) => {
    if (msg.type() === 'error' && !benign.test(msg.text())) {
      const url = msg.location()?.url;
      issues.push({ type: 'console', text: msg.text(), ...(url ? { url } : {}) });
    }
  });
  page.on('pageerror', (err) => issues.push({ type: 'pageerror', text: String(err) }));
  return issues;
}

export type TokenContrast = { pair: string; ratio: number };

/**
 * WCAG ratio for token pairs resolved through the live cascade —
 * catches look/theme source-order regressions a static file read can't.
 */
export function readTokenContrast(page: Page): Promise<TokenContrast[]> {
  return page.evaluate(() => {
    const probe = document.createElement('div');
    probe.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
    document.body.appendChild(probe);
    const rootStyle = getComputedStyle(document.documentElement);
    const resolve = (token: string): string | null => {
      const value = rootStyle.getPropertyValue(token).trim();
      if (!value || value.includes('gradient') || value.includes('url(')) return null;
      probe.style.color = '';
      probe.style.color = value;
      const rgb = getComputedStyle(probe).color;
      return rgb && rgb !== 'rgba(0, 0, 0, 0)' ? rgb : null;
    };
    // Computed colors arrive as rgb()/rgba() or color(srgb r g b / a) with 0-1 floats.
    const parse = (c: string): { rgb: number[]; a: number } => {
      const srgb = c.match(
        /^color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)(?:\s*\/\s*([\d.]+))?\)/,
      );
      if (srgb) {
        return {
          rgb: [Number(srgb[1]) * 255, Number(srgb[2]) * 255, Number(srgb[3]) * 255],
          a: srgb[4] === undefined ? 1 : Number(srgb[4]),
        };
      }
      const parts = (c.match(/[\d.]+/g) ?? ['0', '0', '0']).map(Number);
      return { rgb: parts.slice(0, 3), a: parts.length > 3 ? parts[3]! : 1 };
    };
    // Translucent tokens are painted over the page background, not a void.
    const over = (fg: string, bg: number[]): number[] => {
      const { rgb, a } = parse(fg);
      return rgb.map((v, i) => v * a + bg[i] * (1 - a));
    };
    const lum = (c: number[]): number => {
      const ch = (v: number) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * ch(c[0]) + 0.7152 * ch(c[1]) + 0.0722 * ch(c[2]);
    };
    const ratio = (a: number[], b: number[]): number => {
      const la = lum(a);
      const lb = lum(b);
      const [hi, lo] = la > lb ? [la, lb] : [lb, la];
      return (hi + 0.05) / (lo + 0.05);
    };
    const pairs: [string, string][] = [
      ['--text', '--bg'],
      ['--muted', '--bg'],
      ['--paper-text', '--fill-paper'],
    ];
    const out: TokenContrast[] = [];
    const base = resolve('--bg') ?? 'rgb(0, 0, 0)';
    const baseRgb = parse(base).rgb;
    for (const [fg, bg] of pairs) {
      const fgRgb = resolve(fg);
      const bgRgb = resolve(bg);
      if (fgRgb && bgRgb) {
        const bgPaint = over(bgRgb, baseRgb);
        out.push({
          pair: `${fg} on ${bg}`,
          ratio: ratio(over(fgRgb, bgPaint), bgPaint),
        });
      }
    }
    probe.remove();
    return out;
  });
}

/** Fixed docks must float above the nav, never land on top of it. */
export async function assertDockClearsNav(page: Page, dockSelector: string): Promise<void> {
  const dock = page.locator(dockSelector).first();
  if (!(await dock.isVisible().catch(() => false))) return;
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(150);
  const dockBox = await dock.boundingBox();
  const navBox = await page.getByRole('navigation', { name: 'Primary' }).boundingBox();
  if (!dockBox || !navBox) return;
  const overlapsNav = dockBox.y < navBox.y + navBox.height && dockBox.y + dockBox.height > navBox.y;
  expect(overlapsNav, `${dockSelector} overlaps the primary nav`).toBe(false);
}
