import { describe, expect, it } from 'vitest';
import { kWhPer100Km } from './charge-economy';
import { mergeEnergyHistory } from './energy-history';
import { latestTireTreadMm, tireReminders } from './tire-set';
import type { Car, ChargeSession, FillUp, Maintenance } from './models';

describe('kWhPer100Km', () => {
  it('returns null without distance', () => {
    expect(kWhPer100Km({ kWh: 40, distanceKm: undefined })).toBeNull();
  });

  it('computes when distance known', () => {
    expect(kWhPer100Km({ kWh: 40, distanceKm: 200 })).toBeCloseTo(20);
  });
});

describe('mergeEnergyHistory', () => {
  const fill = {
    id: 'f1',
    odometer: 100,
    liters: 40,
    cost: 500,
    tankFull: true,
    date: '2026-09-20',
    createdAt: 'a',
    updatedAt: 'a',
  } as FillUp;
  const charge = {
    id: 'c1',
    carId: 'car',
    odometer: 120,
    kWh: 30,
    cost: 100,
    date: '2026-09-21',
    createdAt: 'b',
    updatedAt: 'b',
  } as ChargeSession;

  it('merges newest first', () => {
    const rows = mergeEnergyHistory([fill], [charge]);
    expect(rows).toHaveLength(2);
    expect(rows[0]!.kind).toBe('charge');
    expect(rows[1]!.kind).toBe('fuel');
  });

  it('filters by kind', () => {
    expect(mergeEnergyHistory([fill], [charge], 'fuel')).toHaveLength(1);
    expect(mergeEnergyHistory([fill], [charge], 'charge')[0]!.kind).toBe('charge');
  });
});

describe('tireReminders', () => {
  const car = {
    id: 'c',
    nickname: 'X',
    initialOdometer: 0,
    currentOdometer: 1000,
    activeTireSet: 'A',
    tireSetSwappedAt: '2026-01-01',
    createdAt: '',
    updatedAt: '',
  } as Car;

  it('flags old swap and low tread', () => {
    const maint = [
      {
        id: 'm',
        type: 'tires',
        odometer: 1000,
        date: '2026-09-01',
        measurements: [{ type: 'tireTreadMm', value: 2.5, unit: 'mm' }],
        createdAt: '',
        updatedAt: '',
      },
    ] as Maintenance[];
    expect(latestTireTreadMm(maint)).toBe(2.5);
    const recs = tireReminders(car, maint, '2026-09-22');
    expect(recs.map((r) => r.id)).toEqual(['tire-swap', 'tire-tread']);
  });
});
