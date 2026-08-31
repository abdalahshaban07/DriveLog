import { describe, expect, it } from 'vitest';
import { lastFullFillLiters } from './fill-up-cost';
import type { FillUp } from './models';

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

describe('lastFullFillLiters', () => {
  it('returns latest positive full-tank liters', () => {
    const liters = lastFullFillLiters([
      fill({ id: 'a', odometer: 1000, liters: 40, cost: 50, tankFull: true, date: '2026-01-01' }),
      fill({ id: 'b', odometer: 1200, liters: 45, cost: 60, tankFull: true, date: '2026-02-01' }),
      fill({ id: 'c', odometer: 1300, liters: 10, cost: 15, tankFull: false, date: '2026-03-01' }),
    ]);
    expect(liters).toBe(45);
  });

  it('returns null when no full tanks exist', () => {
    expect(
      lastFullFillLiters([
        fill({ id: 'a', odometer: 1000, liters: 20, cost: 30, tankFull: false }),
      ]),
    ).toBeNull();
  });
});
