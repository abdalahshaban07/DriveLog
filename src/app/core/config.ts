export const APP_NAME_EN = 'DriveLog';
export const APP_NAME_AR = 'سجل القيادة';
export const APP_SUBTITLE_EN = 'Fuel, maintenance & reminders';
export const APP_SUBTITLE_AR = 'الوقود والصيانة والتذكيرات';
/** Marketing/splash version. Bump for v1.6 — do not use package.json 0.0.0. */
export const APP_VERSION = '1.6';

export const DB_NAME = 'drivelog';
export const DB_VERSION = 5;
export const BACKUP_VERSION = 5;

export const DUE_SOON_DAYS = 14;
export const DUE_SOON_KM = 500;

export const DEFAULT_CURRENCY = 'EGP';
export const DEFAULT_LANGUAGE = 'ar' as const;
export const DEFAULT_THEME = 'system' as const;
export const DEFAULT_UNIT_SYSTEM = 'metric' as const;

export const DEFAULT_SOON_THRESHOLD = 0.2;
export const HISTORY_CONSISTENCY_RATIO = 0.2;
export const FORECAST_MONTHS = [3, 6, 12] as const;
export const RESERVE_LADDER = [1, 1.5, 2, 2.5, 3, 3.5, 4, 5, 7.5, 10] as const;

export const SCHEMA_STORES = [
  'car',
  'settings',
  'fillUps',
  'maintenance',
  'expensePeriods',
  'breakdowns',
  'otherExpenses',
  'milestones',
  'parts',
  'partOverrides',
  'healthNotificationState',
] as const;

export const MILESTONE_INTERVAL_KM = 10_000;
