import { compareDateOnly } from './dues';
import { computeEconomySegments } from './economy';
import { periodFilterStart, type LedgerPeriodFilter } from './expense-ledger';
import type { FillUp, FuelGrade } from './models';

function inPeriod(f: FillUp, period: LedgerPeriodFilter): boolean {
  const start = periodFilterStart(period);
  if (!start) {
    return true;
  }
  return compareDateOnly(f.date, start) >= 0;
}

/** Rolling cost/km per fill-up segment (tank-full pairs). */
export function costPerKmTrend(
  fills: readonly FillUp[],
  period: LedgerPeriodFilter,
): number[] {
  const sorted = [...fills]
    .filter((f) => inPeriod(f, period))
    .sort((a, b) => a.odometer - b.odometer);
  const out: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]!;
    const cur = sorted[i]!;
    if (!cur.tankFull || !prev.tankFull) {
      continue;
    }
    const dist = cur.odometer - prev.odometer;
    if (dist <= 0) {
      continue;
    }
    out.push(Math.round((cur.cost / dist) * 100) / 100);
  }
  return out;
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

/** L/100 km per full-tank segment in period order. */
export function economyTrend(
  fills: readonly FillUp[],
  period: LedgerPeriodFilter,
): number[] {
  const filtered = fills.filter((f) => inPeriod(f, period));
  return computeEconomySegments(filtered).map(
    (s) => Math.round(s.litersPer100Km * 10) / 10,
  );
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
