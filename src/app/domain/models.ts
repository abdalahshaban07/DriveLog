export type Language = 'en' | 'ar';
export type Theme = 'system' | 'dark' | 'light' | 'contrast' | 'dusk';
export const THEMES: readonly Theme[] = ['system', 'light', 'dark', 'contrast', 'dusk'];
export type FuelGrade = 'gasoline92' | 'gasoline95' | 'diesel' | 'solar' | 'custom';
export type UnitSystem = 'metric';
export type MaintenanceType = 'oil' | 'filter' | 'tires' | 'brakes' | 'other';
export type BreakdownCategory = 'mechanical' | 'electrical' | 'other';
export type MilestoneTaskKind = 'oil' | 'filter' | 'tires' | 'brakes' | 'labor' | 'custom';
export type ExpenseCategory = 'fuel' | 'maintenance' | 'breakdown' | 'other';

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
  plate?: string;
  licenseExpiry?: DateOnly;
  registrationExpiry?: DateOnly;
  vin?: string;
  year?: string;
  make?: string;
  model?: string;
  /** US-market NHTSA count; null/undefined = not fetched. */
  recallCount?: number;
  /** Nominal tank size in liters (gauge + validation). */
  tankCapacityLiters?: number;
  createdAt: string;
  updatedAt: string;
}

export interface FillUp {
  id: string;
  carId?: string;
  odometer: number;
  /** Distance since previous fill (or setup); drives per-fill economy. */
  distanceKm?: number;
  liters: number;
  cost: number;
  tankFull: boolean;
  fuelGrade?: FuelGrade;
  /** Snapshot ¢/L at log time */
  unitPrice?: number;
  note?: string;
  placeLabel?: string;
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
  carId?: string;
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

export interface ExpensePeriod {
  id: string;
  carId: string;
  startDate: DateOnly;
  /** Omit = active open period. */
  endDate?: DateOnly;
}

export interface Breakdown {
  id: string;
  carId: string;
  symptom: string;
  repairCost: number;
  odometer: number;
  date: DateOnly;
  shopName?: string;
  category: BreakdownCategory;
  note?: string;
  createdAt: string;
  updatedAt: string;
}

export interface OtherExpense {
  id: string;
  carId: string;
  label: string;
  amount: number;
  date: DateOnly;
  note?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MaintenanceTask {
  id: string;
  kind: MilestoneTaskKind;
  label?: string;
  intervalKm?: number;
  lastDoneKm?: number;
  maintenanceId?: string;
}

export interface MaintenanceMilestone {
  id: string;
  carId: string;
  targetKm: number;
  scheduledDate?: DateOnly;
  tasks: MaintenanceTask[];
}

export interface Settings {
  language: Language;
  theme: Theme;
  currency: string;
  unitSystem: UnitSystem;
  installBannerDismissed: boolean;
  remindersEnabled: boolean;
  /** Active vehicle when multiple cars exist. */
  activeCarId?: string;
  /** Opt-in dusk theme suggestion around sunset. */
  duskAssistEnabled?: boolean;
  /** Last dismissed whats-new.json id (deploy notes). */
  lastSeenWhatsNewId?: string;
  /** First-run sample car is active. */
  sampleMode?: boolean;
  /** User dismissed Home setup checklist. */
  checklistDismissed?: boolean;
  /** User dismissed Home PWA install card. */
  installCardDismissed?: boolean;
  customMaintenanceTypes?: string[];
  assistantEnabled?: boolean;
  assistantApiKey?: string;
  assistantBaseUrl?: string;
  assistantModel?: string;
  /** Cached fuel tip text + day key. */
  fuelTipText?: string;
  fuelTipDay?: DateOnly;
  /**
   * @deprecated v3 only — migrated onto Car in DB v4.
   */
  licenseExpiry?: DateOnly;
  /**
   * @deprecated v3 only — migrated onto Car in DB v4.
   */
  registrationExpiry?: DateOnly;
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
  /** Legacy single-car field; prefer `cars` when present. */
  car: Car | null;
  cars?: Car[];
  settings: Settings;
  fillUps: FillUp[];
  maintenance: Maintenance[];
  expensePeriods?: ExpensePeriod[];
  breakdowns?: Breakdown[];
  otherExpenses?: OtherExpense[];
  milestones?: MaintenanceMilestone[];
}

export const MAINTENANCE_TYPES: readonly MaintenanceType[] = [
  'oil',
  'filter',
  'tires',
  'brakes',
  'other',
] as const;

export const BREAKDOWN_CATEGORIES: readonly BreakdownCategory[] = [
  'mechanical',
  'electrical',
  'other',
] as const;

export const DEFAULT_ASSISTANT_BASE_URL = 'https://api.openai.com/v1';
export const DEFAULT_ASSISTANT_MODEL = 'gpt-4o-mini';
