import { inActivePeriod, type PeriodTotals } from './expense-period';
import type { Breakdown, ExpenseCategory, ExpensePeriod, FillUp, Maintenance } from './models';

export interface ReportMixSlice {
  key: ExpenseCategory;
  amount: number;
  pct: number;
}

export interface ReportBrief {
  liters: number;
  fillCount: number;
  distanceKm: number;
  maintCount: number;
  mix: ReportMixSlice[];
}

function datedInPeriod<T extends { date: string }>(
  rows: readonly T[],
  period: ExpensePeriod | null,
): readonly T[] {
  if (!period) {
    return rows;
  }
  return rows.filter((row) => inActivePeriod(row.date, period));
}

/** Period fuel volume plus the spend mix behind the reports hero. */
export function buildReportBrief(input: {
  fills: readonly FillUp[];
  maintenance: readonly Maintenance[];
  period: ExpensePeriod | null;
  totals: PeriodTotals;
}): ReportBrief {
  const fills = datedInPeriod(input.fills, input.period);
  const parts: [ExpenseCategory, number][] = [
    ['fuel', input.totals.fuel],
    ['maintenance', input.totals.maintenance],
    ['breakdown', input.totals.breakdowns],
    ['other', input.totals.other],
  ];
  return {
    liters: fills.reduce((sum, fill) => sum + fill.liters, 0),
    fillCount: fills.length,
    distanceKm: fills.reduce((sum, fill) => sum + (fill.distanceKm ?? 0), 0),
    maintCount: datedInPeriod(input.maintenance, input.period).length,
    mix: parts
      .filter(([, amount]) => amount > 0)
      .map(([key, amount]) => ({
        key,
        amount,
        pct: input.totals.total > 0 ? Math.round((amount / input.totals.total) * 100) : 0,
      })),
  };
}

/** Rows that share a category and symptom with another row. */
export function recurringBreakdownCount(rows: readonly Breakdown[]): number {
  return rows.filter((row) =>
    rows.some(
      (other) =>
        other.id !== row.id && other.category === row.category && other.symptom === row.symptom,
    ),
  ).length;
}
