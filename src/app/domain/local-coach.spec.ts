import { describe, expect, it } from 'vitest';
import {
  FUEL_TIP_KEYS,
  detectCoachIntent,
  formatCoachText,
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

describe('formatCoachText', () => {
  it('breaks inline numbered lists onto new lines and soft-caps length', () => {
    const messy =
      'بص يا صاحبي العربية تمام. 1. سوا معتدل 2. صيانة منتظمة 3. متعبيش زيادة';
    const out = formatCoachText(messy, 280);
    expect(out).toContain('\n2.');
    expect(out).toContain('\n3.');
    expect(out!.length).toBeLessThanOrEqual(280);
  });

  it('strips markdown noise', () => {
    expect(formatCoachText('**Tip:** check *tires* monthly for economy.')).toMatch(/Tip: check tires/i);
  });

  it('drops a dangling bare list number from token cutoff', () => {
    const cut =
      'بص يا صاحبي:\n1. سوا بهدوء\n2. ضغط كاوتش مظبوط\n3. خفّف الحمولة\n4.';
    const out = formatCoachText(cut, 900);
    expect(out).toContain('3.');
    expect(out).not.toMatch(/\n4\.?\s*$/);
  });
});

describe('parseCoachApiText', () => {
  it('reads OpenAI/Groq choices and legacy JSON fields', () => {
    expect(parseCoachApiText({ result: 'Check tire pressure monthly for better economy.' })).toMatch(
      /tire pressure/i,
    );
    expect(
      parseCoachApiText({
        choices: [{ message: { content: 'Log a full tank so economy stays accurate.' } }],
      }),
    ).toMatch(/full tank/i);
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
