import { compareDateOnly, todayDateOnly } from './dues';
import type {
  Breakdown,
  DateOnly,
  ExpensePeriod,
  FillUp,
  Maintenance,
  OtherExpense,
} from './models';

export function activePeriod(
  periods: readonly ExpensePeriod[],
  carId: string,
): ExpensePeriod | null {
  return periods.find((p) => p.carId === carId && !p.endDate) ?? null;
}

export function newOpenPeriod(carId: string, startDate: DateOnly = todayDateOnly()): ExpensePeriod {
  return {
    id: crypto.randomUUID(),
    carId,
    startDate,
  };
}

/** Close the open period for carId and open a new one from `today`. */
export function startNewPeriod(
  periods: readonly ExpensePeriod[],
  carId: string,
  today: DateOnly = todayDateOnly(),
): ExpensePeriod[] {
  const next = periods.map((p) =>
    p.carId === carId && !p.endDate ? { ...p, endDate: today } : p,
  );
  return [...next, newOpenPeriod(carId, today)];
}

export function inActivePeriod(date: DateOnly, period: ExpensePeriod | null): boolean {
  if (!period) {
    return false;
  }
  if (compareDateOnly(date, period.startDate) < 0) {
    return false;
  }
  if (period.endDate && compareDateOnly(date, period.endDate) > 0) {
    return false;
  }
  return true;
}

export interface PeriodTotals {
  fuel: number;
  maintenance: number;
  breakdowns: number;
  other: number;
  total: number;
}

export function periodTotals(
  period: ExpensePeriod | null,
  fills: readonly FillUp[],
  maintenance: readonly Maintenance[],
  breakdowns: readonly Breakdown[],
  other: readonly OtherExpense[],
): PeriodTotals {
  if (!period) {
    return { fuel: 0, maintenance: 0, breakdowns: 0, other: 0, total: 0 };
  }
  const fuel = fills
    .filter((f) => inActivePeriod(f.date, period))
    .reduce((s, f) => s + f.cost, 0);
  const maint = maintenance
    .filter((m) => inActivePeriod(m.date, period))
    .reduce((s, m) => s + m.cost, 0);
  const br = breakdowns
    .filter((b) => inActivePeriod(b.date, period))
    .reduce((s, b) => s + b.repairCost, 0);
  const oth = other
    .filter((o) => inActivePeriod(o.date, period))
    .reduce((s, o) => s + o.amount, 0);
  return {
    fuel,
    maintenance: maint,
    breakdowns: br,
    other: oth,
    total: fuel + maint + br + oth,
  };
}

export function daysUntil(dueDate: DateOnly, today: DateOnly = todayDateOnly()): number {
  const [y1, m1, d1] = today.split('-').map(Number) as [number, number, number];
  const [y2, m2, d2] = dueDate.split('-').map(Number) as [number, number, number];
  const a = Date.UTC(y1, m1 - 1, d1);
  const b = Date.UTC(y2, m2 - 1, d2);
  return Math.round((b - a) / 86_400_000);
}
