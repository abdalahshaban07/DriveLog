import { describe, expect, it } from 'vitest';
import { buildMonthSpendDelta, isFlatDelta } from './month-insight';
import type { FillUp } from './models';

function fill(date: string, cost: number): FillUp {
  return {
    id: date,
    odometer: 1,
    liters: 10,
    cost,
    tankFull: true,
    date,
    createdAt: `${date}T00:00:00.000Z`,
    updatedAt: `${date}T00:00:00.000Z`,
  };
}

describe('buildMonthSpendDelta', () => {
  const now = new Date(2026, 8, 15); // Sep 2026

  it('returns null when previous month is zero', () => {
    expect(buildMonthSpendDelta([fill('2026-09-01', 100)], [], [], [], now)).toBeNull();
  });

  it('returns null when current month has no spend', () => {
    expect(buildMonthSpendDelta([fill('2026-08-01', 100)], [], [], [], now)).toBeNull();
  });

  it('computes up/down delta', () => {
    const up = buildMonthSpendDelta(
      [fill('2026-08-01', 100), fill('2026-09-01', 150)],
      [],
      [],
      [],
      now,
    );
    expect(up?.deltaPct).toBe(50);
    const down = buildMonthSpendDelta(
      [fill('2026-08-01', 200), fill('2026-09-01', 100)],
      [],
      [],
      [],
      now,
    );
    expect(down?.deltaPct).toBe(-50);
  });

  it('treats |delta| < 3 as flat', () => {
    expect(isFlatDelta(2.5)).toBe(true);
    expect(isFlatDelta(-2.9)).toBe(true);
    expect(isFlatDelta(3)).toBe(false);
  });
});
