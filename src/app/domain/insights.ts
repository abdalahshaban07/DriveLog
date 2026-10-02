import { compareDateOnly } from './dues';
import { computeEconomySegments, computePerFillSegments } from './economy';
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

/**
 * Per-fill distance when any fill has it (same priority as latestEconomy).
 * Full-tank pairs only when none do.
 * ponytail: one distanceKm in the period hides older full-tank-only rows.
 */
function trendSegments(
  fills: readonly FillUp[],
  period: LedgerPeriodFilter,
): { segments: EconomySegment[]; byId: Map<string, FillUp> } {
  const filtered = fills.filter((f) => inPeriod(f, period));
  const perFill = computePerFillSegments(filtered);
  return {
    segments: perFill.length > 0 ? perFill : computeEconomySegments(filtered),
    byId: new Map(filtered.map((f) => [f.id, f])),
  };
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

/** Cost/km per fill. Uses distanceKm, then full-tank pairs. */
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

/** L/100 km per fill. Uses distanceKm, then full-tank pairs. */
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
