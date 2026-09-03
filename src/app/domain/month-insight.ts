import type { Breakdown, FillUp, Maintenance, OtherExpense } from './models';

export type MonthSpendDelta = {
  current: number;
  previous: number;
  deltaPct: number;
};

function monthPrefix(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function shiftMonth(d: Date, delta: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + delta, 1);
}

function spendForPrefix(
  prefix: string,
  fills: readonly FillUp[],
  maintenance: readonly Maintenance[],
  breakdowns: readonly Breakdown[],
  other: readonly OtherExpense[],
): number {
  let total = 0;
  for (const f of fills) {
    if (f.date.startsWith(prefix)) total += f.cost;
  }
  for (const m of maintenance) {
    if (m.date.startsWith(prefix)) total += m.cost;
  }
  for (const b of breakdowns) {
    if (b.date.startsWith(prefix)) total += b.repairCost;
  }
  for (const o of other) {
    if (o.date.startsWith(prefix)) total += o.amount;
  }
  return total;
}

/** Month-over-month spend delta; null when there is nothing useful to show. */
export function buildMonthSpendDelta(
  fills: readonly FillUp[],
  maintenance: readonly Maintenance[],
  breakdowns: readonly Breakdown[],
  other: readonly OtherExpense[],
  now: Date = new Date(),
): MonthSpendDelta | null {
  const current = spendForPrefix(monthPrefix(now), fills, maintenance, breakdowns, other);
  const previous = spendForPrefix(
    monthPrefix(shiftMonth(now, -1)),
    fills,
    maintenance,
    breakdowns,
    other,
  );
  if (current <= 0 || previous <= 0) {
    return null;
  }
  const deltaPct = ((current - previous) / previous) * 100;
  return { current, previous, deltaPct };
}

export function isFlatDelta(deltaPct: number): boolean {
  return Math.abs(deltaPct) < 3;
}
