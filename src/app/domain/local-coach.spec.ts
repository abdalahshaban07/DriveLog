import { describe, expect, it } from 'vitest';
import {
  detectAdvisorIntent,
  intentFromFaqKey,
  normalizeAdvisorText,
} from './advisor-intent';
import { FUEL_TIP_KEYS, nextFuelTipKey } from './fuel-tips';
import { askLocal, type AdvisorFacts, type CoachLogs } from './smart-advisor';
import type { Db } from '../data/db';
import type { MsgKey } from '../i18n/en';

function mockDb(): Db {
  const fills = [
    {
      id: 'f1',
      odometer: 1000,
      liters: 40,
      cost: 50,
      tankFull: true,
      createdAt: '2026-01-01T00:00:00.000Z',
      date: '2026-01-01',
    },
    {
      id: 'f2',
      odometer: 1100,
      liters: 40,
      cost: 50,
      tankFull: true,
      createdAt: '2026-02-01T00:00:00.000Z',
      date: '2026-02-01',
    },
  ];
  return {
    car: () => ({ currentOdometer: 12000, id: 'c1', initialOdometer: 0, name: 'Test' }),
    fillUps: () => fills as ReturnType<Db['fillUps']>,
  } as unknown as Db;
}

function facts(over: Partial<AdvisorFacts> = {}): AdvisorFacts {
  return {
    budgetHealth: 'HEALTHY',
    healthItems: [],
    eligible90: 0,
    fuelRisePct: null,
    costAnomaly: false,
    savingRecommendation: false,
    forecastAvailable: false,
    dataQuality: [],
    monthlyBudget: null,
    recommendedReserve: null,
    reserveTarget: null,
    affordability: 'UNKNOWN',
    ...over,
  };
}

const logs: CoachLogs = {
  currency: 'EGP',
  periodTotal: 1500.4,
  maintenanceCount: 4,
  breakdownCount: 2,
  lastL100: 8.5,
};

const t = (key: MsgKey) => key;

describe('nextFuelTipKey', () => {
  it('returns a different key on consecutive calls', () => {
    const db = mockDb();
    const first = FUEL_TIP_KEYS[0]!;
    const second = nextFuelTipKey(first, db);
    expect(second).not.toBe(first);
    const third = nextFuelTipKey(second, db);
    expect(third).not.toBe(second);
  });
});

describe('detectAdvisorIntent (Egyptian AR)', () => {
  it('normalizes tashkeel and ta marbuta', () => {
    expect(normalizeAdvisorText('الصِّيَانَة')).toContain('الصيانه');
  });

  it('maps FAQ-like and colloquial sentences', () => {
    expect(detectAdvisorIntent('إزاي أحسّن استهلاك البنزين؟')).toBe('FUEL_SPENDING');
    expect(detectAdvisorIntent('العربيه بتستهلك كتير اوي')).toBe('FUEL_SPENDING');
    expect(detectAdvisorIntent('صرفت كام الفترة دي؟')).toBe('SPENDING_TREND');
    expect(detectAdvisorIntent('كام دفعت الشهر ده')).toBe('SPENDING_TREND');
    expect(detectAdvisorIntent('عندي كام سجل صيانة؟')).toBe('MAINT_LOG');
    expect(detectAdvisorIntent('محتاج اغير الزيت امتى')).toBe('MAINTENANCE_PRIORITY');
    expect(detectAdvisorIntent('في أعطال متكررة؟')).toBe('BREAKDOWN');
    expect(detectAdvisorIntent('العربيه خربانه تاني')).toBe('BREAKDOWN');
  });

  it('lets the FAQ chip name the intent', () => {
    expect(intentFromFaqKey('assistant.faq.period')).toBe('SPENDING_TREND');
    expect(intentFromFaqKey('app.name')).toBeUndefined();
  });
});

describe('askLocal', () => {
  it('fills the answer with the number it already computed', () => {
    const reserve = askLocal('احتياطي', facts({ recommendedReserve: 800 }), logs, t);
    expect(reserve.bodyKey).toBe('advisor.answer.reserveBody');
    expect(reserve.params).toEqual({ amount: 800, currency: 'EGP' });

    const fuel = askLocal('بنزين', facts({ fuelRisePct: 25.4 }), logs, t);
    expect(fuel.params).toEqual({ pct: 25 });

    const economy = askLocal('fuel', facts(), logs, t);
    expect(economy.bodyKey).toBe('advisor.answer.fuelEconomy');
    expect(economy.params).toEqual({ l100: 8.5 });

    const spend = askLocal('صرفت كام', facts(), logs, t);
    expect(spend.params).toEqual({ total: 1500, currency: 'EGP' });
  });

  it('uses the FAQ hint instead of the question text', () => {
    const hinted = askLocal('fuel economy', facts(), logs, t, 'BREAKDOWN');
    expect(hinted.bodyKey).toBe('advisor.answer.breakdownBody');
    expect(hinted.params).toEqual({ count: 2 });
  });
});
