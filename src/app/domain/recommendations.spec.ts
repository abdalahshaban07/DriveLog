import { describe, expect, it } from 'vitest';
import { buildMonthOutlook, buildRecommendations } from './recommendations';
import type { Breakdown, Car, FillUp, Maintenance, Settings } from './models';

const settings: Settings = {
  language: 'en',
  theme: 'dark',
  currency: 'EGP',
  unitSystem: 'metric',
  installBannerDismissed: true,
  remindersEnabled: true,
};

function car(partial: Partial<Car> & Pick<Car, 'id'>): Car {
  return {
    nickname: 'Test',
    initialOdometer: 1000,
    currentOdometer: 5000,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...partial,
  };
}

function fill(
  partial: Partial<FillUp> & Pick<FillUp, 'id' | 'date' | 'cost' | 'liters' | 'odometer' | 'tankFull'>,
): FillUp {
  return {
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...partial,
  };
}

describe('buildMonthOutlook', () => {
  it('sums all expense categories for the current month', () => {
    const now = new Date(2026, 2, 10);
    const outlook = buildMonthOutlook(
      [fill({ id: 'f1', date: '2026-03-05', cost: 100, liters: 40, odometer: 1100, tankFull: true })],
      [
        {
          id: 'm1',
          type: 'oil',
          odometer: 1100,
          cost: 50,
          date: '2026-03-06',
          createdAt: '2026-03-06T00:00:00.000Z',
          updatedAt: '2026-03-06T00:00:00.000Z',
        },
      ],
      [],
      [],
      now,
    );
    expect(outlook.actual).toBe(150);
    expect(outlook.expenseCount).toBe(2);
  });

  it('projects spend when at least 3 days elapsed and one expense', () => {
    const now = new Date(2026, 2, 10);
    const outlook = buildMonthOutlook(
      [fill({ id: 'f1', date: '2026-03-01', cost: 300, liters: 40, odometer: 1100, tankFull: true })],
      [],
      [],
      [],
      now,
    );
    expect(outlook.projected).toBe(Math.round((300 / 10) * 31));
  });

  it('omits projection before day 3 or with no expenses', () => {
    const early = new Date(2026, 2, 2);
    expect(
      buildMonthOutlook(
        [fill({ id: 'f1', date: '2026-03-01', cost: 100, liters: 40, odometer: 1100, tankFull: true })],
        [],
        [],
        [],
        early,
      ).projected,
    ).toBeNull();
    expect(buildMonthOutlook([], [], [], [], new Date(2026, 2, 10)).projected).toBeNull();
  });
});

describe('buildRecommendations', () => {
  it('prioritizes overdue before due soon and caps at three', () => {
    const c = car({
      id: 'c1',
      licenseExpiry: '2026-01-01',
      registrationExpiry: '2026-04-01',
    });
    const recs = buildRecommendations({
      settings,
      car: c,
      fills: [],
      maintenance: [
        {
          id: 'm1',
          carId: 'c1',
          type: 'oil',
          odometer: 4000,
          cost: 100,
          date: '2026-01-01',
          dueDate: '2026-04-01',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      breakdowns: [],
      other: [],
      periods: [],
      today: '2026-03-15',
    });
    expect(recs.length).toBeLessThanOrEqual(3);
    expect(recs[0]?.kind).toBe('overdue');
    expect(recs.some((r) => r.kind === 'dueSoon')).toBe(true);
  });

  it('returns fuel recommendation when consumption is high', () => {
    const recs = buildRecommendations({
      settings,
      car: car({ id: 'c1' }),
      fills: [
        fill({
          id: 'a',
          carId: 'c1',
          date: '2026-01-01',
          cost: 100,
          liters: 50,
          odometer: 1000,
          tankFull: true,
          distanceKm: 100,
        }),
        fill({
          id: 'b',
          carId: 'c1',
          date: '2026-02-01',
          cost: 120,
          liters: 60,
          odometer: 1100,
          tankFull: true,
          distanceKm: 100,
        }),
      ],
      maintenance: [],
      breakdowns: [],
      other: [],
      periods: [],
      today: '2026-03-01',
    });
    expect(recs.some((r) => r.kind === 'fuel' && r.id === 'fuel-high')).toBe(true);
  });

  it('returns spending recommendation when fuel dominates period', () => {
    const recs = buildRecommendations({
      settings,
      car: car({ id: 'c1' }),
      fills: [
        fill({
          id: 'f1',
          carId: 'c1',
          date: '2026-03-01',
          cost: 900,
          liters: 40,
          odometer: 1200,
          tankFull: true,
        }),
      ],
      maintenance: [
        {
          id: 'm1',
          carId: 'c1',
          type: 'oil',
          odometer: 1200,
          cost: 100,
          date: '2026-03-02',
          createdAt: '2026-03-02T00:00:00.000Z',
          updatedAt: '2026-03-02T00:00:00.000Z',
        },
      ],
      breakdowns: [],
      other: [],
      periods: [{ id: 'p1', carId: 'c1', startDate: '2026-01-01' }],
      today: '2026-03-15',
    });
    expect(recs.some((r) => r.kind === 'spending')).toBe(true);
  });

  it('falls back to local tip when nothing else matches', () => {
    const recs = buildRecommendations({
      settings,
      car: null,
      fills: [],
      maintenance: [],
      breakdowns: [],
      other: [],
      periods: [],
    });
    expect(recs).toHaveLength(1);
    expect(recs[0]?.kind).toBe('localTip');
  });
});
