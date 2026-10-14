import { describe, expect, it } from 'vitest';
import { fuelGlimpse } from './fuel-glimpse';
import type { FillUp } from './models';

function fill(partial: Partial<FillUp> & Pick<FillUp, 'id' | 'date'>): FillUp {
  return {
    odometer: 1000,
    liters: 10,
    cost: 200,
    tankFull: true,
    distanceKm: 100,
    createdAt: `${partial.date}T00:00:00.000Z`,
    updatedAt: `${partial.date}T00:00:00.000Z`,
    ...partial,
  };
}

describe('fuelGlimpse', () => {
  it('returns nothing from a single fill', () => {
    expect(fuelGlimpse([fill({ id: 'a', date: '2026-10-01' })])).toBeNull();
  });

  it('names a shorter gap before a pricey fill', () => {
    const fills = [
      fill({ id: 'a', date: '2026-09-01', cost: 100 }),
      fill({ id: 'b', date: '2026-09-05', cost: 100 }),
      fill({ id: 'c', date: '2026-09-09', cost: 100 }),
      fill({ id: 'd', date: '2026-09-13', cost: 100 }),
      fill({ id: 'e', date: '2026-09-15', cost: 900 }),
    ];
    expect(fuelGlimpse(fills)).toEqual({ kind: 'rhythm', recentDays: 2, usualDays: 4 });
  });

  it('ignores a one-day wobble and stays on the calm reading', () => {
    const fills = [
      fill({ id: 'a', date: '2026-09-01' }),
      fill({ id: 'b', date: '2026-09-05' }),
      fill({ id: 'c', date: '2026-09-09' }),
      fill({ id: 'd', date: '2026-09-12' }),
    ];
    expect(fuelGlimpse(fills)).toMatchObject({ kind: 'steady', l100: 10 });
  });

  it('names the fill that takes the spend when the rhythm is steady', () => {
    const fills = [
      fill({ id: 'a', date: '2026-09-01', cost: 100 }),
      fill({ id: 'b', date: '2026-09-05', cost: 100 }),
      fill({ id: 'c', date: '2026-09-09', cost: 100 }),
      fill({ id: 'd', date: '2026-09-13', cost: 400 }),
    ];
    expect(fuelGlimpse(fills)).toEqual({
      kind: 'spend',
      date: '2026-09-13',
      sharePct: 57,
      count: 4,
    });
  });

  it('names a consumption drift against older fills', () => {
    const older = [1, 5, 9, 13, 17, 21, 25, 29].map((day, i) =>
      fill({
        id: `old-${i}`,
        date: `2026-08-${String(day).padStart(2, '0')}`,
        liters: 32,
        distanceKm: 400,
        cost: 100,
      }),
    );
    const recent = [2, 6, 10, 14, 18].map((day, i) =>
      fill({
        id: `new-${i}`,
        date: `2026-09-${String(day).padStart(2, '0')}`,
        liters: 36,
        distanceKm: 400,
        cost: 100,
      }),
    );
    expect(fuelGlimpse([...older, ...recent])).toEqual({
      kind: 'consumption',
      direction: 'higher',
      deltaL100: 1,
      count: 5,
    });
  });

  it('names an official price change and ignores rounding', () => {
    const quiet = [1, 5, 9, 13, 17].map((day, i) =>
      fill({
        id: `p-${i}`,
        date: `2026-10-${String(day).padStart(2, '0')}`,
        unitPrice: i === 4 ? 22 : 20,
        cost: i === 4 ? 220 : 200,
      }),
    );
    expect(fuelGlimpse(quiet)).toEqual({ kind: 'price', now: 22, then: 20 });

    const rounded = quiet.map((row, i) =>
      fill({ ...row, id: `r-${i}`, unitPrice: i === 4 ? 24 : 23.99, cost: 240 }),
    );
    expect(fuelGlimpse(rounded)?.kind).toBe('steady');
  });

  it('keeps a grade price difference out of the sentence', () => {
    const fills = [1, 5, 9, 13, 17].map((day, i) =>
      fill({
        id: `g-${i}`,
        date: `2026-10-${String(day).padStart(2, '0')}`,
        fuelGrade: i % 2 ? 'gasoline95' : 'gasoline92',
        unitPrice: i % 2 ? 15 : 14,
        cost: i % 2 ? 150 : 140,
      }),
    );
    expect(fuelGlimpse(fills)?.kind).toBe('steady');
  });
});
