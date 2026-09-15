import { MILESTONE_INTERVAL_KM, DEFAULT_SOON_THRESHOLD } from '../core/config';
import { ROUTINE_CHECK_PART_ID, mergePartCatalog } from './part-catalog';
import { estimateIntervalFromHistory, lastResetRecord } from './history-analyzer';
import {
  calcIntervalStatus,
  worseStatus,
  type IntervalStatusResult,
} from './maintenance-calc';
import {
  conditionToStatus,
  measurementThresholdStatus,
  projectWear,
} from './measurement-intel';
import type {
  Car,
  Confidence,
  DateOnly,
  HealthSource,
  HealthStatus,
  Maintenance,
  PartDefinition,
  PartOverride,
  Settings,
} from './models';

export type HealthItem = {
  partDefinitionId: string;
  part: PartDefinition;
  status: HealthStatus;
  reasons: string[];
  confidence: Confidence;
  primarySource: HealthSource;
  sources: HealthSource[];
  remainingKm?: number;
  remainingMonths?: number;
  dueKm?: number;
  dueDate?: DateOnly;
  lastServiceDate?: DateOnly;
  lastServiceOdo?: number;
  conditionDate?: DateOnly;
  wearKmEstimate?: number;
};

function mergePart(
  base: PartDefinition,
  ov: PartOverride | undefined,
): PartDefinition {
  if (!ov) return base;
  return {
    ...base,
    manufacturerIntervalKm: ov.manufacturerIntervalKm ?? base.manufacturerIntervalKm,
    manufacturerIntervalMonths:
      ov.manufacturerIntervalMonths ?? base.manufacturerIntervalMonths,
    userIntervalKm: ov.userIntervalKm ?? base.userIntervalKm,
    userIntervalMonths: ov.userIntervalMonths ?? base.userIntervalMonths,
    measurementRules: ov.measurementRules ?? base.measurementRules,
    expectedCost: ov.expectedCost ?? base.expectedCost,
    expectedCostCurrency: ov.expectedCostCurrency ?? base.expectedCostCurrency,
    active: ov.active === false ? false : base.active,
  };
}

function resolveKmInterval(
  part: PartDefinition,
  historyKm: number | null,
): { intervalKm: number; source: HealthSource } | null {
  if (part.userIntervalKm != null && part.userIntervalKm > 0) {
    return { intervalKm: part.userIntervalKm, source: 'USER_RULE' };
  }
  if (part.manufacturerIntervalKm != null && part.manufacturerIntervalKm > 0) {
    return { intervalKm: part.manufacturerIntervalKm, source: 'MANUFACTURER_RULE' };
  }
  if (part.intervalKm != null && part.intervalKm > 0) {
    return { intervalKm: part.intervalKm, source: 'SYSTEM_RULE' };
  }
  if (historyKm != null && historyKm > 0) {
    return { intervalKm: historyKm, source: 'USER_HISTORY' };
  }
  return null;
}

function resolveMonthInterval(
  part: PartDefinition,
): { intervalMonths: number; source: HealthSource } | null {
  if (part.userIntervalMonths != null && part.userIntervalMonths > 0) {
    return { intervalMonths: part.userIntervalMonths, source: 'USER_RULE' };
  }
  if (part.manufacturerIntervalMonths != null && part.manufacturerIntervalMonths > 0) {
    return {
      intervalMonths: part.manufacturerIntervalMonths,
      source: 'MANUFACTURER_RULE',
    };
  }
  if (part.intervalMonths != null && part.intervalMonths > 0) {
    return { intervalMonths: part.intervalMonths, source: 'SYSTEM_RULE' };
  }
  return null;
}

function isPartActive(
  part: PartDefinition,
  ov: PartOverride | undefined,
  hasRecords: boolean,
): boolean {
  if (part.id === ROUTINE_CHECK_PART_ID) return true; // 105A
  if (part.source === 'custom') return part.active !== false;
  if (ov?.active === false) return false;
  if (ov?.active === true) return true;
  return hasRecords;
}

export function buildHealthItems(input: {
  car: Car;
  today: DateOnly;
  maintenance: readonly Maintenance[];
  customParts: readonly PartDefinition[];
  overrides: readonly PartOverride[];
  settings: Settings;
}): HealthItem[] {
  const soon = input.settings.soonThresholdRatio ?? DEFAULT_SOON_THRESHOLD;
  const catalog = mergePartCatalog(input.customParts);
  const byPartRecords = new Map<string, Maintenance[]>();
  for (const m of input.maintenance) {
    if (!m.partDefinitionId) continue;
    if (m.carId && m.carId !== input.car.id) continue;
    const list = byPartRecords.get(m.partDefinitionId) ?? [];
    list.push(m);
    byPartRecords.set(m.partDefinitionId, list);
  }

  const items: HealthItem[] = [];

  for (const base of catalog) {
    const ov = input.overrides.find(
      (o) => o.carId === input.car.id && o.partDefinitionId === base.id,
    );
    const part = mergePart(base, ov);
    const records = byPartRecords.get(part.id) ?? [];
    if (!isPartActive(part, ov, records.length > 0)) continue;

    const reasons: string[] = [];
    let status: HealthStatus = 'unknown';
    let confidence: Confidence = 'low';
    let primarySource: HealthSource = 'UNKNOWN';
    const sources: HealthSource[] = [];
    let remainingKm: number | undefined;
    let remainingMonths: number | undefined;
    let dueKm: number | undefined;
    let dueDate: DateOnly | undefined;
    let wearKmEstimate: number | undefined;

    const lastReset = lastResetRecord(input.maintenance, part.id);
    const latest = [...records].sort(
      (a, b) => b.date.localeCompare(a.date) || b.odometer - a.odometer,
    )[0];

    // Explicit due on latest reset wins (57A).
    if (lastReset && (lastReset.dueKm != null || lastReset.dueDate)) {
      if (lastReset.dueKm != null) {
        const rem = lastReset.dueKm - input.car.currentOdometer;
        if (rem < 0) status = 'overdue';
        else if (rem === 0) status = 'due';
        else if (rem / Math.max(1, lastReset.dueKm - (lastReset.odometer ?? 0)) <= soon) {
          status = 'soon';
        } else status = 'good';
        remainingKm = rem;
        dueKm = lastReset.dueKm;
        primarySource = 'USER_RULE';
        sources.push('USER_RULE');
        reasons.push('health.reason.explicitDueKm');
      }
      if (lastReset.dueDate) {
        const cmp = input.today.localeCompare(lastReset.dueDate);
        const s: HealthStatus =
          cmp > 0 ? 'overdue' : cmp === 0 ? 'due' : 'soon'; // soon if before — refine below
        // If before due date, treat as good unless within soon window roughly by months
        let dateStatus: HealthStatus = 'good';
        if (cmp > 0) dateStatus = 'overdue';
        else if (cmp === 0) dateStatus = 'due';
        else dateStatus = 'good';
        status = worseStatus(status === 'unknown' ? dateStatus : status, dateStatus);
        dueDate = lastReset.dueDate;
        sources.push('USER_RULE');
        reasons.push('health.reason.explicitDueDate');
      }
    } else {
      const hist = estimateIntervalFromHistory(input.maintenance, part.id);
      if (hist) {
        confidence = hist.confidence;
        reasons.push('health.reason.userHistory');
      }

      let lastKm: number | undefined;
      let lastDate: DateOnly | undefined;

      if (part.id === ROUTINE_CHECK_PART_ID) {
        if (lastReset) {
          lastKm = lastReset.odometer;
          lastDate = lastReset.date;
        } else if (ov?.lastRoutineCheckKm != null) {
          lastKm = ov.lastRoutineCheckKm;
        } else {
          lastKm = input.car.initialOdometer; // 103B / 93C
        }
      } else if (lastReset) {
        lastKm = lastReset.odometer;
        lastDate = lastReset.date;
      } else {
        // 103B: km baseline from initialOdometer when interval exists
        lastKm = input.car.initialOdometer;
      }

      const kmRule = resolveKmInterval(part, hist?.intervalKm ?? null);
      const monthRule = resolveMonthInterval(part);

      // Routine system interval
      const km =
        part.id === ROUTINE_CHECK_PART_ID
          ? {
              lastKm: lastKm ?? input.car.initialOdometer,
              intervalKm: part.intervalKm ?? MILESTONE_INTERVAL_KM,
              source: 'SYSTEM_RULE' as HealthSource,
            }
          : kmRule && lastKm != null
            ? {
                lastKm,
                intervalKm: kmRule.intervalKm,
                source: kmRule.source,
              }
            : undefined;

      const months =
        monthRule && lastDate
          ? {
              lastDate,
              intervalMonths: monthRule.intervalMonths,
              source: monthRule.source,
            }
          : undefined;

      if (km || months) {
        const calc: IntervalStatusResult = calcIntervalStatus({
          currentOdometer: input.car.currentOdometer,
          today: input.today,
          km,
          months,
          soonRatio: soon,
        });
        status = calc.status;
        remainingKm = calc.remainingKm;
        remainingMonths = calc.remainingMonths;
        dueKm = calc.dueKm;
        dueDate = calc.dueDate;
        primarySource = calc.primarySource;
        sources.push(...calc.sources);
        reasons.push('health.reason.interval');
      } else if (part.trackingMode === 'history' || part.trackingMode === 'none') {
        status = 'unknown';
        reasons.push('health.reason.trackingOnly');
        primarySource = 'UNKNOWN';
      }
    }

    // Condition (44)
    if (latest?.condition) {
      const cs = conditionToStatus(latest.condition);
      status = worseStatus(status, cs);
      sources.push('INSPECTION');
      reasons.push('health.reason.condition');
      if (RANK_STATUS(cs) <= RANK_STATUS(status)) primarySource = 'INSPECTION';
    }

    // Measurements (74A)
    for (const rule of part.measurementRules ?? []) {
      const latestMeas = [...records]
        .flatMap((r) =>
          (r.measurements ?? [])
            .filter((x) => x.type === rule.type)
            .map((x) => ({ ...x, date: r.date, odo: r.odometer })),
        )
        .sort((a, b) => b.date.localeCompare(a.date))[0];
      if (!latestMeas) continue;
      const ms = measurementThresholdStatus(latestMeas.value, rule);
      if (ms) {
        status = worseStatus(status, ms);
        sources.push('MEASUREMENT');
        reasons.push('health.reason.measurement');
        primarySource = 'MEASUREMENT';
      }
      const wear = projectWear(records, rule.type, rule.attentionValue);
      if (wear?.kmToAttention != null) {
        wearKmEstimate = wear.kmToAttention;
        confidence = wear.confidence;
        reasons.push('health.reason.wearProjection');
      }
    }

    items.push({
      partDefinitionId: part.id,
      part,
      status,
      reasons,
      confidence,
      primarySource,
      sources: [...new Set(sources)],
      remainingKm,
      remainingMonths,
      dueKm,
      dueDate,
      lastServiceDate: lastReset?.date,
      lastServiceOdo: lastReset?.odometer,
      conditionDate: latest?.condition ? latest.date : undefined,
      wearKmEstimate,
    });
  }

  return sortHealthItems(items);
}

const STATUS_RANK: Record<HealthStatus, number> = {
  critical: 0,
  overdue: 1,
  due: 2,
  inspect: 3,
  soon: 4,
  good: 5,
  unknown: 6,
};

function RANK_STATUS(s: HealthStatus): number {
  return STATUS_RANK[s];
}

export function sortHealthItems(items: HealthItem[]): HealthItem[] {
  return [...items].sort((a, b) => {
    const dr = STATUS_RANK[a.status] - STATUS_RANK[b.status];
    if (dr !== 0) return dr;
    if (a.status === 'inspect' && b.status === 'inspect') {
      // poor outranks fair (83A) — approximate via reasons
      const ap = a.reasons.includes('health.reason.condition') ? 0 : 1;
      const bp = b.reasons.includes('health.reason.condition') ? 0 : 1;
      if (ap !== bp) return ap - bp;
    }
    const da = a.dueDate ?? '9999';
    const db = b.dueDate ?? '9999';
    if (da !== db) return da.localeCompare(db);
    const ka = a.remainingKm ?? Number.POSITIVE_INFINITY;
    const kb = b.remainingKm ?? Number.POSITIVE_INFINITY;
    if (ka !== kb) return ka - kb;
    return a.partDefinitionId.localeCompare(b.partDefinitionId);
  });
}

export function sectionForStatus(
  status: HealthStatus,
): 'attention' | 'upcoming' | 'healthy' | 'tracking' {
  switch (status) {
    case 'critical':
    case 'overdue':
    case 'due':
    case 'inspect':
      return 'attention';
    case 'soon':
      return 'upcoming';
    case 'good':
      return 'healthy';
    case 'unknown':
      return 'tracking';
    default: {
      const _e: never = status;
      return _e;
    }
  }
}

export function attentionCount(items: readonly HealthItem[]): number {
  return items.filter((i) => sectionForStatus(i.status) === 'attention').length;
}
