export type Language = 'en' | 'ar';
export type Theme = 'system' | 'dark' | 'light' | 'contrast' | 'dusk';
export const THEMES: readonly Theme[] = ['system', 'light', 'dark', 'contrast', 'dusk'];
/** Visual chrome pack (orthogonal to color Theme). */
export type Look =
  | 'receipt'
  | 'skeuo'
  | 'neu'
  | 'glass'
  | 'spatial'
  | 'neo'
  | 'aurora';
export const LOOKS: readonly Look[] = [
  'receipt',
  'skeuo',
  'neu',
  'glass',
  'spatial',
  'neo',
  'aurora',
] as const;
export const DEFAULT_LOOK: Look = 'receipt';
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
  year?: string;
  make?: string;
  model?: string;
  /** Nominal tank size in liters (gauge + validation). */
  tankCapacityLiters?: number;
  /** Mounted tire set label (F9). */
  activeTireSet?: 'A' | 'B';
  /** Last tire-set swap date. */
  tireSetSwappedAt?: DateOnly;
  /** Per-car maintenance budget envelope (9A). */
  maintenanceBudgetMonthly?: number;
  reserveTargetMonthly?: number;
  maintenanceReserveBalance?: number;
  /** Snapshot currency for maintenance costs (70B / 90A). */
  maintenanceCurrency?: string;
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
  /** Currency snapshot (45). */
  currency?: string;
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

export type MaintenanceRecordType =
  | 'replacement'
  | 'service'
  | 'inspection'
  | 'repair'
  | 'measurement';

export type PartCondition = 'good' | 'fair' | 'poor' | 'critical';

export type ClosedMeasurementType = 'tireTreadMm' | 'brakePadMm' | 'batteryVoltageV';

export interface Measurement {
  type: ClosedMeasurementType | string;
  value: number;
  unit: string;
}

export interface Observation {
  type: string;
  value: string | number | boolean;
  unit?: string;
}

export interface Maintenance {
  id: string;
  carId?: string;
  /** @deprecated Prefer partDefinitionId; kept for backup/export (5B). */
  type: MaintenanceType;
  odometer: number;
  /** Optional — unknown cost excluded from totals (51C). */
  cost?: number;
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
  partDefinitionId?: string;
  recordType?: MaintenanceRecordType;
  measurements?: Measurement[];
  condition?: PartCondition;
  partModel?: string;
  partNumber?: string;
  currency?: string;
  observations?: Observation[];
  odometerRollbackAcknowledged?: boolean;
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
  currency?: string;
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
  currency?: string;
  createdAt: string;
  updatedAt: string;
}

export type PartCategory =
  | 'ENGINE'
  | 'TRANSMISSION'
  | 'BRAKES'
  | 'TIRES'
  | 'ELECTRICAL'
  | 'COOLING'
  | 'DRIVETRAIN'
  | 'STEERING_SUSPENSION'
  | 'EXHAUST'
  | 'VISIBILITY'
  | 'OTHER';

export type PartSource = 'system' | 'custom';

export type PartTrackingMode =
  | 'interval'
  | 'measurement'
  | 'condition'
  | 'history'
  | 'none';

export type MeasurementDirection = 'lower-is-worse' | 'higher-is-worse';

export interface MeasurementRule {
  type: ClosedMeasurementType | string;
  unit: string;
  direction: MeasurementDirection;
  attentionValue?: number;
  criticalValue?: number;
}

export interface PartDefinition {
  id: string;
  /** Omitted for global system parts; set for per-car custom parts (6A). */
  carId?: string;
  /** Custom display name (user data). System parts use labelKey. */
  name?: string;
  /** i18n key for system parts. */
  labelKey?: string;
  category: PartCategory;
  source: PartSource;
  trackingMode: PartTrackingMode;
  intervalKm?: number;
  intervalMonths?: number;
  manufacturerIntervalKm?: number;
  manufacturerIntervalMonths?: number;
  userIntervalKm?: number;
  userIntervalMonths?: number;
  measurementRules?: MeasurementRule[];
  expectedCost?: number;
  expectedCostCurrency?: string;
  unit?: string;
  active: boolean;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PartOverride {
  id: string;
  carId: string;
  partDefinitionId: string;
  manufacturerIntervalKm?: number;
  manufacturerIntervalMonths?: number;
  userIntervalKm?: number;
  userIntervalMonths?: number;
  measurementRules?: MeasurementRule[];
  expectedCost?: number;
  expectedCostCurrency?: string;
  /** Migration/baseline seed for routine check (102B). */
  lastRoutineCheckKm?: number;
  active?: boolean;
  updatedAt: string;
}

export type HealthStatus =
  | 'good'
  | 'soon'
  | 'due'
  | 'overdue'
  | 'inspect'
  | 'unknown'
  | 'critical';

export type Confidence = 'low' | 'medium' | 'high';

export type HealthSource =
  | 'SYSTEM_RULE'
  | 'MANUFACTURER_RULE'
  | 'USER_RULE'
  | 'MEASUREMENT'
  | 'USER_HISTORY'
  | 'INSPECTION'
  | 'UNKNOWN';

export interface HealthNotificationState {
  id: string;
  carId: string;
  partDefinitionId: string;
  lastStatus?: HealthStatus;
  lastNotifiedStatus?: HealthStatus;
  lastBudgetHealth?: string;
  lastForecastFlag?: string;
  baselinedAt?: string;
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
  /** Visual look pack; default Night Receipt. */
  look: Look;
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
  /** ISO timestamp when real-car setup finished. */
  setupCompletedAt?: string;
  /** ISO timestamp of first non-sample fill-up. */
  firstRealFillAt?: string;
  /** ISO timestamp of first maintenance with dueDate or dueKm. */
  firstDueAt?: string;
  customMaintenanceTypes?: string[];
  /**
   * Use online (keyless) AI assistant. Default on when undefined.
   * Off forces local coach only.
   */
  assistantEnabled?: boolean;
  /** @deprecated Unused — zero-key gateways; discarded on import. */
  assistantApiKey?: string;
  /** @deprecated Unused — zero-key gateways; discarded on import. */
  assistantBaseUrl?: string;
  /** @deprecated Unused — zero-key gateways; discarded on import. */
  assistantModel?: string;
  soonThresholdRatio?: number;
  notifyMaintenance?: boolean;
  notifyBudget?: boolean;
  notifyForecast?: boolean;
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

export type VehicleDocKind =
  | 'license'
  | 'registration'
  | 'insurance'
  | 'inspection'
  | 'other';

/** Dates + notes only (no photo blobs). Vault SSOT for expiry. */
export interface VehicleDocument {
  id: string;
  carId: string;
  kind: VehicleDocKind;
  /** Custom label when kind === 'other'. */
  label?: string;
  expiryDate: DateOnly;
  note?: string;
  createdAt: string;
  updatedAt: string;
}

export const PRE_TRIP_ITEM_IDS = [
  'tires',
  'lights',
  'fluids',
  'brakes',
  'docs',
  'spare',
] as const;
export type PreTripItemId = (typeof PRE_TRIP_ITEM_IDS)[number];

export interface PreTripCheck {
  id: string;
  carId: string;
  date: DateOnly;
  items: Record<PreTripItemId, boolean>;
  ready: boolean;
  note?: string;
  createdAt: string;
}

export interface ChargeSession {
  id: string;
  carId: string;
  odometer: number;
  kWh: number;
  cost: number;
  date: DateOnly;
  placeLabel?: string;
  note?: string;
  currency?: string;
  /** Distance since previous charge when known. */
  distanceKm?: number;
  createdAt: string;
  updatedAt: string;
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
  parts?: PartDefinition[];
  partOverrides?: PartOverride[];
  healthNotificationState?: HealthNotificationState[];
  vehicleDocuments?: VehicleDocument[];
  preTripChecks?: PreTripCheck[];
  chargeSessions?: ChargeSession[];
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

export const PART_CATEGORIES: readonly PartCategory[] = [
  'ENGINE',
  'TRANSMISSION',
  'BRAKES',
  'TIRES',
  'ELECTRICAL',
  'COOLING',
  'DRIVETRAIN',
  'STEERING_SUSPENSION',
  'EXHAUST',
  'VISIBILITY',
  'OTHER',
] as const;

export const MAINTENANCE_RECORD_TYPES: readonly MaintenanceRecordType[] = [
  'replacement',
  'service',
  'inspection',
  'repair',
  'measurement',
] as const;

export const PART_CONDITIONS: readonly PartCondition[] = [
  'good',
  'fair',
  'poor',
  'critical',
] as const;

export const HEALTH_STATUSES: readonly HealthStatus[] = [
  'critical',
  'overdue',
  'due',
  'inspect',
  'soon',
  'good',
  'unknown',
] as const;
