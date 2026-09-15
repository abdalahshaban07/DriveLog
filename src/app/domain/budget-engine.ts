import { HISTORY_CONSISTENCY_RATIO } from '../core/config';
import { confidenceFromGaps, median, round2Sig, roundReserveLadder } from './maintenance-calc';
import type { HealthItem } from './vehicle-health';
import type {
  Car,
  Confidence,
  DateOnly,
  FillUp,
  Maintenance,
  MaintenanceRecordType,
  PartDefinition,
} from './models';

export type BudgetHealth =
  | 'EXCELLENT'
  | 'HEALTHY'
  | 'WATCH'
  | 'HIGH'
  | 'CRITICAL'
  | 'UNKNOWN';

export type Affordability =
  | 'CAN_AFFORD'
  | 'TIGHT'
  | 'NOT_RECOMMENDED'
  | 'UNKNOWN';

export type CostEstimate = {
  amount: number;
  confidence: Confidence;
  currency: string;
  source: 'user' | 'same_part' | 'category' | 'unknown';
};

const SERVICE_POOL: readonly MaintenanceRecordType[] = ['replacement', 'service'];

function monthPrefix(d: DateOnly): string {
  return d.slice(0, 7);
}

function calendarMonthsSince(createdAt: string, today: DateOnly): number {
  const created = createdAt.slice(0, 10) as DateOnly;
  const [y1, m1] = created.split('-').map(Number);
  const [y2, m2] = today.split('-').map(Number);
  return Math.max(1, (y2! - y1!) * 12 + (m2! - m1!) + 1);
}

export function knownMaintenanceSpend(
  rows: readonly Maintenance[],
  currency: string,
  predicate: (m: Maintenance) => boolean,
): { known: number; unknownCount: number } {
  let known = 0;
  let unknownCount = 0;
  for (const m of rows) {
    if (!predicate(m)) continue;
    if (m.cost == null || !Number.isFinite(m.cost)) {
      unknownCount++;
      continue;
    }
    if (m.currency && m.currency !== currency) continue;
    known += m.cost;
  }
  return { known, unknownCount };
}

export function historicalMonthlyMaintenanceAverage(
  car: Car,
  maintenance: readonly Maintenance[],
  currency: string,
  today: DateOnly,
): number | null {
  const months = calendarMonthsSince(car.createdAt, today);
  const windowMonths = Math.min(12, months);
  const start = shiftMonth(today, -(windowMonths - 1));
  const { known } = knownMaintenanceSpend(
    maintenance.filter((m) => !m.carId || m.carId === car.id),
    currency,
    (m) => m.date >= start && m.date <= today,
  );
  const divisor = months >= 12 ? 12 : windowMonths;
  return known / divisor;
}

function shiftMonth(date: DateOnly, delta: number): DateOnly {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const dt = new Date(Date.UTC(y, m - 1 + delta, d));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

export function remainingMonthlyMaintenanceBudget(
  car: Car,
  maintenance: readonly Maintenance[],
  currency: string,
  today: DateOnly,
): number | null {
  const budget = car.maintenanceBudgetMonthly;
  if (budget == null || !(budget > 0)) return null;
  const prefix = monthPrefix(today);
  const { known } = knownMaintenanceSpend(
    maintenance,
    currency,
    (m) => (!m.carId || m.carId === car.id) && m.date.startsWith(prefix),
  );
  return Math.max(0, budget - known);
}

export function estimateExpectedCost(
  part: PartDefinition,
  maintenance: readonly Maintenance[],
  carId: string,
  currency: string,
  recordType: MaintenanceRecordType = 'service',
): CostEstimate {
  if (part.expectedCost != null && part.expectedCost > 0) {
    return {
      amount: part.expectedCost,
      confidence: 'high',
      currency: part.expectedCostCurrency ?? currency,
      source: 'user',
    };
  }

  const pool =
    recordType === 'replacement' || recordType === 'service'
      ? SERVICE_POOL
      : ([recordType] as MaintenanceRecordType[]);

  const samePart = maintenance.filter(
    (m) =>
      m.partDefinitionId === part.id &&
      (!m.carId || m.carId === carId) &&
      m.cost != null &&
      Number.isFinite(m.cost) &&
      (m.currency ?? currency) === currency &&
      m.recordType &&
      pool.includes(m.recordType),
  );
  const sameCosts = samePart.map((m) => m.cost!);
  if (sameCosts.length >= 1) {
    const { confidence } = costConfidence(sameCosts);
    if (confidence === 'medium' || confidence === 'high') {
      return {
        amount: round2Sig(sameCosts.reduce((s, c) => s + c, 0) / sameCosts.length),
        confidence,
        currency,
        source: 'same_part',
      };
    }
  }

  const cat = maintenance.filter(
    (m) =>
      (!m.carId || m.carId === carId) &&
      m.cost != null &&
      (m.currency ?? currency) === currency &&
      m.recordType &&
      pool.includes(m.recordType),
  );
  // Category fallback needs part category match via caller-supplied filter — simplified:
  // use same-part only unless ≥3 category samples passed in sameCosts path.
  if (cat.length >= 3) {
    const costs = cat.map((m) => m.cost!);
    const { confidence } = costConfidence(costs, true);
    if (confidence === 'medium' || confidence === 'high') {
      return {
        amount: round2Sig(costs.reduce((s, c) => s + c, 0) / costs.length),
        confidence,
        currency,
        source: 'category',
      };
    }
  }

  return { amount: 0, confidence: 'low', currency, source: 'unknown' };
}

function costConfidence(
  samples: readonly number[],
  category = false,
): { confidence: Confidence } {
  if (!category) {
    if (samples.length === 1) return { confidence: 'low' };
    if (samples.length === 2) return { confidence: 'medium' };
    const { confidence } = confidenceFromGaps(samples, HISTORY_CONSISTENCY_RATIO);
    return { confidence };
  }
  if (samples.length < 3) return { confidence: 'low' };
  if (samples.length < 5) return { confidence: 'medium' };
  const { confidence } = confidenceFromGaps(samples, HISTORY_CONSISTENCY_RATIO);
  return { confidence };
}

export function reserveTiers(input: {
  historicalMonthly: number | null;
  eligible90: number;
  eligible180: number;
}): {
  minimum: number | null;
  recommended: number | null;
  comfortable: number | null;
} {
  const hist = input.historicalMonthly;
  const hasGround =
    (hist != null && hist > 0) || input.eligible90 > 0 || input.eligible180 > 0;
  if (!hasGround) {
    return { minimum: null, recommended: null, comfortable: null };
  }
  const minimum = roundReserveLadder(Math.max(0, hist ?? 0) || input.eligible90 / 3);
  const recommended = roundReserveLadder(
    Math.max(hist ?? 0, input.eligible90 / 3),
  );
  const comfortable = roundReserveLadder(
    1.25 * Math.max(recommended, input.eligible180 / 6),
  );
  return { minimum, recommended, comfortable };
}

export function evaluateBudgetHealth(input: {
  car: Car;
  remainingMonthly: number | null;
  currentMonthSpend: number;
  eligible90: number;
  reserveRecommended: number | null;
  reserveComfortable: number | null;
  criticalDueCost: number;
}): BudgetHealth {
  const budget = input.car.maintenanceBudgetMonthly;
  if (budget == null || !(budget > 0)) return 'UNKNOWN';
  const reserve = input.car.maintenanceReserveBalance;
  const remaining = input.remainingMonthly ?? 0;

  if (input.criticalDueCost > remaining + (reserve ?? 0)) return 'CRITICAL';
  if (input.currentMonthSpend > budget || input.eligible90 > 2 * budget) return 'HIGH';
  if (
    (reserve != null &&
      input.reserveRecommended != null &&
      reserve < input.reserveRecommended) ||
    input.eligible90 > remaining
  ) {
    return 'WATCH';
  }
  const excellentCoverage =
    input.eligible90 <= remaining + (reserve ?? 0);
  if (
    input.currentMonthSpend <= 0.75 * budget &&
    reserve != null &&
    input.reserveComfortable != null &&
    reserve >= input.reserveComfortable &&
    excellentCoverage
  ) {
    return 'EXCELLENT';
  }
  if (
    input.currentMonthSpend <= budget &&
    (reserve == null ||
      (input.reserveRecommended != null && reserve >= input.reserveRecommended))
  ) {
    return 'HEALTHY';
  }
  return 'WATCH';
}

export function evaluateAffordability(input: {
  itemCost: number | null;
  remainingMonthly: number | null;
  reserveBalance: number | undefined;
  reserveMinimum: number | null;
  knownEligible30: number;
}): Affordability {
  if (input.itemCost == null || input.remainingMonthly == null) return 'UNKNOWN';
  const cost = input.itemCost;
  const remaining = input.remainingMonthly;
  const reserve = input.reserveBalance;

  if (reserve == null) {
    // 55A: no TIGHT
    if (remaining - cost >= input.knownEligible30) return 'CAN_AFFORD';
    return 'NOT_RECOMMENDED';
  }

  if (remaining - cost >= input.knownEligible30) return 'CAN_AFFORD';
  if (remaining + reserve >= cost) {
    const after = reserve - Math.max(0, cost - remaining);
    if (
      input.reserveMinimum != null &&
      after < input.reserveMinimum
    ) {
      return 'TIGHT';
    }
    return 'TIGHT';
  }
  return 'NOT_RECOMMENDED';
}

export function fuelSpendTrend(
  fills: readonly FillUp[],
  today: DateOnly,
): { risePct: number } | null {
  const curPrefix = monthPrefix(today);
  let current = 0;
  const prev: number[] = [];
  for (let i = 1; i <= 3; i++) {
    prev.push(0);
  }
  const prefixes = [1, 2, 3].map((i) => monthPrefix(shiftMonth(today, -i)));

  for (const f of fills) {
    if (f.date.startsWith(curPrefix)) current += f.cost;
    for (let i = 0; i < prefixes.length; i++) {
      if (f.date.startsWith(prefixes[i]!)) prev[i] = prev[i]! + f.cost;
    }
  }
  const complete = prev.filter((p) => p > 0);
  if (complete.length < 2) return null;
  const mean = complete.reduce((s, p) => s + p, 0) / complete.length;
  if (!(mean > 0)) return null;
  const risePct = ((current - mean) / mean) * 100;
  if (risePct <= 20) return null;
  return { risePct };
}

export function criticalDueCostSum(
  items: readonly HealthItem[],
  estimate: (item: HealthItem) => CostEstimate,
): number {
  let sum = 0;
  for (const item of items) {
    if (item.status !== 'due' && item.status !== 'overdue' && item.status !== 'critical') {
      continue;
    }
    const est = estimate(item);
    if (est.source === 'unknown') continue;
    if (est.confidence !== 'medium' && est.confidence !== 'high' && est.source !== 'user') {
      continue;
    }
    sum += est.amount;
  }
  return sum;
}

// silence unused median import if tree-shaken — keep for tests
void median;
