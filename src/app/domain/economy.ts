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

export function latestEconomy(fillUps: readonly FillUp[]): EconomySegment | null {
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
