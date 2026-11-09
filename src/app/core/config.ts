
/** User-facing release on splash and about. Schema stays on DB_VERSION. */
export const APP_VERSION = '0.1';

export const DB_NAME = 'drivelog';
/** v8 adds the backupState meta store (auto-backup folder handle + cadence). */
export const DB_VERSION = 8;
export const BACKUP_VERSION = 7;

/** Meta store outside SCHEMA_STORES so import/wipe never clears the folder link. */
export const BACKUP_STATE_STORE = 'backupState';

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
  'fuelPriceHistory',
] as const;

export const MILESTONE_INTERVAL_KM = 10_000;
