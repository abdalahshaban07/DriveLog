import { describe, expect, it } from 'vitest';
import type { CountryFuelPrices } from '../data/remote';
import { normalizeFuelPriceSnapshot } from '../data/db-normalize';
import type { FillUp, FuelPriceSnapshot } from './models';
import {
  boardHasPrices,
  changeEventKey,
  gradeTrend,
  lastFillImpact,
  latestChanges,
  mergeSnapshot,
  samePrices,
  snapshotFromBoard,
} from './fuel-price-watch';

function board(over: Partial<CountryFuelPrices> = {}): CountryFuelPrices {
  return {
    countryCode: 'EG',
    countryName: 'Egypt',
    currency: 'EGP',
    solar: 10,
    diesel: 11,
    gasoline92: 12,
    gasoline95: 14.2,
    gasoline: 12,
    ...over,
  };
}

function snap(day: string, over: Partial<FuelPriceSnapshot> = {}): FuelPriceSnapshot {
  const base: FuelPriceSnapshot = {
    id: `EG:${day}`,
    countryCode: 'EG',
    day,
    currency: 'EGP',
    gasoline92: 12,
    gasoline95: 14.2,
    diesel: 11,
    solar: 10,
  };
  return { ...base, ...over };
}

function fill(over: Partial<FillUp> = {}): FillUp {
  return {
    id: 'f1',
    odometer: 1000,
    liters: 40,
    cost: 480,
    tankFull: true,
    fuelGrade: 'gasoline92',
    date: '2026-10-01',
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    ...over,
  };
}

describe('snapshotFromBoard', () => {
  it('builds a country/day keyed snapshot and uppercases the code', () => {
    const s = snapshotFromBoard(board({ countryCode: 'eg' }), '2026-11-08');
    expect(s.id).toBe('EG:2026-11-08');
    expect(s.countryCode).toBe('EG');
    expect(s.gasoline92).toBe(12);
    expect(s.solar).toBe(10);
  });

  it('boardHasPrices is false only when every watched grade is null', () => {
    expect(
      boardHasPrices(
        board({ solar: null, diesel: null, gasoline92: null, gasoline95: null }),
      ),
    ).toBe(false);
    expect(boardHasPrices(board({ gasoline95: null }))).toBe(true);
  });
});

describe('mergeSnapshot', () => {
  it('keeps the first observation', () => {
    const s = snap('2026-10-17');
    const { history, changed } = mergeSnapshot([], s);
    expect(changed).toBe(true);
    expect(history).toEqual([s]);
  });

  it('ignores later days at the same price level', () => {
    const first = snap('2026-10-17');
    const { history, changed } = mergeSnapshot([first], snap('2026-11-08'));
    expect(changed).toBe(false);
    expect(history).toEqual([first]);
  });

  it('ignores same-day refetches with identical prices', () => {
    const first = snap('2026-11-08');
    const { changed } = mergeSnapshot([first], snap('2026-11-08'));
    expect(changed).toBe(false);
  });

  it('records a revision and keeps both levels in day order', () => {
    const first = snap('2026-10-17');
    const next = snap('2026-11-08', { gasoline92: 13.5 });
    const { history, changed } = mergeSnapshot([first], next);
    expect(changed).toBe(true);
    expect(history.map((h) => h.day)).toEqual(['2026-10-17', '2026-11-08']);
    expect(samePrices(history[0]!, first)).toBe(true);
  });

  it('replaces a same-day row when prices are revised intraday', () => {
    const morning = snap('2026-11-08');
    const revised = snap('2026-11-08', { gasoline92: 13.75 });
    const { history, changed } = mergeSnapshot([morning], revised);
    expect(changed).toBe(true);
    expect(history).toHaveLength(1);
    expect(history[0]!.gasoline92).toBe(13.75);
  });

  it('caps change points per country without touching other countries', () => {
    const rows = ['2026-01-01', '2026-02-01', '2026-03-01', '2026-04-01'].map((d, i) =>
      snap(d, { gasoline92: 10 + i }),
    );
    const other = snap('2026-01-01', { id: 'SA:2026-01-01', countryCode: 'SA' });
    const { history } = mergeSnapshot([...rows, other], snap('2026-05-01', { gasoline92: 20 }), 3);
    const eg = history.filter((h) => h.countryCode === 'EG');
    expect(eg.map((h) => h.day)).toEqual(['2026-03-01', '2026-04-01', '2026-05-01']);
    expect(history.some((h) => h.countryCode === 'SA')).toBe(true);
  });
});

describe('latestChanges', () => {
  const today = '2026-11-08';

  it('is silent until a second level exists', () => {
    expect(latestChanges([snap('2026-11-08')], 'EG', today)).toEqual([]);
    expect(latestChanges([], 'EG', today)).toEqual([]);
  });

  it('diffs every changed grade and skips null/unchanged ones', () => {
    const history = [
      snap('2026-10-17'),
      snap('2026-11-08', { gasoline92: 13.5, gasoline95: null, diesel: 10 }),
    ];
    const changes = latestChanges(history, 'EG', today);
    expect(changes.map((c) => c.grade)).toEqual(['gasoline92', 'diesel']);
    const up = changes[0]!;
    expect(up.from).toBe(12);
    expect(up.to).toBe(13.5);
    expect(up.delta).toBe(1.5);
    expect(up.pct).toBeCloseTo(12.5);
    expect(up.day).toBe('2026-11-08');
    expect(up.previousDay).toBe('2026-10-17');
    expect(changes[1]!.delta).toBe(-1);
  });

  it('stays silent when the latest change is stale', () => {
    const history = [snap('2026-06-01'), snap('2026-08-01', { gasoline92: 13 })];
    expect(latestChanges(history, 'EG', today)).toEqual([]);
    expect(latestChanges(history, 'EG', today, 120)).toHaveLength(1);
  });

  it('matches case-insensitively on country code', () => {
    const history = [snap('2026-10-17'), snap('2026-11-08', { gasoline92: 13 })];
    expect(latestChanges(history, 'eg', today)).toHaveLength(1);
  });
});

describe('changeEventKey', () => {
  it('is stable for one event and changes with a new day or price', () => {
    const a = latestChanges([snap('2026-10-17'), snap('2026-11-08', { gasoline92: 13 })], 'EG', '2026-11-08');
    const b = latestChanges([snap('2026-10-17'), snap('2026-11-08', { gasoline92: 13 })], 'EG', '2026-11-08');
    const c = latestChanges([snap('2026-10-17'), snap('2026-11-09', { gasoline92: 13 })], 'EG', '2026-11-09');
    const d = latestChanges([snap('2026-10-17'), snap('2026-11-08', { gasoline92: 14 })], 'EG', '2026-11-08');
    expect(changeEventKey('EG', a)).toBe(changeEventKey('eg', b));
    expect(changeEventKey('EG', a)).not.toBe(changeEventKey('EG', c));
    expect(changeEventKey('EG', a)).not.toBe(changeEventKey('EG', d));
  });
});

describe('lastFillImpact', () => {
  const changes = latestChanges(
    [snap('2026-10-17'), snap('2026-11-08', { gasoline92: 13.5 })],
    'EG',
    '2026-11-08',
  );

  it('computes savings from the last pre-change fill of a hiked grade', () => {
    const impact = lastFillImpact(changes, [fill({ liters: 40 })], 'EGP');
    expect(impact).not.toBeNull();
    expect(impact!.grade).toBe('gasoline92');
    expect(impact!.amount).toBe(60);
    expect(impact!.fillDate).toBe('2026-10-01');
  });

  it('picks the most recent qualifying fill', () => {
    const fills = [
      fill({ id: 'old', date: '2026-09-01', liters: 30 }),
      fill({ id: 'new', date: '2026-10-10', liters: 50 }),
    ];
    expect(lastFillImpact(changes, fills, 'EGP')!.amount).toBe(75);
  });

  it('ignores fills at/after the change, other currencies, and price drops', () => {
    expect(lastFillImpact(changes, [fill({ date: '2026-11-08' })], 'EGP')).toBeNull();
    expect(lastFillImpact(changes, [fill({ currency: 'SAR' })], 'EGP')).toBeNull();
    const drops = latestChanges(
      [snap('2026-10-17'), snap('2026-11-08', { gasoline92: 11 })],
      'EG',
      '2026-11-08',
    );
    expect(lastFillImpact(drops, [fill()], 'EGP')).toBeNull();
  });
});

describe('gradeTrend', () => {
  it('returns ordered non-null prices for the sparkline', () => {
    const history = [
      snap('2026-11-08', { gasoline92: 13.5 }),
      snap('2026-10-17'),
      snap('2026-09-01', { gasoline92: null }),
    ];
    expect(gradeTrend(history, 'EG', 'gasoline92')).toEqual([12, 13.5]);
  });
});

describe('normalizeFuelPriceSnapshot', () => {
  it('rebuilds the id and coerces invalid prices to null', () => {
    const s = normalizeFuelPriceSnapshot({
      countryCode: 'eg',
      day: '2026-11-08',
      currency: 'EGP',
      gasoline92: '13.5',
      gasoline95: -2,
      diesel: null,
      solar: 10,
    });
    expect(s).not.toBeNull();
    expect(s!.id).toBe('EG:2026-11-08');
    expect(s!.gasoline92).toBe(13.5);
    expect(s!.gasoline95).toBeNull();
    expect(s!.diesel).toBeNull();
  });

  it('drops rows with a bad day or country code', () => {
    expect(normalizeFuelPriceSnapshot({ countryCode: 'EG', day: 'yesterday' })).toBeNull();
    expect(normalizeFuelPriceSnapshot({ countryCode: 'EGY', day: '2026-11-08' })).toBeNull();
    expect(normalizeFuelPriceSnapshot(null)).toBeNull();
  });
});