import {
  latestEconomy,
  monthFuelSpend,
  overallLitersPer100Km,
} from './economy';
import type { FillUp, FuelGrade } from './models';

export interface FuelDashboardMetrics {
  costPerKm: number | null;
  monthSpend: number;
  overallL100: number | null;
  lastL100: number | null;
  overallKmPerL: number | null;
  lastKmPerL: number | null;
}

function filterByGrade(
  fills: readonly FillUp[],
  grade: FuelGrade | 'all',
): FillUp[] {
  if (grade === 'all') {
    return [...fills];
  }
  return fills.filter((f) => f.fuelGrade === grade);
}

function kmPerL(litersPer100: number | null): number | null {
  if (litersPer100 == null || litersPer100 <= 0) {
    return null;
  }
  return 100 / litersPer100;
}

export function fuelDashboardMetrics(
  fills: readonly FillUp[],
  grade: FuelGrade | 'all' = 'all',
): FuelDashboardMetrics {
  const filtered = filterByGrade(fills, grade);
  const eco = latestEconomy(filtered);
  const overall = overallLitersPer100Km(filtered);
  const last = eco?.litersPer100Km ?? null;
  return {
    costPerKm: eco?.costPerKm ?? null,
    monthSpend: monthFuelSpend(filtered),
    overallL100: overall ?? last,
    lastL100: last,
    overallKmPerL: kmPerL(overall ?? last),
    lastKmPerL: kmPerL(last),
  };
}
