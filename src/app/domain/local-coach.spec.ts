import { describe, expect, it } from 'vitest';
import {
  FUEL_TIP_KEYS,
  detectCoachIntent,
  nextFuelTipKey,
  normalizeCoachQuery,
  parseCoachApiText,
} from './local-coach';
import type { Db } from '../data/db';

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

describe('parseCoachApiText', () => {
  it('reads common DevToolBox-shaped JSON fields', () => {
    expect(parseCoachApiText({ result: 'Check tire pressure monthly for better economy.' })).toMatch(
      /tire pressure/i,
    );
    expect(parseCoachApiText({ text: 'سجّل تنك مليان عشان الاستهلاك يبقى أدق.' })).toMatch(/تنك/);
    expect(parseCoachApiText({ short: 'x' })).toBeNull();
  });
});

describe('detectCoachIntent (Egyptian AR)', () => {
  it('normalizes tashkeel and ta marbuta', () => {
    expect(normalizeCoachQuery('الصِّيَانَة')).toContain('الصيانه');
  });

  it('maps FAQ-like and colloquial sentences', () => {
    expect(detectCoachIntent('إزاي أحسّن استهلاك البنزين؟')).toBe('economy');
    expect(detectCoachIntent('العربيه بتستهلك كتير اوي')).toBe('economy');
    expect(detectCoachIntent('صرفت كام الفترة دي؟')).toBe('period');
    expect(detectCoachIntent('كام دفعت الشهر ده')).toBe('period');
    expect(detectCoachIntent('عندي كام سجل صيانة؟')).toBe('maint');
    expect(detectCoachIntent('محتاج اغير الزيت امتى')).toBe('maint');
    expect(detectCoachIntent('في أعطال متكررة؟')).toBe('breakdown');
    expect(detectCoachIntent('العربيه خربانه تاني')).toBe('breakdown');
  });
});
