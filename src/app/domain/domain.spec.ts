import { describe, expect, it } from 'vitest';
import { currencyLabel, listCurrencyOptions, validCurrency } from './currencies';
import { knownOdometer, latestEconomy } from './economy';
import { runEconomySelfCheck } from './economy.check';
import { runMaintenanceFieldsSelfCheck } from './maintenance-fields.check';
import type { FillUp } from './models';
import { buildDueItems, nextDueItem, todayDateOnly } from './dues';

function fill(
  partial: Partial<FillUp> &
    Pick<FillUp, 'id' | 'odometer' | 'liters' | 'cost' | 'tankFull'>,
): FillUp {
  return {
    date: '2026-01-01',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...partial,
  };
}

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
    expect(knownOdometer(9000, fills.filter((f) => f.id !== 'b'), [])).toBe(10000);
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

describe('backup version', () => {
  it('keeps backup version and IDB version as separate constants', async () => {
    const { BACKUP_VERSION, DB_VERSION } = await import('../core/config');
    expect(BACKUP_VERSION).toBe(1);
    expect(DB_VERSION).toBe(1);
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
