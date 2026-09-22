import type { EconomySegment, FillUp } from './models';

function byOdometer(a: FillUp, b: FillUp): number {
  if (a.odometer !== b.odometer) {
    return a.odometer - b.odometer;
  }
  return a.createdAt.localeCompare(b.createdAt);
}

/**
 * Full-to-full economy.
 * Partial liters between fulls are excluded from L/100km.
 * All costs from startingFull through endingFull (inclusive) are in cost/km.
 */
export function computeEconomySegments(fillUps: readonly FillUp[]): EconomySegment[] {
  const sorted = [...fillUps].sort(byOdometer);
  const fulls = sorted.filter((f) => f.tankFull);
  const segments: EconomySegment[] = [];

  for (let i = 0; i < fulls.length - 1; i++) {
    const start = fulls[i]!;
    const end = fulls[i + 1]!;
    const distance = end.odometer - start.odometer;
    if (distance <= 0) {
      continue;
    }

    const inSegment = sorted.filter(
      (f) =>
        f.odometer > start.odometer ||
        (f.odometer === start.odometer && f.id === start.id) ||
        f.id === start.id,
    ).filter(
      (f) =>
        f.odometer < end.odometer ||
        (f.odometer === end.odometer && f.id === end.id) ||
        f.id === end.id,
    );

    // Inclusive range by odometer between start and end (including both fulls).
    const costs = sorted.filter(
      (f) => f.odometer >= start.odometer && f.odometer <= end.odometer,
    );
    // When equal odometers exist outside the pair, still include only from start through end by sort index.
    const startIdx = sorted.findIndex((f) => f.id === start.id);
    const endIdx = sorted.findIndex((f) => f.id === end.id);
    const slice =
      startIdx >= 0 && endIdx >= startIdx
        ? sorted.slice(startIdx, endIdx + 1)
        : costs;

    void inSegment;
    const totalCost = slice.reduce((sum, f) => sum + f.cost, 0);

    segments.push({
      startId: start.id,
      endId: end.id,
      distanceKm: distance,
      litersPer100Km: (end.liters / distance) * 100,
      costPerKm: totalCost / distance,
      totalCost,
    });
  }

  return segments;
}

/** Per-fill segments for rows that store distanceKm (new model). */
export function computePerFillSegments(fillUps: readonly FillUp[]): EconomySegment[] {
  const withDistance = fillUps.filter(
    (f) => f.distanceKm != null && Number.isFinite(f.distanceKm) && f.distanceKm! > 0,
  );
  if (withDistance.length === 0) {
    return [];
  }

  const sorted = [...withDistance].sort((a, b) => {
    const byDate = a.date.localeCompare(b.date);
    if (byDate !== 0) {
      return byDate;
    }
    return a.createdAt.localeCompare(b.createdAt);
  });

  const segments: EconomySegment[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const end = sorted[i]!;
    const distance = end.distanceKm!;
    const start = i > 0 ? sorted[i - 1]! : end;
    segments.push({
      startId: start.id,
      endId: end.id,
      distanceKm: distance,
      litersPer100Km: (end.liters / distance) * 100,
      costPerKm: end.cost / distance,
      totalCost: end.cost,
    });
  }
  return segments;
}

export function latestEconomy(fillUps: readonly FillUp[]): EconomySegment | null {
  const perFill = computePerFillSegments(fillUps);
  if (perFill.length > 0) {
    return perFill[perFill.length - 1]!;
  }
  const segments = computeEconomySegments(fillUps);
  return segments.length === 0 ? null : segments[segments.length - 1]!;
}

/** Distance-weighted overall. Null unless two+ valid segments (else same as latest). */
export function overallLitersPer100Km(fillUps: readonly FillUp[]): number | null {
  const segments = computeEconomySegments(fillUps);
  if (segments.length < 2) {
    return null;
  }
  let liters = 0;
  let distance = 0;
  for (const s of segments) {
    liters += (s.litersPer100Km * s.distanceKm) / 100;
    distance += s.distanceKm;
  }
  return (liters / distance) * 100;
}

export function monthFuelSpend(
  fillUps: readonly FillUp[],
  now: Date = new Date(),
): number {
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const prefix = `${y}-${String(m).padStart(2, '0')}`;
  return fillUps
    .filter((f) => f.date.startsWith(prefix))
    .reduce((sum, f) => sum + f.cost, 0);
}

/** Rolling window for Home cost glance (days). */
export const ROLLING_COST_WINDOW_DAYS = 30;

function dateOnlyFromDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function windowStartDateOnly(now: Date, windowDays: number): string {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (windowDays - 1));
  return dateOnlyFromDate(start);
}

/**
 * Rolling cost/km from economy segments whose end fill date falls in the window.
 * Prefers per-fill segments when any exist; else full-to-full.
 */
export function rollingCostPerKm(
  fillUps: readonly FillUp[],
  now: Date = new Date(),
  windowDays: number = ROLLING_COST_WINDOW_DAYS,
): number | null {
  if (fillUps.length === 0 || windowDays <= 0) {
    return null;
  }
  const byId = new Map(fillUps.map((f) => [f.id, f]));
  const from = windowStartDateOnly(now, windowDays);
  const to = dateOnlyFromDate(now);

  const perFill = computePerFillSegments(fillUps);
  const pool = perFill.length > 0 ? perFill : computeEconomySegments(fillUps);
  let totalCost = 0;
  let totalDistance = 0;
  for (const s of pool) {
    const end = byId.get(s.endId);
    if (!end) {
      continue;
    }
    if (end.date < from || end.date > to) {
      continue;
    }
    if (s.distanceKm <= 0) {
      continue;
    }
    totalCost += s.totalCost;
    totalDistance += s.distanceKm;
  }
  if (totalDistance <= 0) {
    return null;
  }
  return totalCost / totalDistance;
}

export type FuelMonthCompare = {
  current: number;
  previous: number;
  deltaAbs: number;
  deltaPct: number | null;
};

/** Fuel-only calendar month vs previous; null when both months are zero. */
export function fuelMonthCompare(
  fillUps: readonly FillUp[],
  now: Date = new Date(),
): FuelMonthCompare | null {
  const current = monthFuelSpend(fillUps, now);
  const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const previous = monthFuelSpend(fillUps, prevDate);
  if (current <= 0 && previous <= 0) {
    return null;
  }
  const deltaAbs = current - previous;
  const deltaPct = previous > 0 ? (deltaAbs / previous) * 100 : null;
  return { current, previous, deltaAbs, deltaPct };
}

export type FuelCostGlance = {
  costPerKm: number | null;
  currentMonth: number;
  previousMonth: number;
  deltaPct: number | null;
};

export function buildFuelCostGlance(
  fillUps: readonly FillUp[],
  now: Date = new Date(),
): FuelCostGlance {
  const compare = fuelMonthCompare(fillUps, now);
  return {
    costPerKm: rollingCostPerKm(fillUps, now),
    currentMonth: compare?.current ?? 0,
    previousMonth: compare?.previous ?? 0,
    deltaPct: compare?.deltaPct ?? null,
  };
}

/** Min full segments before below-baseline chip can fire. */
export const EFFICIENCY_BASELINE_MIN_SEGMENTS = 3;
/** Latest L/100 must be this fraction worse than prior baseline. */
export const EFFICIENCY_WORSE_THRESHOLD = 0.15;

export type EfficiencyBelowBaseline = {
  endId: string;
  lastL100: number;
  baselineL100: number;
  pctWorse: number;
};

/**
 * True when latest segment L/100 is ≥15% worse than distance-weighted
 * baseline of prior segments (≥3 total). Prefers per-fill segments.
 */
export function efficiencyBelowBaseline(
  fillUps: readonly FillUp[],
  minSegments: number = EFFICIENCY_BASELINE_MIN_SEGMENTS,
  worseThreshold: number = EFFICIENCY_WORSE_THRESHOLD,
): EfficiencyBelowBaseline | null {
  const perFill = computePerFillSegments(fillUps);
  const segments = perFill.length > 0 ? perFill : computeEconomySegments(fillUps);
  if (segments.length < minSegments) {
    return null;
  }
  const last = segments[segments.length - 1]!;
  const prior = segments.slice(0, -1);
  let liters = 0;
  let distance = 0;
  for (const s of prior) {
    liters += (s.litersPer100Km * s.distanceKm) / 100;
    distance += s.distanceKm;
  }
  if (distance <= 0) {
    return null;
  }
  const baselineL100 = (liters / distance) * 100;
  if (baselineL100 <= 0) {
    return null;
  }
  const pctWorse = (last.litersPer100Km - baselineL100) / baselineL100;
  if (pctWorse < worseThreshold) {
    return null;
  }
  return {
    endId: last.endId,
    lastL100: last.litersPer100Km,
    baselineL100,
    pctWorse: pctWorse * 100,
  };
}

export function knownOdometer(
  initialOdometer: number,
  fillUps: readonly FillUp[],
  maintenance: readonly { odometer: number }[],
): number {
  let max = initialOdometer;
  for (const f of fillUps) {
    if (f.odometer > max) {
      max = f.odometer;
    }
  }
  for (const m of maintenance) {
    if (m.odometer > max) {
      max = m.odometer;
    }
  }
  return max;
}
