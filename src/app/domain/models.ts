export type Language = 'en' | 'ar';
export type Theme = 'system' | 'dark' | 'light' | 'contrast' | 'dusk';
export const THEMES: readonly Theme[] = ['system', 'light', 'dark', 'contrast', 'dusk'];
export type FuelGrade = 'gasoline92' | 'gasoline95' | 'diesel' | 'solar' | 'custom';
export type UnitSystem = 'metric';
export type MaintenanceType = 'oil' | 'filter' | 'tires' | 'brakes' | 'other';

export type DueStatus = 'overdue' | 'dueSoon' | 'future';
export type DueSource = 'license' | 'registration' | 'maintenance';

/** Calendar date as YYYY-MM-DD (no timezone shift). */
export type DateOnly = string;

export interface Car {
  id: string;
  nickname: string;
  /** Immutable setup reading. */
  initialOdometer: number;
  currentOdometer: number;
  vin?: string;
  year?: string;
  make?: string;
  model?: string;
  /** US-market NHTSA count; null/undefined = not fetched. */
  recallCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface FillUp {
  id: string;
  odometer: number;
  liters: number;
  cost: number;
  tankFull: boolean;
  fuelGrade?: FuelGrade;
  /** Snapshot ¢/L at log time */
  unitPrice?: number;
  note?: string;
  date: DateOnly;
  lat?: number;
  lon?: number;
  tempC?: number;
  weatherCode?: number;
  createdAt: string;
  updatedAt: string;
}

export interface Maintenance {
  id: string;
  type: MaintenanceType;
  odometer: number;
  cost: number;
  date: DateOnly;
  note?: string;
  dueKm?: number;
  dueDate?: DateOnly;
  centerName?: string;
  technicianName?: string;
  partBrand?: string;
  partCost?: number;
  laborCost?: number;
  /** Set when type is `other` and the user named it. */
  otherLabel?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Settings {
  language: Language;
  theme: Theme;
  currency: string;
  unitSystem: UnitSystem;
  installBannerDismissed: boolean;
  remindersEnabled: boolean;
  /** Last dismissed whats-new.json id (deploy notes). */
  lastSeenWhatsNewId?: string;
  licenseExpiry?: DateOnly;
  registrationExpiry?: DateOnly;
  customMaintenanceTypes?: string[];
}

export interface DueItem {
  id: string;
  source: DueSource;
  labelKey: string;
  labelParams?: Record<string, string | number>;
  status: DueStatus;
  dueKm?: number;
  dueDate?: DateOnly;
  maintenanceId?: string;
}

export interface EconomySegment {
  startId: string;
  endId: string;
  distanceKm: number;
  litersPer100Km: number;
  costPerKm: number;
  totalCost: number;
}

export interface BackupFile {
  version: number;
  exportedAt: string;
  car: Car | null;
  settings: Settings;
  fillUps: FillUp[];
  maintenance: Maintenance[];
}

export const MAINTENANCE_TYPES: readonly MaintenanceType[] = [
  'oil',
  'filter',
  'tires',
  'brakes',
  'other',
] as const;
