import {
  DEFAULT_CURRENCY,
  DEFAULT_SOON_THRESHOLD,
  DEFAULT_THEME,
  DEFAULT_UNIT_SYSTEM,
} from '../core/config';
import {
  maintenanceDetailFields,
  normalizeCustomTypes,
} from '../domain/maintenance-fields';
import {
  BREAKDOWN_CATEGORIES,
  DEFAULT_LOOK,
  LOOKS,
  MAINTENANCE_RECORD_TYPES,
  MAINTENANCE_TYPES,
  PART_CATEGORIES,
  PART_CONDITIONS,
  PRE_TRIP_ITEM_IDS,
  THEMES,
  type Breakdown,
  type Car,
  type ChargeSession,
  type ExpensePeriod,
  type FillUp,
  type HealthNotificationState,
  type Look,
  type Maintenance,
  type MaintenanceMilestone,
  type MaintenanceTask,
  type MilestoneTaskKind,
  type OtherExpense,
  type PartDefinition,
  type PartOverride,
  type PartTrackingMode,
  type PreTripCheck,
  type PreTripItemId,
  type Settings,
  type Theme,
  type VehicleDocKind,
  type VehicleDocument,
} from '../domain/models';

export function nowIso(): string {
  return new Date().toISOString();
}

export function optFinite(v: unknown): number | undefined {
  if (v == null || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/** Newer updatedAt wins; equal → imported wins (82A). */
export function mergeByUpdatedAt<T>(
  existing: readonly T[],
  incoming: readonly T[],
  idOf: (x: T) => string,
  updatedOf: (x: T) => string | undefined,
): Map<string, T> {
  const map = new Map(existing.map((x) => [idOf(x), x]));
  for (const row of incoming) {
    const id = idOf(row);
    const prev = map.get(id);
    if (!prev) {
      map.set(id, row);
      continue;
    }
    const a = updatedOf(prev) ?? '';
    const b = updatedOf(row) ?? '';
    if (b >= a) {
      map.set(id, row);
    }
  }
  return map;
}

function carMetaFields(
  o?: Partial<Pick<Car, 'year' | 'make' | 'model'>> | null,
): Pick<Car, 'year' | 'make' | 'model'> {
  return {
    year: o?.year ? String(o.year) : undefined,
    make: o?.make ? String(o.make) : undefined,
    model: o?.model ? String(o.model) : undefined,
  };
}

export function carDocFields(
  o?: Partial<
    Pick<
      Car,
      | 'year'
      | 'make'
      | 'model'
      | 'plate'
      | 'licenseExpiry'
      | 'registrationExpiry'
      | 'tankCapacityLiters'
    >
  > | null,
): Pick<
  Car,
  | 'year'
  | 'make'
  | 'model'
  | 'plate'
  | 'licenseExpiry'
  | 'registrationExpiry'
  | 'tankCapacityLiters'
> {
  return {
    ...carMetaFields(o),
    plate: o?.plate ? String(o.plate).trim() : undefined,
    licenseExpiry: o?.licenseExpiry ? String(o.licenseExpiry) : undefined,
    registrationExpiry: o?.registrationExpiry ? String(o.registrationExpiry) : undefined,
    tankCapacityLiters:
      o?.tankCapacityLiters == null || !Number.isFinite(Number(o.tankCapacityLiters))
        ? undefined
        : Number(o.tankCapacityLiters),
  };
}

export function normalizeCar(raw: unknown): Car {
  const o = raw as Car;
  if (!o?.id || typeof o.nickname !== 'string') {
    throw new Error('backup.invalid');
  }
  return {
    id: String(o.id),
    nickname: String(o.nickname),
    initialOdometer: Number(o.initialOdometer),
    currentOdometer: Number(o.currentOdometer),
    ...carDocFields(o),
    activeTireSet: o.activeTireSet === 'B' ? 'B' : o.activeTireSet === 'A' ? 'A' : undefined,
    tireSetSwappedAt: o.tireSetSwappedAt ? String(o.tireSetSwappedAt) : undefined,
    maintenanceBudgetMonthly: optFinite(o.maintenanceBudgetMonthly),
    reserveTargetMonthly: optFinite(o.reserveTargetMonthly),
    maintenanceReserveBalance: optFinite(o.maintenanceReserveBalance),
    maintenanceCurrency: o.maintenanceCurrency
      ? String(o.maintenanceCurrency)
      : undefined,
    createdAt: String(o.createdAt),
    updatedAt: String(o.updatedAt),
  };
}

export function normalizeFillUp(raw: unknown): FillUp {
  const o = raw as FillUp;
  if (!o?.id || typeof o.odometer !== 'number') {
    throw new Error('backup.invalid');
  }
  return {
    id: String(o.id),
    carId: o.carId ? String(o.carId) : undefined,
    odometer: Number(o.odometer),
    distanceKm:
      o.distanceKm == null || !Number.isFinite(Number(o.distanceKm))
        ? undefined
        : Number(o.distanceKm),
    liters: Number(o.liters),
    cost: Number(o.cost),
    tankFull: Boolean(o.tankFull),
    note: o.note ? String(o.note) : undefined,
    date: String(o.date),
    lat: o.lat == null ? undefined : Number(o.lat),
    lon: o.lon == null ? undefined : Number(o.lon),
    tempC: o.tempC == null ? undefined : Number(o.tempC),
    weatherCode: o.weatherCode == null ? undefined : Number(o.weatherCode),
    fuelGrade: o.fuelGrade ? (o.fuelGrade as FillUp['fuelGrade']) : undefined,
    unitPrice: o.unitPrice == null ? undefined : Number(o.unitPrice),
    placeLabel: o.placeLabel ? String(o.placeLabel) : undefined,
    currency: o.currency ? String(o.currency) : undefined,
    createdAt: String(o.createdAt),
    updatedAt: String(o.updatedAt),
  };
}

export function normalizeMaintenance(raw: unknown): Maintenance {
  const o = raw as Maintenance;
  if (!o?.id || !MAINTENANCE_TYPES.includes(o.type)) {
    throw new Error('backup.invalid');
  }
  const cost =
    o.cost == null || o.cost === ('' as unknown) || !Number.isFinite(Number(o.cost))
      ? undefined
      : Number(o.cost);
  const recordType =
    o.recordType && MAINTENANCE_RECORD_TYPES.includes(o.recordType)
      ? o.recordType
      : undefined;
  return {
    id: String(o.id),
    carId: o.carId ? String(o.carId) : undefined,
    type: o.type,
    odometer: Number(o.odometer),
    cost,
    date: String(o.date),
    note: o.note ? String(o.note) : undefined,
    dueKm: o.dueKm == null ? undefined : Number(o.dueKm),
    dueDate: o.dueDate ? String(o.dueDate) : undefined,
    partDefinitionId: o.partDefinitionId ? String(o.partDefinitionId) : undefined,
    recordType,
    measurements: Array.isArray(o.measurements) ? o.measurements : undefined,
    condition:
      o.condition && PART_CONDITIONS.includes(o.condition) ? o.condition : undefined,
    partModel: o.partModel ? String(o.partModel) : undefined,
    partNumber: o.partNumber ? String(o.partNumber) : undefined,
    currency: o.currency ? String(o.currency) : undefined,
    observations: Array.isArray(o.observations) ? o.observations : undefined,
    odometerRollbackAcknowledged: o.odometerRollbackAcknowledged === true ? true : undefined,
    ...maintenanceDetailFields(o),
    createdAt: String(o.createdAt),
    updatedAt: String(o.updatedAt),
  };
}

export function normalizeExpensePeriod(raw: unknown): ExpensePeriod {
  const o = raw as ExpensePeriod;
  if (!o?.id || !o.carId || !o.startDate) {
    throw new Error('backup.invalid');
  }
  return {
    id: String(o.id),
    carId: String(o.carId),
    startDate: String(o.startDate),
    endDate: o.endDate ? String(o.endDate) : undefined,
  };
}

export function normalizeBreakdown(raw: unknown): Breakdown {
  const o = raw as Breakdown;
  if (
    !o?.id ||
    !o.carId ||
    typeof o.symptom !== 'string' ||
    !BREAKDOWN_CATEGORIES.includes(o.category)
  ) {
    throw new Error('backup.invalid');
  }
  return {
    id: String(o.id),
    carId: String(o.carId),
    symptom: String(o.symptom),
    repairCost: Number(o.repairCost),
    odometer: Number(o.odometer),
    date: String(o.date),
    shopName: o.shopName ? String(o.shopName) : undefined,
    category: o.category,
    note: o.note ? String(o.note) : undefined,
    currency: o.currency ? String(o.currency) : undefined,
    createdAt: String(o.createdAt),
    updatedAt: String(o.updatedAt),
  };
}

export function normalizeOtherExpense(raw: unknown): OtherExpense {
  const o = raw as OtherExpense;
  if (!o?.id || !o.carId || typeof o.label !== 'string') {
    throw new Error('backup.invalid');
  }
  return {
    id: String(o.id),
    carId: String(o.carId),
    label: String(o.label),
    amount: Number(o.amount),
    date: String(o.date),
    note: o.note ? String(o.note) : undefined,
    currency: o.currency ? String(o.currency) : undefined,
    createdAt: String(o.createdAt),
    updatedAt: String(o.updatedAt),
  };
}

const MILESTONE_TASK_KINDS: readonly MilestoneTaskKind[] = [
  'oil',
  'filter',
  'tires',
  'brakes',
  'labor',
  'custom',
] as const;

export function normalizeMaintenanceTask(raw: unknown): MaintenanceTask {
  const o = raw as MaintenanceTask;
  if (!o?.id || !MILESTONE_TASK_KINDS.includes(o.kind)) {
    throw new Error('backup.invalid');
  }
  return {
    id: String(o.id),
    kind: o.kind,
    label: o.label ? String(o.label) : undefined,
    intervalKm: o.intervalKm == null ? undefined : Number(o.intervalKm),
    lastDoneKm: o.lastDoneKm == null ? undefined : Number(o.lastDoneKm),
    maintenanceId: o.maintenanceId ? String(o.maintenanceId) : undefined,
  };
}

export function normalizeMilestone(raw: unknown): MaintenanceMilestone {
  const o = raw as MaintenanceMilestone;
  if (!o?.id || !o.carId || typeof o.targetKm !== 'number') {
    throw new Error('backup.invalid');
  }
  return {
    id: String(o.id),
    carId: String(o.carId),
    targetKm: Number(o.targetKm),
    scheduledDate: o.scheduledDate ? String(o.scheduledDate) : undefined,
    tasks: Array.isArray(o.tasks) ? o.tasks.map(normalizeMaintenanceTask) : [],
  };
}

function isTheme(v: unknown): v is Theme {
  return (THEMES as readonly string[]).includes(String(v));
}

function isLook(v: unknown): v is Look {
  return (LOOKS as readonly string[]).includes(String(v));
}

function cleanAssistantKey(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const key = raw.trim();
  if (key.length < 8 || key.length > 500) return undefined;
  return key;
}

export function normalizeSettings(raw: unknown): Settings {
  const o = raw as Settings;
  const soon =
    o.soonThresholdRatio == null ? DEFAULT_SOON_THRESHOLD : Number(o.soonThresholdRatio);
  return {
    language: o.language === 'en' ? 'en' : 'ar',
    theme: isTheme(o.theme) ? o.theme : DEFAULT_THEME,
    look: isLook(o.look) ? o.look : DEFAULT_LOOK,
    currency: String(o.currency || DEFAULT_CURRENCY),
    unitSystem: DEFAULT_UNIT_SYSTEM,
    installBannerDismissed: Boolean(o.installBannerDismissed),
    remindersEnabled: o.remindersEnabled === true,
    activeCarId: o.activeCarId ? String(o.activeCarId) : undefined,
    duskAssistEnabled: o.duskAssistEnabled === true ? true : undefined,
    lastSeenWhatsNewId: o.lastSeenWhatsNewId
      ? String(o.lastSeenWhatsNewId)
      : undefined,
    sampleMode: o.sampleMode === true ? true : undefined,
    checklistDismissed: o.checklistDismissed === true ? true : undefined,
    installCardDismissed: o.installCardDismissed === true ? true : undefined,
    setupCompletedAt: o.setupCompletedAt ? String(o.setupCompletedAt) : undefined,
    firstRealFillAt: o.firstRealFillAt ? String(o.firstRealFillAt) : undefined,
    firstDueAt: o.firstDueAt ? String(o.firstDueAt) : undefined,
    customMaintenanceTypes: normalizeCustomTypes(o.customMaintenanceTypes),
    // Persist online toggle and the on-device UnoRouter key. Backups still drop the key.
    assistantEnabled: o.assistantEnabled === false ? false : true,
    assistantApiKey: cleanAssistantKey(o.assistantApiKey),
    soonThresholdRatio: Number.isFinite(soon) ? soon : DEFAULT_SOON_THRESHOLD,
    notifyMaintenance: o.notifyMaintenance === false ? false : true,
    notifyBudget: o.notifyBudget === false ? false : true,
    notifyForecast: o.notifyForecast === false ? false : true,
    fuelTipText: o.fuelTipText ? String(o.fuelTipText) : undefined,
    fuelTipDay: o.fuelTipDay ? String(o.fuelTipDay) : undefined,
    healthInsightText: o.healthInsightText ? String(o.healthInsightText) : undefined,
    healthInsightDay: o.healthInsightDay ? String(o.healthInsightDay) : undefined,
    licenseExpiry: o.licenseExpiry ? String(o.licenseExpiry) : undefined,
    registrationExpiry: o.registrationExpiry
      ? String(o.registrationExpiry)
      : undefined,
  };
}

const TRACKING_MODES: readonly PartTrackingMode[] = [
  'interval',
  'measurement',
  'condition',
  'history',
  'none',
];

export function normalizePartDefinition(raw: unknown): PartDefinition {
  const o = raw as PartDefinition;
  if (!o?.id || !PART_CATEGORIES.includes(o.category)) {
    throw new Error('backup.invalid');
  }
  const trackingMode = TRACKING_MODES.includes(o.trackingMode as PartTrackingMode)
    ? (o.trackingMode as PartTrackingMode)
    : 'history';
  return {
    id: String(o.id),
    carId: o.carId ? String(o.carId) : undefined,
    name: o.name ? String(o.name) : undefined,
    labelKey: o.labelKey ? String(o.labelKey) : undefined,
    category: o.category,
    source: o.source === 'system' ? 'system' : 'custom',
    trackingMode,
    intervalKm: optFinite(o.intervalKm),
    intervalMonths: optFinite(o.intervalMonths),
    manufacturerIntervalKm: optFinite(o.manufacturerIntervalKm),
    manufacturerIntervalMonths: optFinite(o.manufacturerIntervalMonths),
    userIntervalKm: optFinite(o.userIntervalKm),
    userIntervalMonths: optFinite(o.userIntervalMonths),
    measurementRules: Array.isArray(o.measurementRules) ? o.measurementRules : undefined,
    expectedCost: optFinite(o.expectedCost),
    expectedCostCurrency: o.expectedCostCurrency
      ? String(o.expectedCostCurrency)
      : undefined,
    unit: o.unit ? String(o.unit) : undefined,
    active: o.active !== false,
    notes: o.notes ? String(o.notes) : undefined,
    createdAt: String(o.createdAt ?? nowIso()),
    updatedAt: String(o.updatedAt ?? nowIso()),
  };
}

export function normalizePartOverride(raw: unknown): PartOverride {
  const o = raw as PartOverride;
  if (!o?.id || !o.carId || !o.partDefinitionId) {
    throw new Error('backup.invalid');
  }
  return {
    id: String(o.id),
    carId: String(o.carId),
    partDefinitionId: String(o.partDefinitionId),
    manufacturerIntervalKm: optFinite(o.manufacturerIntervalKm),
    manufacturerIntervalMonths: optFinite(o.manufacturerIntervalMonths),
    userIntervalKm: optFinite(o.userIntervalKm),
    userIntervalMonths: optFinite(o.userIntervalMonths),
    measurementRules: Array.isArray(o.measurementRules) ? o.measurementRules : undefined,
    expectedCost: optFinite(o.expectedCost),
    expectedCostCurrency: o.expectedCostCurrency
      ? String(o.expectedCostCurrency)
      : undefined,
    lastRoutineCheckKm: optFinite(o.lastRoutineCheckKm),
    active: o.active,
    updatedAt: String(o.updatedAt ?? nowIso()),
  };
}

export function normalizeHealthNotificationState(raw: unknown): HealthNotificationState {
  const o = raw as HealthNotificationState;
  if (!o?.id || !o.carId || !o.partDefinitionId) {
    throw new Error('backup.invalid');
  }
  return {
    id: String(o.id),
    carId: String(o.carId),
    partDefinitionId: String(o.partDefinitionId),
    lastStatus: o.lastStatus,
    lastNotifiedStatus: o.lastNotifiedStatus,
    lastBudgetHealth: o.lastBudgetHealth ? String(o.lastBudgetHealth) : undefined,
    lastForecastFlag: o.lastForecastFlag ? String(o.lastForecastFlag) : undefined,
    baselinedAt: o.baselinedAt ? String(o.baselinedAt) : undefined,
    updatedAt: String(o.updatedAt ?? nowIso()),
  };
}

const VEHICLE_DOC_KINDS: readonly VehicleDocKind[] = [
  'license',
  'registration',
  'insurance',
  'inspection',
  'other',
];

export function normalizeVehicleDocument(raw: unknown): VehicleDocument {
  const o = raw as VehicleDocument;
  if (!o?.id || !o.carId || !o.expiryDate) {
    throw new Error('backup.invalid');
  }
  const kind = VEHICLE_DOC_KINDS.includes(o.kind) ? o.kind : 'other';
  return {
    id: String(o.id),
    carId: String(o.carId),
    kind,
    label: o.label ? String(o.label) : undefined,
    expiryDate: String(o.expiryDate),
    note: o.note ? String(o.note) : undefined,
    createdAt: String(o.createdAt ?? nowIso()),
    updatedAt: String(o.updatedAt ?? nowIso()),
  };
}

export function normalizePreTripCheck(raw: unknown): PreTripCheck {
  const o = raw as PreTripCheck;
  if (!o?.id || !o.carId || !o.date) {
    throw new Error('backup.invalid');
  }
  const items = {} as Record<PreTripItemId, boolean>;
  for (const id of PRE_TRIP_ITEM_IDS) {
    items[id] = Boolean(o.items?.[id]);
  }
  return {
    id: String(o.id),
    carId: String(o.carId),
    date: String(o.date),
    items,
    ready: Boolean(o.ready),
    note: o.note ? String(o.note) : undefined,
    createdAt: String(o.createdAt ?? nowIso()),
  };
}

export function normalizeChargeSession(raw: unknown): ChargeSession {
  const o = raw as ChargeSession;
  if (!o?.id || !o.carId || typeof o.odometer !== 'number') {
    throw new Error('backup.invalid');
  }
  return {
    id: String(o.id),
    carId: String(o.carId),
    odometer: Number(o.odometer),
    kWh: Number(o.kWh),
    cost: Number(o.cost),
    date: String(o.date),
    placeLabel: o.placeLabel ? String(o.placeLabel) : undefined,
    note: o.note ? String(o.note) : undefined,
    currency: o.currency ? String(o.currency) : undefined,
    distanceKm: optFinite(o.distanceKm),
    createdAt: String(o.createdAt ?? nowIso()),
    updatedAt: String(o.updatedAt ?? nowIso()),
  };
}
