import type { Breakdown, Car, FillUp, Maintenance } from './models';

export const TANK_MIN = 1;
export const TANK_MAX = 300;
export const DISTANCE_WARN = 5000;
export const TANK_FALLBACK = 50;

export type FillDistanceValidation = {
  ok: boolean;
  errorKey?: 'fillUp.err.distance' | 'fillUp.err.distanceLow' | 'settings.err.odometerFloor';
  warnKey?: 'fillUp.warn.distanceHigh';
};

function byOdometerDesc(a: FillUp, b: FillUp): number {
  if (a.odometer !== b.odometer) {
    return b.odometer - a.odometer;
  }
  return b.createdAt.localeCompare(a.createdAt);
}

function forCar(fillUps: readonly FillUp[], carId: string): FillUp[] {
  return fillUps.filter((f) => !f.carId || f.carId === carId);
}

/** Latest fill for car by odometer, optionally excluding one id. */
export function previousFillForCar(
  fillUps: readonly FillUp[],
  carId: string,
  excludeId?: string,
): FillUp | null {
  const scoped = forCar(fillUps, carId).filter((f) => f.id !== excludeId);
  if (scoped.length === 0) {
    return null;
  }
  return [...scoped].sort(byOdometerDesc)[0]!;
}

/**
 * Odometer the new distance starts from. A new fill starts from the latest fill. An
 * edited fill starts from the fill just below it, so editing an older fill never
 * pushes its odometer past newer ones.
 */
export function baseOdometerForDistance(
  car: Car,
  fillUps: readonly FillUp[],
  excludeId?: string,
): number {
  const editing = excludeId ? fillUps.find((f) => f.id === excludeId) : undefined;
  if (editing) {
    const below = forCar(fillUps, car.id)
      .filter((f) => f.id !== editing.id && f.odometer < editing.odometer)
      .sort(byOdometerDesc)[0];
    return below?.odometer ?? car.initialOdometer;
  }
  return previousFillForCar(fillUps, car.id, excludeId)?.odometer ?? car.initialOdometer;
}

/** Minimum distance allowed before the current known odometer floor. */
export function minDistanceKm(
  car: Car,
  fillUps: readonly FillUp[],
  excludeId?: string,
): number {
  if (excludeId && fillUps.some((f) => f.id === excludeId)) {
    return 0;
  }
  const base = baseOdometerForDistance(car, fillUps, excludeId);
  return Math.max(0, car.currentOdometer - base);
}

/** Derive odometer from base plus entered distance. */
export function computeOdometerFromDistance(
  car: Car,
  fillUps: readonly FillUp[],
  distanceKm: number,
  excludeId?: string,
): number {
  return baseOdometerForDistance(car, fillUps, excludeId) + distanceKm;
}

/** Highest odometer across fill-ups, maintenance, and breakdowns for the car. */
export function maxLoggedOdometer(
  car: Car,
  fillUps: readonly FillUp[],
  maintenance: readonly Pick<Maintenance, 'carId' | 'odometer'>[],
  breakdowns: readonly Pick<Breakdown, 'carId' | 'odometer'>[],
): number {
  let max = car.initialOdometer;
  for (const f of forCar(fillUps, car.id)) {
    if (f.odometer > max) {
      max = f.odometer;
    }
  }
  for (const m of maintenance) {
    if (m.carId && m.carId !== car.id) {
      continue;
    }
    if (m.odometer > max) {
      max = m.odometer;
    }
  }
  for (const b of breakdowns) {
    if (b.carId !== car.id) {
      continue;
    }
    if (b.odometer > max) {
      max = b.odometer;
    }
  }
  return max;
}

export function validateFillDistance(
  car: Car,
  fillUps: readonly FillUp[],
  distanceKm: number,
  excludeId?: string,
  editingOdometer?: number,
): FillDistanceValidation {
  if (!Number.isFinite(distanceKm) || distanceKm <= 0) {
    return { ok: false, errorKey: 'fillUp.err.distance' };
  }

  const min = minDistanceKm(car, fillUps, excludeId);
  if (distanceKm < min) {
    return { ok: false, errorKey: 'fillUp.err.distanceLow' };
  }

  const editing = excludeId ? fillUps.find((f) => f.id === excludeId) : undefined;
  const odometer =
    editingOdometer ?? computeOdometerFromDistance(car, fillUps, distanceKm, excludeId);
  if (editing) {
    if (odometer <= baseOdometerForDistance(car, fillUps, excludeId)) {
      return { ok: false, errorKey: 'settings.err.odometerFloor' };
    }
    // Stay below the next fill so odometer order (and every gap) stays intact.
    const above = forCar(fillUps, car.id)
      .filter((f) => f.id !== editing.id && f.odometer > editing.odometer)
      .sort((a, b) => a.odometer - b.odometer)[0];
    if (above && odometer >= above.odometer) {
      return { ok: false, errorKey: 'settings.err.odometerFloor' };
    }
  } else {
    const floor = maxLoggedOdometer(car, fillUps, [], []);
    if (odometer < floor) {
      return { ok: false, errorKey: 'settings.err.odometerFloor' };
    }
  }

  if (distanceKm > DISTANCE_WARN) {
    return { ok: true, warnKey: 'fillUp.warn.distanceHigh' };
  }

  return { ok: true };
}
