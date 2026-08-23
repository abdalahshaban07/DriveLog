export const APP_NAME_EN = 'DriveLog';
export const APP_NAME_AR = 'سجل القيادة';
export const APP_SUBTITLE_EN = 'Fuel, maintenance & reminders';
export const APP_SUBTITLE_AR = 'الوقود والصيانة والتذكيرات';

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
