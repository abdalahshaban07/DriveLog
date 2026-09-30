
/** Marketing/splash version. Bump for v1.6 — do not use package.json 0.0.0. */
export const APP_VERSION = '1.6';

export const DB_NAME = 'drivelog';
export const DB_VERSION = 6;
export const BACKUP_VERSION = 6;

export const DUE_SOON_DAYS = 14;
export const DUE_SOON_KM = 500;

export const DEFAULT_CURRENCY = 'EGP';
export const DEFAULT_LANGUAGE = 'ar' as const;
export const DEFAULT_THEME = 'system' as const;
export const DEFAULT_UNIT_SYSTEM = 'metric' as const;

export const DEFAULT_SOON_THRESHOLD = 0.2;
export const HISTORY_CONSISTENCY_RATIO = 0.2;

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
  'vehicleDocuments',
  'preTripChecks',
  'chargeSessions',
] as const;

export const MILESTONE_INTERVAL_KM = 10_000;
