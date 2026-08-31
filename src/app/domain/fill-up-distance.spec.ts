import { describe, expect, it } from 'vitest';
import {
  DISTANCE_WARN,
  baseOdometerForDistance,
  computeOdometerFromDistance,
  maxLoggedOdometer,
  minDistanceKm,
  previousFillForCar,
  validateFillDistance,
} from './fill-up-distance';
import type { Breakdown, Car, FillUp, Maintenance } from './models';

function car(partial: Partial<Car> & Pick<Car, 'id' | 'initialOdometer' | 'currentOdometer'>): Car {
  return {
    nickname: 'Test',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...partial,
  };
}

function fill(
  partial: Partial<FillUp> & Pick<FillUp, 'id' | 'odometer' | 'liters' | 'cost' | 'tankFull'>,
): FillUp {
  return {
    date: '2026-01-01',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...partial,
  };
}

describe('previousFillForCar', () => {
  it('returns latest fill by odometer for the car', () => {
    const fills = [
      fill({ id: 'a', carId: 'c1', odometer: 1000, liters: 40, cost: 50, tankFull: true }),
      fill({ id: 'b', carId: 'c1', odometer: 1200, liters: 45, cost: 60, tankFull: true }),
      fill({ id: 'x', carId: 'c2', odometer: 9000, liters: 10, cost: 10, tankFull: true }),
    ];
    expect(previousFillForCar(fills, 'c1')?.id).toBe('b');
  });

  it('excludes the given id', () => {
    const fills = [
      fill({ id: 'a', carId: 'c1', odometer: 1000, liters: 40, cost: 50, tankFull: true }),
      fill({ id: 'b', carId: 'c1', odometer: 1200, liters: 45, cost: 60, tankFull: true }),
    ];
    expect(previousFillForCar(fills, 'c1', 'b')?.id).toBe('a');
  });
});

describe('baseOdometerForDistance', () => {
  it('uses initial odometer when no prior fills', () => {
    const c = car({ id: 'c1', initialOdometer: 5000, currentOdometer: 5000 });
    expect(baseOdometerForDistance(c, [])).toBe(5000);
  });

  it('uses previous fill odometer', () => {
    const c = car({ id: 'c1', initialOdometer: 5000, currentOdometer: 5200 });
    const fills = [
      fill({ id: 'a', carId: 'c1', odometer: 5100, liters: 40, cost: 50, tankFull: true }),
    ];
    expect(baseOdometerForDistance(c, fills)).toBe(5100);
  });
});

describe('minDistanceKm', () => {
  it('returns distance from base to current odometer', () => {
    const c = car({ id: 'c1', initialOdometer: 5000, currentOdometer: 5300 });
    const fills = [
      fill({ id: 'a', carId: 'c1', odometer: 5100, liters: 40, cost: 50, tankFull: true }),
    ];
    expect(minDistanceKm(c, fills)).toBe(200);
  });
});

describe('computeOdometerFromDistance', () => {
  it('adds distance to base odometer', () => {
    const c = car({ id: 'c1', initialOdometer: 5000, currentOdometer: 5300 });
    const fills = [
      fill({ id: 'a', carId: 'c1', odometer: 5100, liters: 40, cost: 50, tankFull: true }),
    ];
    expect(computeOdometerFromDistance(c, fills, 250)).toBe(5350);
  });
});

describe('maxLoggedOdometer', () => {
  it('returns highest odometer across records', () => {
    const c = car({ id: 'c1', initialOdometer: 1000, currentOdometer: 1500 });
    const fills = [
      fill({ id: 'a', carId: 'c1', odometer: 1200, liters: 40, cost: 50, tankFull: true }),
    ];
    const maintenance: Maintenance[] = [
      {
        id: 'm1',
        carId: 'c1',
        type: 'oil',
        odometer: 1400,
        cost: 100,
        date: '2026-01-02',
        createdAt: '2026-01-02T00:00:00.000Z',
        updatedAt: '2026-01-02T00:00:00.000Z',
      },
    ];
    const breakdowns: Breakdown[] = [
      {
        id: 'b1',
        carId: 'c1',
        symptom: 'noise',
        repairCost: 50,
        odometer: 1300,
        date: '2026-01-03',
        category: 'mechanical',
        createdAt: '2026-01-03T00:00:00.000Z',
        updatedAt: '2026-01-03T00:00:00.000Z',
      },
    ];
    expect(maxLoggedOdometer(c, fills, maintenance, breakdowns)).toBe(1400);
  });
});

describe('validateFillDistance', () => {
  it('rejects non-positive distance', () => {
    const c = car({ id: 'c1', initialOdometer: 5000, currentOdometer: 5000 });
    expect(validateFillDistance(c, [], 0)).toEqual({
      ok: false,
      errorKey: 'fillUp.err.distance',
    });
  });

  it('rejects distance below the known floor', () => {
    const c = car({ id: 'c1', initialOdometer: 5000, currentOdometer: 5200 });
    const fills = [
      fill({ id: 'a', carId: 'c1', odometer: 5100, liters: 40, cost: 50, tankFull: true }),
    ];
    expect(validateFillDistance(c, fills, 50)).toEqual({
      ok: false,
      errorKey: 'fillUp.err.distanceLow',
    });
  });

  it('warns on unusually high distance', () => {
    const c = car({ id: 'c1', initialOdometer: 5000, currentOdometer: 5000 });
    expect(validateFillDistance(c, [], DISTANCE_WARN + 1)).toEqual({
      ok: true,
      warnKey: 'fillUp.warn.distanceHigh',
    });
  });

  it('accepts valid distance', () => {
    const c = car({ id: 'c1', initialOdometer: 5000, currentOdometer: 5000 });
    expect(validateFillDistance(c, [], 250)).toEqual({ ok: true });
  });

  it('rejects odometer below logged floor when editing', () => {
    const c = car({ id: 'c1', initialOdometer: 5000, currentOdometer: 5200 });
    const fills = [
      fill({ id: 'a', carId: 'c1', odometer: 5100, liters: 40, cost: 50, tankFull: true }),
      fill({ id: 'b', carId: 'c1', odometer: 5200, liters: 40, cost: 50, tankFull: true }),
    ];
    expect(validateFillDistance(c, fills, 200, 'b', 5050)).toEqual({
      ok: false,
      errorKey: 'settings.err.odometerFloor',
    });
  });
});
