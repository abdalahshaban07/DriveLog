import type { Breakdown, FillUp, Maintenance, OtherExpense } from './models';

export type MonthShare = {
  /** YYYY-MM */
  prefix: string;
  fillCount: number;
  liters: number;
  fuelCost: number;
  /** Null when no fill this month stored a distance. */
  km: number | null;
  maintenanceCount: number;
  maintenanceCost: number;
  otherCount: number;
  otherCost: number;
  breakdownCount: number;
  breakdownCost: number;
  total: number;
};

function monthPrefix(now: Date): string {
  const m = String(now.getMonth() + 1).padStart(2, '0');
  return `${now.getFullYear()}-${m}`;
}

function inMonth(date: string, prefix: string): boolean {
  return date.startsWith(prefix);
}

export function monthShareIsEmpty(share: MonthShare): boolean {
  return (
    share.fillCount + share.maintenanceCount + share.otherCount + share.breakdownCount === 0
  );
}

/** This calendar month. Breakdowns sit in the total so it matches the home month spend. */
export function buildMonthShare(
  fills: readonly FillUp[],
  maintenance: readonly Maintenance[],
  breakdowns: readonly Breakdown[],
  other: readonly OtherExpense[],
  now: Date = new Date(),
): MonthShare {
  const prefix = monthPrefix(now);
  let fillCount = 0;
  let liters = 0;
  let fuelCost = 0;
  let km = 0;
  let hasKm = false;
  for (const fill of fills) {
    if (!inMonth(fill.date, prefix)) {
      continue;
    }
    fillCount += 1;
    liters += fill.liters;
    fuelCost += fill.cost;
    if (fill.distanceKm != null && Number.isFinite(fill.distanceKm)) {
      km += fill.distanceKm;
      hasKm = true;
    }
  }

  let maintenanceCount = 0;
  let maintenanceCost = 0;
  for (const row of maintenance) {
    if (!inMonth(row.date, prefix)) {
      continue;
    }
    maintenanceCount += 1;
    if (row.cost != null) {
      maintenanceCost += row.cost;
    }
  }

  let otherCount = 0;
  let otherCost = 0;
  for (const row of other) {
    if (!inMonth(row.date, prefix)) {
      continue;
    }
    otherCount += 1;
    otherCost += row.amount;
  }

  let breakdownCount = 0;
  let breakdownCost = 0;
  for (const row of breakdowns) {
    if (!inMonth(row.date, prefix)) {
      continue;
    }
    breakdownCount += 1;
    breakdownCost += row.repairCost;
  }

  return {
    prefix,
    fillCount,
    liters,
    fuelCost,
    km: hasKm ? km : null,
    maintenanceCount,
    maintenanceCost,
    otherCount,
    otherCost,
    breakdownCount,
    breakdownCost,
    total: fuelCost + maintenanceCost + otherCost + breakdownCost,
  };
}
