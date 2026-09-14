export const APP_NAME_EN = 'DriveLog';
export const APP_NAME_AR = 'سجل القيادة';
export const APP_SUBTITLE_EN = 'Fuel, maintenance & reminders';
export const APP_SUBTITLE_AR = 'الوقود والصيانة والتذكيرات';
/** Marketing/splash version. Bump for v1.3 — do not use package.json 0.0.0. */
export const APP_VERSION = '1.2';

export const DB_NAME = 'drivelog';
export const DB_VERSION = 4;
export const BACKUP_VERSION = 4;

export const DUE_SOON_DAYS = 14;
export const DUE_SOON_KM = 500;

export const DEFAULT_CURRENCY = 'EGP';
export const DEFAULT_LANGUAGE = 'ar' as const;
export const DEFAULT_THEME = 'system' as const;
export const DEFAULT_UNIT_SYSTEM = 'metric' as const;

export const SCHEMA_STORES = [
  'car',
  'settings',
  'fillUps',
  'maintenance',
  'expensePeriods',
  'breakdowns',
  'otherExpenses',
  'milestones',
] as const;

export const MILESTONE_INTERVAL_KM = 10_000;

/** OpenChargeMap key — optional; empty falls back to OSM charge nodes. Get a free key at openchargemap.org profile apps. */
export const OCM_API_KEY = '';

/**
 * Deployed Cloudflare Worker (Groq key in Worker secrets only).
 * Empty = local coach templates only.
 * @see workers/coach-proxy/README.md
 */
export const COACH_PROXY_URL =
  'https://drivelog-coach.abdalahshaban129.workers.dev';

/** Local `wrangler dev` — use on localhost to dodge corp proxies (Zscaler) blocking workers.dev. */
export const COACH_PROXY_URL_LOCAL = 'http://127.0.0.1:8787';

/** Optional override; Worker default is allam-2-7b. */
export const COACH_MODEL = '';

/** Production Worker on Pages; local wrangler on localhost / 127.0.0.1. */
export function resolveCoachProxyUrl(): string {
  if (!COACH_PROXY_URL && !COACH_PROXY_URL_LOCAL) {
    return '';
  }
  if (typeof location !== 'undefined') {
    const host = location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') {
      return COACH_PROXY_URL_LOCAL || COACH_PROXY_URL;
    }
  }
  return COACH_PROXY_URL;
}
