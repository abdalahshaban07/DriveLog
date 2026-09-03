import { describe, expect, it } from 'vitest';
import { currencyLabel, listCurrencyOptions, validCurrency } from './currencies';
import { knownOdometer, latestEconomy } from './economy';
import { runEconomySelfCheck } from './economy.check';
import { runMaintenanceFieldsSelfCheck } from './maintenance-fields.check';
import type { FillUp } from './models';
import { buildDueItems, nextDueItem, todayDateOnly } from './dues';

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

describe('fill-up cost', () => {
  it('computes cost from liters and unit price', async () => {
    const { computeFillUpCost, pickUnitPrice } = await import('./fill-up-cost');
    expect(computeFillUpCost(42.5, 1.6)).toBe(68);
    expect(pickUnitPrice('gasoline92', { countryCode: 'EG', countryName: 'Egypt', currency: 'EGP', solar: null, diesel: 1.4, gasoline92: 1.58, gasoline95: 1.62, gasoline: null }, null)).toBe(1.58);
  });
});

describe('economy', () => {
  it('matches contract example 9 L/100km and 0.33/km', () => {
    runEconomySelfCheck();
    const latest = latestEconomy([
      fill({ id: 'a', odometer: 10000, liters: 50, cost: 70, tankFull: true }),
      fill({ id: 'b', odometer: 10250, liters: 20, cost: 30, tankFull: false }),
      fill({ id: 'c', odometer: 10500, liters: 45, cost: 65, tankFull: true }),
    ]);
    expect(latest?.litersPer100Km).toBe(9);
    expect(latest?.costPerKm).toBe(0.33);
  });
});

describe('odometer', () => {
  it('uses initial when no records', () => {
    expect(knownOdometer(12000, [], [])).toBe(12000);
  });

  it('recalculates after highest fill-up removed', () => {
    const fills = [
      fill({ id: 'a', odometer: 10000, liters: 40, cost: 50, tankFull: true }),
      fill({ id: 'b', odometer: 11000, liters: 40, cost: 50, tankFull: true }),
    ];
    expect(knownOdometer(9000, fills, [])).toBe(11000);
    expect(
      knownOdometer(
        9000,
        fills.filter((f) => f.id !== 'b'),
        [],
      ),
    ).toBe(10000);
  });
});

describe('dues', () => {
  it('marks due soon within 14 days and 500 km inclusive', () => {
    const today = '2026-06-01';
    const items = buildDueItems(
      {
        language: 'en',
        theme: 'dark',
        currency: 'EGP',
        unitSystem: 'metric',
        installBannerDismissed: false,
        remindersEnabled: true,
        licenseExpiry: '2026-06-15',
      },
      [
        {
          id: 'm1',
          type: 'oil',
          odometer: 10000,
          cost: 0,
          date: today,
          dueKm: 10500,
          createdAt: today,
          updatedAt: today,
        },
      ],
      10000,
      today,
    );
    expect(items.find((i) => i.id === 'license')?.status).toBe('dueSoon');
    expect(items.find((i) => i.id === 'maint-m1')?.status).toBe('dueSoon');
  });

  it('does not mark due soon just outside windows', () => {
    const today = '2026-06-01';
    const items = buildDueItems(
      {
        language: 'en',
        theme: 'dark',
        currency: 'EGP',
        unitSystem: 'metric',
        installBannerDismissed: false,
        remindersEnabled: true,
        licenseExpiry: '2026-06-16',
      },
      [
        {
          id: 'm1',
          type: 'oil',
          odometer: 10000,
          cost: 0,
          date: today,
          dueKm: 10501,
          createdAt: today,
          updatedAt: today,
        },
      ],
      10000,
      today,
    );
    expect(items.find((i) => i.id === 'license')?.status).toBe('future');
    expect(items.find((i) => i.id === 'maint-m1')?.status).toBe('future');
  });

  it('orders overdue before due soon', () => {
    const today = todayDateOnly(new Date(2026, 5, 1));
    const next = nextDueItem(
      buildDueItems(
        {
          language: 'en',
          theme: 'dark',
          currency: 'EGP',
          unitSystem: 'metric',
          installBannerDismissed: false,
          remindersEnabled: true,
          licenseExpiry: '2026-07-01',
          registrationExpiry: '2026-05-01',
        },
        [],
        0,
        today,
      ),
    );
    expect(next?.id).toBe('registration');
    expect(next?.status).toBe('overdue');
  });

  it('omits license and registration dues when reminders are off', () => {
    const items = buildDueItems(
      {
        language: 'en',
        theme: 'dark',
        currency: 'EGP',
        unitSystem: 'metric',
        installBannerDismissed: false,
        remindersEnabled: false,
        licenseExpiry: '2026-06-15',
        registrationExpiry: '2026-05-01',
      },
      [],
      0,
      '2026-06-01',
    );
    expect(items.some((i) => i.source === 'license')).toBe(false);
    expect(items.some((i) => i.source === 'registration')).toBe(false);
  });

  it('prefers car license dates over legacy settings', () => {
    const items = buildDueItems(
      {
        language: 'en',
        theme: 'dark',
        currency: 'EGP',
        unitSystem: 'metric',
        installBannerDismissed: false,
        remindersEnabled: true,
        licenseExpiry: '2026-06-15',
      },
      [],
      0,
      '2026-06-01',
      { licenseExpiry: '2026-06-20' },
    );
    expect(items.find((i) => i.id === 'license')?.dueDate).toBe('2026-06-20');
  });
});

describe('currencies', () => {
  it('labels EGP in English and Arabic', () => {
    expect(currencyLabel('EGP', 'en')).toMatch(/EGP/);
    expect(currencyLabel('EGP', 'ar')).toMatch(/EGP/);
    expect(currencyLabel('EGP', 'ar')).not.toBe('EGP');
  });

  it('keeps the selected code in the list', () => {
    const opts = listCurrencyOptions('en', 'SAR');
    expect(opts.some((o) => o.value === 'SAR')).toBe(true);
    expect(opts[0]?.value).toBe('EGP');
  });

  it('rejects junk codes', () => {
    expect(validCurrency('EG')).toBe('EGP');
    expect(validCurrency('usd')).toBe('USD');
  });
});

describe('export csv', () => {
  it('filters by grade and date range', async () => {
    const { filterFillUps, fillUpsToCsv } = await import('./export-csv');
    const rows = [
      fill({ id: 'a', odometer: 1000, liters: 40, cost: 50, tankFull: true, fuelGrade: 'diesel' }),
      fill({ id: 'b', odometer: 1100, liters: 40, cost: 50, tankFull: true, fuelGrade: 'gasoline92', date: '2026-02-01' }),
    ];
    expect(filterFillUps(rows, { grade: 'diesel' }).map((f) => f.id)).toEqual(['a']);
    expect(filterFillUps(rows, { from: '2026-02-01' }).map((f) => f.id)).toEqual(['b']);
    expect(fillUpsToCsv(rows)).toContain('diesel');
  });

  it('filters maintenance by type and exports csv', async () => {
    const { filterMaintenance, maintenanceToCsv, rangeBoundsForPreset } = await import('./export-csv');
    const rows = [
      {
        id: 'm1',
        type: 'oil' as const,
        odometer: 1000,
        cost: 200,
        date: '2026-01-15',
        createdAt: '2026-01-15T00:00:00.000Z',
        updatedAt: '2026-01-15T00:00:00.000Z',
      },
      {
        id: 'm2',
        type: 'brakes' as const,
        odometer: 1100,
        cost: 400,
        date: '2026-03-01',
        createdAt: '2026-03-01T00:00:00.000Z',
        updatedAt: '2026-03-01T00:00:00.000Z',
      },
    ];
    expect(filterMaintenance(rows, { type: 'oil' }).map((m) => m.id)).toEqual(['m1']);
    expect(filterMaintenance(rows, { from: '2026-03-01' }).map((m) => m.id)).toEqual(['m2']);
    expect(maintenanceToCsv(rows)).toContain('brakes');
    expect(rangeBoundsForPreset('year', '2026-09-03')).toEqual({
      from: '2026-01-01',
      to: '2026-09-03',
    });
  });
});

describe('holidays', () => {
  it('nudges when due soon overlaps holiday window', async () => {
    const { dueHolidayNudge, parsePublicHolidays } = await import('./holidays');
    const holidays = parsePublicHolidays([
      { date: '2026-06-07', localName: 'Eid' },
    ]);
    expect(dueHolidayNudge('2026-06-10', holidays, '2026-06-01')?.localName).toBe('Eid');
    expect(dueHolidayNudge('2026-08-01', holidays, '2026-06-01')).toBeNull();
  });
});

describe('insights series', () => {
  it('builds economy trend from tank-full segments', async () => {
    const { economyTrend } = await import('./insights');
    const trend = economyTrend(
      [
        fill({ id: 'a', odometer: 1000, liters: 50, cost: 70, tankFull: true }),
        fill({ id: 'b', odometer: 1200, liters: 45, cost: 65, tankFull: true }),
      ],
      'all',
    );
    expect(trend.length).toBe(1);
    expect(trend[0]).toBeCloseTo(22.5, 1);
  });

  it('groups fuel grade cost share for the period', async () => {
    const { fuelGradeCostShare } = await import('./insights');
    const share = fuelGradeCostShare(
      [
        fill({ id: 'a', odometer: 1000, liters: 40, cost: 80, tankFull: true, fuelGrade: 'diesel' }),
        fill({ id: 'b', odometer: 1100, liters: 40, cost: 40, tankFull: true, fuelGrade: 'gasoline92', date: '2026-02-01' }),
        fill({ id: 'c', odometer: 1200, liters: 40, cost: 20, tankFull: true, date: '2026-02-15' }),
      ],
      'all',
    );
    expect(share).toEqual([
      { grade: 'diesel', cost: 80 },
      { grade: 'gasoline92', cost: 40 },
      { grade: 'unknown', cost: 20 },
    ]);
  });
});

describe('remote parsers', () => {
  it('parses Frankfurter FX and REST Countries', async () => {
    const { parseFxRate, parseRestCountries } = await import('../data/remote');
    expect(parseFxRate({ rates: { USD: 0.032 } }, 'EGP', 'USD')).toBe(0.032);
    const currencies = parseRestCountries([
      { flag: '🇪🇬', currencies: { EGP: { name: 'Egyptian pound' } } },
    ]);
    expect(currencies[0]?.code).toBe('EGP');
    expect(currencies[0]?.flag).toBe('🇪🇬');
  });
});

describe('backup version', () => {
  it('keeps backup version and IDB version as separate constants', async () => {
    const { BACKUP_VERSION, DB_VERSION } = await import('../core/config');
    expect(BACKUP_VERSION).toBe(4);
    expect(DB_VERSION).toBe(4);
  });
});

describe('maintenance fields', () => {
  it('normalizes extras, custom types, and part/labor sum', () => {
    runMaintenanceFieldsSelfCheck();
  });
});

describe('phase2', () => {
  it('vin, country, weather, openvan, overpass, intervals', async () => {
    const { runPhase2SelfCheck } = await import('./phase2.check');
    runPhase2SelfCheck();
  });
});

describe('i18n parity', () => {
  it('keeps EN and AR keys aligned', async () => {
    const { en } = await import('../i18n/en');
    const { ar } = await import('../i18n/ar');
    const enKeys = Object.keys(en).sort();
    const arKeys = Object.keys(ar).sort();
    expect(arKeys).toEqual(enKeys);
    for (const key of enKeys) {
      expect(ar[key as keyof typeof ar].trim().length).toBeGreaterThan(0);
    }
  });
});
