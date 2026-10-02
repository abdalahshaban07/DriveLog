import { compareDateOnly } from './dues';
import { periodFilterStart, type LedgerPeriodFilter } from './expense-ledger';
import type { EconomySegment, FillUp, FuelGrade } from './models';

function inPeriod(f: FillUp, period: LedgerPeriodFilter): boolean {
  const start = periodFilterStart(period);
  if (!start) {
    return true;
  }
  return compareDateOnly(f.date, start) >= 0;
}

export interface TrendPoint {
  value: number;
  /** End-fill date (YYYY-MM-DD). */
  date: string;
}

function byOdometer(a: FillUp, b: FillUp): number {
  if (a.odometer !== b.odometer) {
    return a.odometer - b.odometer;
  }
  return a.createdAt.localeCompare(b.createdAt);
}

/** Logged trip distance, otherwise the odometer gap from the previous fill. */
function fillDistance(end: FillUp, prev: FillUp | undefined): number {
  const stored = end.distanceKm;
  if (stored != null && Number.isFinite(stored) && stored > 0) {
    return stored;
  }
  if (prev && end.odometer > prev.odometer) {
    return end.odometer - prev.odometer;
  }
  return 0;
}

/** One point per fill. A full tank is not required. */
function trendSegments(
  fills: readonly FillUp[],
  period: LedgerPeriodFilter,
): { segments: EconomySegment[]; byId: Map<string, FillUp> } {
  const sorted = [...fills].sort(byOdometer);
  const segments: EconomySegment[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const end = sorted[i]!;
    const prev = i > 0 ? sorted[i - 1] : undefined;
    const distance = fillDistance(end, prev);
    if (distance <= 0 || !inPeriod(end, period)) {
      continue;
    }
    segments.push({
      startId: prev?.id ?? end.id,
      endId: end.id,
      distanceKm: distance,
      litersPer100Km: (end.liters / distance) * 100,
      costPerKm: end.cost / distance,
      totalCost: end.cost,
    });
  }
  return { segments, byId: new Map(fills.map((f) => [f.id, f])) };
}

function toTrendPoints(
  fills: readonly FillUp[],
  period: LedgerPeriodFilter,
  pick: (segment: EconomySegment) => number,
  digits: number,
): TrendPoint[] {
  const { segments, byId } = trendSegments(fills, period);
  const factor = 10 ** digits;
  return segments.map((segment) => ({
    value: Math.round(pick(segment) * factor) / factor,
    date: byId.get(segment.endId)?.date ?? '',
  }));
}

/** Cost/km per fill. Distance or odometer gap; a full tank is not required. */
export function costPerKmTrend(
  fills: readonly FillUp[],
  period: LedgerPeriodFilter,
): TrendPoint[] {
  return toTrendPoints(fills, period, (segment) => segment.costPerKm, 2);
}

export interface MonthSpend {
  month: string;
  value: number;
}

export function spendByMonthEntries(
  fills: readonly FillUp[],
  period: LedgerPeriodFilter,
): MonthSpend[] {
  const map = new Map<string, number>();
  for (const f of fills) {
    if (!inPeriod(f, period)) {
      continue;
    }
    const key = f.date.slice(0, 7);
    map.set(key, (map.get(key) ?? 0) + f.cost);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, value]) => ({ month, value: Math.round(value) }));
}

export function spendByMonth(
  fills: readonly FillUp[],
  period: LedgerPeriodFilter,
): number[] {
  return spendByMonthEntries(fills, period).map((e) => e.value);
}

/** L/100 km per fill. Distance or odometer gap; a full tank is not required. */
export function economyTrend(
  fills: readonly FillUp[],
  period: LedgerPeriodFilter,
): TrendPoint[] {
  return toTrendPoints(fills, period, (segment) => segment.litersPer100Km, 1);
}

export type FuelGradeShareGrade = FuelGrade | 'unknown';

export interface FuelGradeShare {
  grade: FuelGradeShareGrade;
  cost: number;
}

/** Sum fill cost grouped by fuel grade for the selected ledger period. */
export function fuelGradeCostShare(
  fills: readonly FillUp[],
  period: LedgerPeriodFilter,
): FuelGradeShare[] {
  const map = new Map<FuelGradeShareGrade, number>();
  for (const f of fills) {
    if (!inPeriod(f, period)) {
      continue;
    }
    const grade: FuelGradeShareGrade = f.fuelGrade ?? 'unknown';
    map.set(grade, (map.get(grade) ?? 0) + f.cost);
  }
  return [...map.entries()]
    .map(([grade, cost]) => ({ grade, cost: Math.round(cost) }))
    .sort((a, b) => b.cost - a.cost);
}
