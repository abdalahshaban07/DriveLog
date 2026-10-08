import { describe, expect, it } from 'vitest';
import type { Breakdown, FillUp, Maintenance, OtherExpense } from './models';
import { buildMonthShare, monthShareIsEmpty } from './month-share';

const now = new Date(2026, 9, 8);

function fill(partial: Partial<FillUp> & Pick<FillUp, 'id' | 'date'>): FillUp {
  return {
    odometer: 1000,
    liters: 10,
    cost: 100,
    tankFull: true,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    ...partial,
  };
}

describe('buildMonthShare', () => {
  it('sums this month and skips last month', () => {
    const share = buildMonthShare(
      [
        fill({ id: 'a', date: '2026-10-02', liters: 40, cost: 800, distanceKm: 500 }),
        fill({ id: 'b', date: '2026-10-05', liters: 10, cost: 200 }),
        fill({ id: 'old', date: '2026-09-20', liters: 30, cost: 600, distanceKm: 400 }),
      ],
      [
        {
          id: 'm',
          type: 'oil',
          odometer: 1,
          date: '2026-10-03',
          cost: 500,
          createdAt: '',
          updatedAt: '',
        } satisfies Maintenance,
      ],
      [
        {
          id: 'b',
          carId: 'c',
          symptom: 'x',
          repairCost: 50,
          odometer: 1,
          date: '2026-10-04',
          category: 'other',
          createdAt: '',
          updatedAt: '',
        } satisfies Breakdown,
      ],
      [
        {
          id: 'o',
          carId: 'c',
          label: 'wash',
          amount: 80,
          date: '2026-10-06',
          createdAt: '',
          updatedAt: '',
        } satisfies OtherExpense,
      ],
      now,
    );

    expect(share.fillCount).toBe(2);
    expect(share.liters).toBe(50);
    expect(share.fuelCost).toBe(1000);
    expect(share.km).toBe(500);
    expect(share.maintenanceCount).toBe(1);
    expect(share.maintenanceCost).toBe(500);
    expect(share.otherCost).toBe(80);
    expect(share.breakdownCost).toBe(50);
    expect(share.total).toBe(1630);
    expect(monthShareIsEmpty(share)).toBe(false);
  });

  it('is empty and has no distance when this month is blank', () => {
    const share = buildMonthShare([], [{ id: 'm', type: 'oil', odometer: 1, date: '2026-09-01', createdAt: '', updatedAt: '' }], [], [], now);
    expect(monthShareIsEmpty(share)).toBe(true);
    expect(share.km).toBeNull();
    expect(share.maintenanceCost).toBe(0);
  });
});
