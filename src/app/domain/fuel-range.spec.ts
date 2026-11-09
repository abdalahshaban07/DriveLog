import { describe, expect, it } from 'vitest';
import {
  estimateFuelRange,
  RANGE_LOW_DAYS,
  RANGE_MIN_SPAN_DAYS,
} from './fuel-range';
import type { FillUp } from './models';

const NOW = new Date(2026, 10, 8, 12, 0, 0);

function day(offset: number): string {
  const d = new Date(NOW);
  d.setDate(d.getDate() - offset);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${dd}`;
}

let seq = 0;
function fill(over: Partial<FillUp>): FillUp {
  seq += 1;
  return {
    id: `f${seq}`,
    carId: 'c1',
    odometer: 8000,
    liters: 40,
    cost: 560,
    tankFull: true,
    date: day(30),
    createdAt: `${day(30)}T10:00:00.000Z`,
    updatedAt: `${day(30)}T10:00:00.000Z`,
    ...over,
  };
}

/** Two fulls 500 km apart: 45 L over the segment → 9 L/100 km. */
function baseFills(): FillUp[] {
  return [
    fill({ odometer: 8000, liters: 40, date: day(30) }),
    fill({ odometer: 8500, liters: 45, date: day(10) }),
  ];
}

const car = { currentOdometer: 8800, tankCapacityLiters: 50 };

describe('estimateFuelRange', () => {
  it('exposes the tuning constants', () => {
    expect(RANGE_MIN_SPAN_DAYS).toBe(14);
    expect(RANGE_LOW_DAYS).toBe(2);
  });

  it('is null without two full fills', () => {
    expect(estimateFuelRange(car, [], NOW)).toBeNull();
    expect(estimateFuelRange(car, [fill({})], NOW)).toBeNull();
    expect(
      estimateFuelRange(car, [fill({ tankFull: false }), fill({ odometer: 8500, tankFull: false })], NOW),
    ).toBeNull();
  });

  it('is null with less than two weeks of history', () => {
    const fills = [
      fill({ odometer: 8000, date: day(10) }),
      fill({ odometer: 8500, liters: 45, date: day(2) }),
    ];
    expect(estimateFuelRange(car, fills, NOW)).toBeNull();
  });

  it('is null when the odometer never moved past the first full', () => {
    expect(
      estimateFuelRange({ ...car, currentOdometer: 8000 }, baseFills(), NOW),
    ).toBeNull();
    expect(
      estimateFuelRange({ ...car, currentOdometer: 7900 }, baseFills(), NOW),
    ).toBeNull();
  });

  it('is null when no capacity is known', () => {
    const fills = [
      ...baseFills(),
      fill({ odometer: 9000, liters: 0, date: day(2) }),
    ];
    expect(estimateFuelRange({ currentOdometer: 9200 }, fills, NOW)).toBeNull();
  });

  it('is null when economy is implausible', () => {
    const fills = [
      fill({ odometer: 8000, date: day(30) }),
      fill({ odometer: 8100, liters: 200, date: day(10) }),
    ];
    expect(estimateFuelRange(car, fills, NOW)).toBeNull();
  });

  it('is null when every fill is in the future', () => {
    const fills = [
      fill({ odometer: 8000, date: day(-5) }),
      fill({ odometer: 8500, liters: 45, date: day(-2) }),
    ];
    expect(estimateFuelRange(car, fills, NOW)).toBeNull();
  });

  it('projects range from full-to-full economy and observed pace', () => {
    const est = estimateFuelRange(car, baseFills(), NOW)!;
    expect(est).not.toBeNull();
    expect(est.l100).toBe(9);
    expect(est.capacity).toBe(50);
    expect(est.basedOnDays).toBe(30);
    expect(est.kmPerDay).toBe(26.7);
    // 300 km since the last full → 27 L used → 23 L left → 255.6 km.
    expect(est.litersLeft).toBe(23);
    expect(est.tankRatio).toBeCloseTo(0.46, 5);
    expect(est.kmLeft).toBe(255);
    expect(est.daysLeft).toBeCloseTo(9.58, 1);
    expect(est.low).toBe(false);
    expect(est.empty).toBe(false);
  });

  it('falls back to the last full liters when tank capacity is unset', () => {
    const est = estimateFuelRange({ currentOdometer: 8800 }, baseFills(), NOW)!;
    expect(est.capacity).toBe(45);
    expect(est.litersLeft).toBe(18);
    expect(est.kmLeft).toBe(200);
  });

  it('counts partial top-ups after the last full', () => {
    const fills = [...baseFills(), fill({ odometer: 8600, liters: 10, tankFull: false, date: day(5) })];
    const est = estimateFuelRange(car, fills, NOW)!;
    expect(est.litersLeft).toBe(33);
    expect(est.kmLeft).toBe(365);
  });

  it('ignores partials before the last full', () => {
    const fills = [...baseFills(), fill({ odometer: 8200, liters: 10, tankFull: false, date: day(20) })];
    const est = estimateFuelRange(car, fills, NOW)!;
    expect(est.litersLeft).toBe(23);
  });

  it('clamps overfilled tanks to capacity', () => {
    const fills = [...baseFills(), fill({ odometer: 8600, liters: 100, tankFull: false, date: day(5) })];
    const est = estimateFuelRange(car, fills, NOW)!;
    expect(est.litersLeft).toBe(50);
    expect(est.tankRatio).toBe(1);
  });

  it('flags low range at two days or less', () => {
    const est = estimateFuelRange({ ...car, currentOdometer: 8990 }, baseFills(), NOW)!;
    expect(est.kmLeft).toBe(65);
    expect(est.daysLeft).toBeLessThanOrEqual(RANGE_LOW_DAYS);
    expect(est.low).toBe(true);
    expect(est.empty).toBe(false);
  });

  it('flags empty when driving burned the whole tank', () => {
    const est = estimateFuelRange({ ...car, currentOdometer: 9200 }, baseFills(), NOW)!;
    expect(est.litersLeft).toBe(0);
    expect(est.kmLeft).toBe(0);
    expect(est.daysLeft).toBe(0);
    expect(est.empty).toBe(true);
    expect(est.low).toBe(true);
  });

  it('nudges at zero km left even when the slow pace says days remain', () => {
    const fills = [
      fill({ odometer: 8000, liters: 40, date: day(2000) }),
      fill({ odometer: 8500, liters: 45, date: day(10) }),
    ];
    const est = estimateFuelRange({ ...car, currentOdometer: 9054 }, fills, NOW)!;
    expect(est.kmLeft).toBe(0);
    expect(est.empty).toBe(true);
    expect(est.daysLeft).toBeGreaterThan(RANGE_LOW_DAYS);
    expect(est.low).toBe(true);
  });

  it('treats an odometer rollback after the last full as a still-full tank', () => {
    const est = estimateFuelRange({ ...car, currentOdometer: 8400 }, baseFills(), NOW)!;
    expect(est.litersLeft).toBe(50);
    expect(est.tankRatio).toBe(1);
    expect(est.empty).toBe(false);
  });

  it('sorts unsorted input by odometer', () => {
    const est = estimateFuelRange(car, [...baseFills()].reverse(), NOW)!;
    expect(est.l100).toBe(9);
    expect(est.kmLeft).toBe(255);
  });
});