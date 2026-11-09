import { computeEconomySegments } from './economy';
import type { Car, FillUp } from './models';

export interface FuelRangeEstimate {
  /** Remaining range, rounded to 5 km — an estimate, not a promise. */
  kmLeft: number;
  /** Unrounded days of driving left at the observed pace. */
  daysLeft: number;
  litersLeft: number;
  /** 0..1 for the gauge. */
  tankRatio: number;
  kmPerDay: number;
  l100: number;
  capacity: number;
  /** Days of history behind the pace. */
  basedOnDays: number;
  low: boolean;
  empty: boolean;
}

/** Minimum history before the estimate is honest enough to show. */
export const RANGE_MIN_SPAN_DAYS = 14;
/** Nudge fires at or below this many days left. */
export const RANGE_LOW_DAYS = 2;
/** Absurd economy means bad data, not a thirsty car. */
const MAX_SANE_L100 = 100;

function daySpan(fromDay: string, toDay: string): number {
  const a = new Date(`${fromDay}T12:00:00`).getTime();
  const b = new Date(`${toDay}T12:00:00`).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) {
    return -1;
  }
  return Math.round((b - a) / 86_400_000);
}

function todayDay(now: Date): string {
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${m}-${d}`;
}

/**
 * Full-to-full economy + observed km/day project the remaining range.
 * Null until two full fills and ~two weeks of history exist.
 */
export function estimateFuelRange(
  car: Pick<Car, 'currentOdometer' | 'tankCapacityLiters'>,
  fills: readonly FillUp[],
  now: Date = new Date(),
): FuelRangeEstimate | null {
  const segments = computeEconomySegments(fills);
  if (segments.length === 0) {
    return null;
  }
  const fulls = fills
    .filter((f) => f.tankFull)
    .sort((a, b) => a.odometer - b.odometer || a.createdAt.localeCompare(b.createdAt));
  const firstFull = fulls[0]!;
  const lastFull = fulls[fulls.length - 1]!;

  const span = daySpan(firstFull.date, todayDay(now));
  if (span < RANGE_MIN_SPAN_DAYS) {
    return null;
  }
  const kmDriven = car.currentOdometer - firstFull.odometer;
  if (kmDriven <= 0) {
    return null;
  }
  const kmPerDay = kmDriven / span;

  let liters = 0;
  let distance = 0;
  for (const s of segments) {
    liters += (s.litersPer100Km * s.distanceKm) / 100;
    distance += s.distanceKm;
  }
  const l100 = distance > 0 ? (liters / distance) * 100 : 0;
  if (!(l100 > 0) || l100 > MAX_SANE_L100) {
    return null;
  }

  const configured = car.tankCapacityLiters;
  const capacity =
    configured != null && Number.isFinite(configured) && configured > 0
      ? configured
      : lastFull.liters;
  if (!(capacity > 0) || !Number.isFinite(capacity)) {
    return null;
  }

  // Tank was full at the last full fill; partials after it top it back up.
  const kmSince = Math.max(0, car.currentOdometer - lastFull.odometer);
  const partials = fills
    .filter((f) => !f.tankFull && f.odometer > lastFull.odometer && f.liters > 0)
    .reduce((sum, f) => sum + f.liters, 0);
  const used = (kmSince * l100) / 100;
  const remaining = Math.min(capacity, Math.max(0, capacity - used + partials));

  const rawKm = (remaining * 100) / l100;
  const kmLeft = Math.round(rawKm / 5) * 5;
  const daysLeft = rawKm / kmPerDay;
  return {
    kmLeft,
    daysLeft,
    litersLeft: Math.round(remaining * 10) / 10,
    tankRatio: remaining / capacity,
    kmPerDay: Math.round(kmPerDay * 10) / 10,
    l100: Math.round(l100 * 10) / 10,
    capacity,
    basedOnDays: span,
    low: daysLeft <= RANGE_LOW_DAYS || kmLeft <= 0,
    empty: kmLeft <= 0,
  };
}