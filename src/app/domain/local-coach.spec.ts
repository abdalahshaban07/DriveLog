import { describe, expect, it } from 'vitest';
import {
  detectAdvisorIntent,
  intentFromFaqKey,
  normalizeAdvisorText,
  readAdvisor,
} from './advisor-intent';
import { FUEL_TIP_KEYS, nextFuelTipKey } from './fuel-tips';
import { buildCoachLogs, coachPrompt, coachSnapshot, type CoachSnapshot } from './local-coach';
import type { Breakdown, Car, FillUp, Maintenance, PartDefinition } from './models';
import { SYSTEM_BRAKE_DISCS_ID, SYSTEM_BRAKE_PADS_ID, SYSTEM_ENGINE_OIL_ID } from './part-catalog';
import type { HealthItem } from './vehicle-health';
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
    expect(detectAdvisorIntent('الصرف')).toBe('SPENDING_TREND');
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

  it('keeps the part when a repair word is the same length', () => {
    const read = readAdvisor('تصليح الفرامل');
    expect(read.intent).toBe('PART_HISTORY');
    expect(read.part).toBe('brakes');
  });

  it('reads Egyptian follow-ups and the short dialect lines', () => {
    expect(detectAdvisorIntent('العربيه بتاكل')).toBe('FUEL_SPENDING');
    expect(detectAdvisorIntent('الزيت خلص')).toBe('MAINTENANCE_PRIORITY');
    const tires = readAdvisor('امتى اغير الكوتش');
    expect(tires.intent).toBe('MAINTENANCE_PRIORITY');
    expect(tires.part).toBe('tires');

    const spent = readAdvisor('صرفت كام');
    expect(readAdvisor('والزيت؟', spent)).toEqual({
      intent: 'PART_STATUS',
      part: 'oil',
      window: 'period',
    });
    expect(readAdvisor('وطيب؟', spent).intent).toBe('SPENDING_TREND');
    expect(readAdvisor('وصرفت كام', spent).intent).toBe('SPENDING_TREND');
    const history = readAdvisor('تاريخ الفرامل');
    expect(readAdvisor('والزيت', history)).toMatchObject({
      intent: 'PART_HISTORY',
      part: 'oil',
    });
  });
});

describe('coachPrompt', () => {
  it('names this month in Arabic and keeps zero distinct from missing', () => {
    const snapshot: CoachSnapshot = {
      nickname: 'تست',
      odometer: 45540,
      currency: 'جنيه',
      budgetHealth: 'HEALTHY',
      affordability: 'UNKNOWN',
      recommendedReserve: null,
      reserveTarget: null,
      monthlyBudget: null,
      eligible90: 0,
      fuelRisePct: null,
      lastL100: 7.9,
      periodTotal: 1812,
      fuel: 1812,
      maintenance: 0,
      breakdown: 0,
      other: 0,
      maintenanceCount: 4,
      breakdownCount: 0,
      parts: [{ name: 'تيل الفرامل', status: 'افحص' }],
    };
    const prompt = coachPrompt(snapshot, 'ar');
    expect(prompt).toContain('مصروف الشهر ده: 1812 جنيه');
    expect(prompt).toContain('بنزين الشهر: 1812 جنيه');
    expect(prompt).toContain('صيانة الشهر: 0 جنيه');
    expect(prompt).toContain('كل سجلات الصيانة: 4');
    expect(prompt).toContain('صيانة متوقعة خلال 90 يوم: 0 جنيه');
    expect(prompt).toContain('آخر مصروف: مش متسجل');
    expect(prompt).toContain('ميزانية الصيانة: مش متسجل');
    expect(prompt).toContain('الرقم 0 معناه صفر');
    expect(prompt).toContain('أسطر «كل سجلات» عدد السجلات من الأول');
    expect(prompt).toContain('- تيل الفرامل: افحص');
    expect(prompt).not.toContain('"fuel"');
  });

  it('carries the same facts as the answer cards, including a healthy part', () => {
    const snapshot: CoachSnapshot = {
      nickname: 'تست',
      odometer: 45540,
      currency: 'جنيه',
      budgetHealth: 'HEALTHY',
      affordability: 'UNKNOWN',
      recommendedReserve: null,
      reserveTarget: null,
      monthlyBudget: null,
      eligible90: 900,
      fuelRisePct: null,
      lastL100: 7.9,
      periodTotal: 1420,
      fuel: 1420,
      maintenance: 0,
      breakdown: 0,
      other: 0,
      maintenanceCount: 4,
      breakdownCount: 1,
      parts: [],
      lastSpend: { label: 'بنزين', amount: 400, date: '2026-10-02' },
      allTotal: 9000,
      allFuel: 7000,
      allMaintenance: 1500,
      allBreakdown: 500,
      allOther: 0,
      monthProjected: 5503,
      monthPrevious: 3857,
      fuelLiters: 77.6,
      fuelPrevLiters: 99,
      fuelKm: 982,
      fuelPrevKm: 1225,
      oil: {
        name: 'زيت المحرك',
        status: 'كويس',
        remainingKm: 3960,
        lastDate: '2026-09-05',
        lastOdo: 44500,
      },
      tires: null,
      brakes: null,
      lastFault: { title: 'صوت فرامل', date: '2026-03-02' },
    };
    const prompt = coachPrompt(snapshot, 'ar');
    expect(prompt).toContain('آخر مصروف: بنزين 400 جنيه · 2026-10-02');
    expect(prompt).toContain('كل المصروف: 9000 جنيه');
    expect(prompt).toContain('مصاريف تانية من الأول: 0 جنيه');
    expect(prompt).toContain('المتوقع آخر الشهر: 5503 جنيه');
    expect(prompt).toContain('الشهر اللي فات: 3857 جنيه');
    expect(prompt).toContain('لتر البنزين: 77.6 لتر مقابل 99 لتر');
    expect(prompt).toContain('كم البنزين: 982 كم مقابل 1225 كم');
    expect(prompt).toContain('الزيت: زيت المحرك · كويس · الباقي 3960 كم · آخر تغيير 2026-09-05 · 44500 كم');
    expect(prompt).toContain('الكاوتش: مش متسجل');
    expect(prompt).toContain('آخر عطل: صوت فرامل · 2026-03-02');
    expect(prompt).toContain('صيانة متوقعة خلال 90 يوم: 900 جنيه');
  });
});

describe('coachSnapshot', () => {
  it('keeps a healthy part and the worse brake', () => {
    const car: Car = {
      id: 'c1',
      nickname: 'تست',
      initialOdometer: 0,
      currentOdometer: 45540,
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    };
    const snapshot = coachSnapshot(
      facts({
        healthItems: [
          part(SYSTEM_ENGINE_OIL_ID, 'good', 3960),
          part(SYSTEM_BRAKE_PADS_ID, 'good', 8000),
          part(SYSTEM_BRAKE_DISCS_ID, 'due', 200),
        ],
      }),
      {
        ...logs,
        currency: 'جنيه',
        lastSpend: { bucket: 'fuel', amount: 400.4, date: '2026-10-02' },
        allTotal: 10,
        monthProjected: 5503,
        monthPrevious: 0,
      },
      { fuel: 1420, maintenance: 0, breakdowns: 0, other: 0, total: 1420 },
      car,
      t,
    );
    expect(snapshot.oil).toMatchObject({
      status: 'health.status.good',
      remainingKm: 3960,
    });
    expect(snapshot.brakes).toMatchObject({
      name: SYSTEM_BRAKE_DISCS_ID,
      status: 'health.status.due',
      remainingKm: 200,
    });
    expect(snapshot.lastSpend).toEqual({
      label: 'advisor.bucket.fuel',
      amount: 400,
      date: '2026-10-02',
    });
    expect(snapshot.monthPrevious).toBe(0);
  });
});

function part(id: string, status: HealthItem['status'], remainingKm: number): HealthItem {
  const definition: PartDefinition = {
    id,
    category: 'ENGINE',
    source: 'system',
    trackingMode: 'interval',
    active: true,
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
  };
  return {
    partDefinitionId: id,
    part: definition,
    status,
    reasons: [],
    confidence: 'high',
    primarySource: 'USER_HISTORY',
    sources: ['USER_HISTORY'],
    remainingKm,
  };
}

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

  it('answers from the rows: split, last part, last fault, fuel delta', () => {
    const built = buildCoachLogs(
      'EGP',
      { fuel: 80, maintenance: 200.4, breakdowns: 50, other: 10, total: 340.4 },
      [fill('a', '2026-01-01', 100, 8, 40), fill('b', '2026-02-01', 100, 10, 50)],
      [service('oil', '2026-01-15', 1000), service('brakes', '2026-03-01', 1800)],
      [fault('صوت فرامل', '2026-03-02')],
      [],
    );

    const spend = askLocal('صرفت كام', facts(), built, t);
    expect(spend.bodyKey).toBe('advisor.answer.spendSplit');
    expect(spend.params).toMatchObject({
      total: 340,
      fuel: 80,
      maintenance: 200,
      breakdown: 50,
      other: 10,
    });

    const brakes = askLocal('تاريخ الفرامل', facts(), built, t);
    expect(brakes.bodyKey).toBe('advisor.answer.partHistoryLast');
    expect(brakes.params).toMatchObject({ date: '2026-03-01', km: 1800 });

    const faultReply = askLocal('في عطل؟', facts(), built, t);
    expect(faultReply.bodyKey).toBe('advisor.answer.breakdownLast');
    expect(faultReply.params).toMatchObject({ title: 'صوت فرامل', date: '2026-03-02' });

    const economy = askLocal('بنزين', facts(), built, t);
    expect(economy.bodyKey).toBe('advisor.answer.fuelDelta');
    expect(economy.params).toEqual({ l100: 10, prev: 8, delta: 2 });

    const all = askLocal('كل المصروف', facts(), built, t);
    expect(all.bodyKey).toBe('advisor.answer.spendAll');
    expect(all.params).toMatchObject({
      fuel: 90,
      maintenance: 200,
      breakdown: 50,
      other: 0,
      total: 340,
    });
  });
});

function fill(id: string, date: string, distanceKm: number, liters: number, cost: number): FillUp {
  return {
    id,
    date,
    distanceKm,
    liters,
    cost,
    odometer: distanceKm,
    tankFull: false,
    createdAt: `${date}T00:00:00.000Z`,
    updatedAt: `${date}T00:00:00.000Z`,
  } as FillUp;
}

function service(type: Maintenance['type'], date: string, odometer: number): Maintenance {
  return {
    id: `${type}-${date}`,
    type,
    date,
    odometer,
    cost: type === 'brakes' ? 200.4 : 0,
    createdAt: `${date}T00:00:00.000Z`,
    updatedAt: `${date}T00:00:00.000Z`,
  } as Maintenance;
}

function fault(symptom: string, date: string): Breakdown {
  return {
    id: date,
    carId: 'c1',
    symptom,
    repairCost: 50,
    odometer: 1,
    date,
    category: 'mechanical',
    createdAt: `${date}T00:00:00.000Z`,
    updatedAt: `${date}T00:00:00.000Z`,
  };
}
