import type { CountryFuelPrices } from '../data/remote';
import type { FillUp, FuelGrade } from './models';

/** Round to 2 decimal places for currency storage. */
export function computeFillUpCost(liters: number, unitPrice: number): number {
  if (!Number.isFinite(liters) || !Number.isFinite(unitPrice) || liters <= 0 || unitPrice < 0) {
    return 0;
  }
  return Math.round(liters * unitPrice * 100) / 100;
}

export function priceForGrade(
  prices: CountryFuelPrices | null,
  grade: FuelGrade,
): number | null {
  if (!prices) {
    return null;
  }
  switch (grade) {
    case 'gasoline92':
      return prices.gasoline92 ?? prices.gasoline;
    case 'gasoline95':
      return prices.gasoline95;
    case 'diesel':
      return prices.diesel;
    case 'solar':
      return prices.solar;
    case 'custom':
      return null;
    default: {
      const _never: never = grade;
      return _never;
    }
  }
}

export function pickUnitPrice(
  grade: FuelGrade | null,
  countryPrices: CountryFuelPrices | null,
  lastUnitPrice: number | null,
): number | null {
  if (grade) {
    const fromBoard = priceForGrade(countryPrices, grade);
    if (fromBoard != null && fromBoard > 0) {
      return fromBoard;
    }
  }
  if (lastUnitPrice != null && lastUnitPrice > 0) {
    return lastUnitPrice;
  }
  return null;
}

export function lastFillUnitPriceFromHistory(fills: readonly FillUp[]): number | null {
  const sorted = [...fills].sort(
    (a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt),
  );
  for (const f of sorted) {
    if (f.unitPrice != null && f.unitPrice > 0) {
      return f.unitPrice;
    }
    if (f.liters > 0 && f.cost >= 0) {
      return Math.round((f.cost / f.liters) * 1000) / 1000;
    }
  }
  return null;
}

export function lastFuelGrade(fills: readonly FillUp[]): FuelGrade | null {
  const sorted = [...fills].sort(
    (a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt),
  );
  return sorted.find((f) => f.fuelGrade)?.fuelGrade ?? null;
}

/** ponytail: naive km-until-empty from last full tank segment only */
export function suggestFillUpDueKm(
  fills: readonly FillUp[],
  currentOdometer: number,
  thresholdKm = 400,
): number | null {
  const full = [...fills]
    .filter((f) => f.tankFull)
    .sort((a, b) => b.odometer - a.odometer);
  const lastFull = full[0];
  if (!lastFull) {
    return null;
  }
  const since = currentOdometer - lastFull.odometer;
  const remaining = thresholdKm - since;
  return remaining > 0 && remaining <= thresholdKm ? Math.round(remaining) : null;
}
