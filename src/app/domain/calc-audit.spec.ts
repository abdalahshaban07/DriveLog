import { describe, expect, it } from 'vitest';
import {
  computePerFillSegments,
  fuelMonthCompare,
  latestEconomy,
  monthFuelSpend,
  rollingCostPerKm,
} from './economy';
import { calcIntervalStatus } from './maintenance-calc';
import type { FillUp } from './models';

function f(p: Partial<FillUp> & Pick<FillUp, 'id' | 'odometer' | 'liters' | 'cost'>): FillUp {
  return {
    tankFull: true,
    date: '2026-03-10',
    createdAt: '2026-03-10T08:00:00.000Z',
    updatedAt: '2026-03-10T08:00:00.000Z',
    ...p,
  };
}

describe('calculation audit (hand-computed fixtures)', () => {
  it('per-fill L/100km and cost/km match hand math', () => {
    // 37.5 L over 250 km = 15 L/100km; 525 EGP / 250 km = 2.1 per km
    const s = latestEconomy([f({ id: 'a', odometer: 1250, liters: 37.5, cost: 525, distanceKm: 250 })]);
    expect(s?.litersPer100Km).toBeCloseTo(15, 10);
    expect(s?.costPerKm).toBeCloseTo(2.1, 10);
  });

  it('never returns NaN or Infinity for zero, negative or missing distance', () => {
    const rows = [
      f({ id: 'z', odometer: 100, liters: 10, cost: 100, distanceKm: 0 }),
      f({ id: 'n', odometer: 200, liters: 10, cost: 100, distanceKm: -5 }),
      f({ id: 'u', odometer: 300, liters: 10, cost: 100 }),
    ];
    // Odometer gaps only: the first fill has no earlier reading and a bad stored distance, so no point.
    const segs = computePerFillSegments(rows);
    expect(segs.map((x) => x.endId)).toEqual(['n', 'u']);
    expect(segs.every((x) => Number.isFinite(x.litersPer100Km) && x.distanceKm === 100)).toBe(true);
    expect(latestEconomy(rows)?.distanceKm).toBe(100);
    expect(rollingCostPerKm([rows[0]!], new Date(2026, 2, 12))).toBeNull();
  });

  it('month totals use the local calendar month and sum exactly', () => {
    const rows = [
      f({ id: '1', odometer: 1, liters: 1, cost: 100.1, date: '2026-03-01' }),
      f({ id: '2', odometer: 2, liters: 1, cost: 200.2, date: '2026-03-31' }),
      f({ id: '3', odometer: 3, liters: 1, cost: 50, date: '2026-02-28' }),
      f({ id: '4', odometer: 4, liters: 1, cost: 70, date: '2026-04-01' }),
    ];
    expect(monthFuelSpend(rows, new Date(2026, 2, 15))).toBeCloseTo(300.3, 10);
    const cmp = fuelMonthCompare(rows, new Date(2026, 2, 15));
    expect(cmp?.previous).toBe(50);
    expect(cmp?.deltaPct).toBeCloseTo(500.6, 6);
    // January: previous month is December of the prior year
    const jan = [f({ id: 'd', odometer: 1, liters: 1, cost: 80, date: '2025-12-20' })];
    expect(fuelMonthCompare(jan, new Date(2026, 0, 5))?.previous).toBe(80);
  });

  it('rolling window is inclusive of today and exactly 30 days back', () => {
    const now = new Date(2026, 2, 30); // Mar 30; window starts Mar 1
    const rows = [
      f({ id: 'in', odometer: 1, liters: 10, cost: 100, distanceKm: 100, date: '2026-03-01' }),
      f({ id: 'out', odometer: 2, liters: 10, cost: 900, distanceKm: 100, date: '2026-02-28' }),
    ];
    expect(rollingCostPerKm(rows, now)).toBeCloseTo(1, 10);
  });
});

describe('maintenance due logic (audit)', () => {
  it('month interval counts a month only once the day of month is reached', () => {
    const base = { currentOdometer: 0, months: { lastDate: '2026-01-31', intervalMonths: 6, source: 'SYSTEM_RULE' as const } };
    expect(calcIntervalStatus({ ...base, today: '2026-07-01' }).remainingMonths).toBe(1);
    expect(calcIntervalStatus({ ...base, today: '2026-07-31' }).remainingMonths).toBe(0);
    expect(calcIntervalStatus({ ...base, today: '2026-08-01' }).remainingMonths).toBe(0);
    expect(calcIntervalStatus({ ...base, today: '2026-08-31' }).remainingMonths).toBe(-1);
  });

  it('due date clamps to the end of a short month', () => {
    const r = calcIntervalStatus({
      currentOdometer: 0,
      today: '2026-02-01',
      months: { lastDate: '2026-01-31', intervalMonths: 1, source: 'SYSTEM_RULE' },
    });
    expect(r.dueDate).toBe('2026-02-28');
  });

  it('km interval: exact limit is due, beyond is overdue', () => {
    const km = { lastKm: 10000, intervalKm: 5000, source: 'SYSTEM_RULE' as const };
    expect(calcIntervalStatus({ currentOdometer: 14999, today: '2026-03-01', km }).remainingKm).toBe(1);
    expect(calcIntervalStatus({ currentOdometer: 15000, today: '2026-03-01', km }).status).toBe('due');
    expect(calcIntervalStatus({ currentOdometer: 15001, today: '2026-03-01', km }).status).toBe('overdue');
  });
});

describe('distance comes from odometer readings only', () => {
  it('each fill is its own point: gap, own liters, own cost (hand math)', () => {
    const rows = [
      f({ id: 'a', odometer: 1000, liters: 30, cost: 300, distanceKm: 400, date: '2026-03-01', createdAt: '2026-03-01T08:00:00.000Z' }),
      f({ id: 'p', odometer: 1150, liters: 20, cost: 100, distanceKm: 150, date: '2026-03-05', createdAt: '2026-03-05T08:00:00.000Z' }),
      f({ id: 'b', odometer: 1250, liters: 30, cost: 180, distanceKm: 100, date: '2026-03-10', createdAt: '2026-03-10T08:00:00.000Z' }),
    ];
    const segs = computePerFillSegments(rows);
    expect(segs.map((s) => s.endId)).toEqual(['a', 'p', 'b']);
    expect(segs.map((s) => s.distanceKm)).toEqual([400, 150, 100]);
    expect(segs[1]!.litersPer100Km).toBeCloseTo((20 / 150) * 100, 10);
    expect(segs[2]!.litersPer100Km).toBeCloseTo(30, 10);
    expect(segs[2]!.costPerKm).toBeCloseTo(1.8, 10);
    expect(segs[2]!.startId).toBe('p');
  });

  it('a stale stored distanceKm is ignored once a previous reading exists', () => {
    const rows = [
      f({ id: 'a', odometer: 1000, liters: 30, cost: 300, distanceKm: 400, date: '2026-03-01' }),
      f({ id: 'b', odometer: 1200, liters: 20, cost: 200, distanceKm: 999, date: '2026-03-10', createdAt: '2026-03-10T08:00:00.000Z' }),
    ];
    const segs = computePerFillSegments(rows);
    expect(segs[1]!.distanceKm).toBe(200);
    expect(segs[1]!.litersPer100Km).toBeCloseTo(10, 10);
  });

  it('legacy partial and tankFull flags change nothing', () => {
    const base = [
      f({ id: 'a', odometer: 100, liters: 10, cost: 100, date: '2026-03-01', distanceKm: 100 }),
      f({ id: 'b', odometer: 250, liters: 12, cost: 120, date: '2026-03-02', createdAt: '2026-03-02T08:00:00.000Z' }),
    ];
    const flagged = base.map((r) => ({ ...r, tankFull: true, partial: true }) as typeof r);
    expect(computePerFillSegments(flagged)).toEqual(computePerFillSegments(base));
  });
});

describe('backup import validation', () => {
  it('rejects fill-ups with non-numeric liters or cost instead of storing NaN', async () => {
    const { normalizeFillUp } = await import('../data/db-normalize');
    const ok = { id: 'x', odometer: 100, liters: 10, cost: 100, tankFull: false, date: '2026-03-01', createdAt: 'c', updatedAt: 'u' };
    expect(normalizeFillUp(ok).liters).toBe(10);
    expect(() => normalizeFillUp({ ...ok, liters: 'abc' })).toThrow('backup.invalid');
    expect(() => normalizeFillUp({ ...ok, cost: 'free' })).toThrow('backup.invalid');
  });
});

describe('old backups with the partial flag', () => {
  it('import keeps the row and ignores the partial flag', async () => {
    const { normalizeFillUp } = await import('../data/db-normalize');
    const row = normalizeFillUp({
      id: 'x', odometer: 1000, liters: 10, cost: 100, tankFull: false, partial: true,
      date: '2026-03-01', createdAt: '2026-03-01T00:00:00.000Z', updatedAt: '2026-03-01T00:00:00.000Z',
    } as never);
    expect(row).not.toBeNull();
    expect(row!.liters).toBe(10);
    expect('partial' in (row as object) && (row as { partial?: unknown }).partial !== undefined).toBe(false);
  });
});
