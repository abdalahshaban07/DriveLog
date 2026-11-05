import { describe, expect, it } from 'vitest';
import { detectAdvisorIntent, readAdvisor, scoreAdvisorIntents } from './advisor-intent';
import { ADVISOR_FAQ, type AdvisorFaqKey } from './advisor-card';
import { localCoachAnswer } from './local-coach';
import { coachLead, pickVariantKey, type AdvisorFacts, type CoachLogs } from './smart-advisor';
import type { MsgKey } from '../i18n/en';

const CORPUS: [string, ReturnType<typeof detectAdvisorIntent>][] = [
  // English — synonyms and natural phrasing.
  ['how much am I spending on petrol?', 'FUEL_SPENDING'],
  ['is my gas use going up?', 'FUEL_SPENDING'],
  ['what did the repair cost?', 'BREAKDOWN'],
  ['the car stopped working this morning', 'BREAKDOWN'],
  ['can I afford new tires', 'AFFORDABILITY'],
  ['is it worth it to replace the oil now', 'AFFORDABILITY'],
  ['when is the next service due', 'UPCOMING_MAINTENANCE'],
  ['budget check for this month', 'BUDGET_HEALTH'],
  ['am I in budget lately', 'BUDGET_HEALTH'],
  ['show my total spending', 'SPENDING_TREND'],
  ['what is the monthly total', 'SPENDING_TREND'],
  ['how many records do I have logged', 'MAINT_LOG'],
  ['history of the brakes', 'PART_HISTORY'],
  ['how much did I pay for brakes', 'PART_HISTORY'],
  ['which battery status do I have', 'PART_STATUS'],
  // Egyptian Arabic — dialect spellings after folding.
  ['السيارة واقفة من الصبح', 'BREAKDOWN'],
  ['كم صيانة عملت من أول', 'MAINT_LOG'],
  ['عايز أغير الكاوتش', 'MAINTENANCE_PRIORITY'],
  ['محتاج أغير الزيت', 'MAINTENANCE_PRIORITY'],
  ['البنزين زاد الشهر ده', 'FUEL_SPENDING'],
  ['العربية بتاعتي بتشرب بنزين كتير', 'FUEL_SPENDING'],
  ['ميزانية الصيانة عاملة إزاي', 'BUDGET_HEALTH'],
  ['أقدر أغير الفرامل دلوقتي', 'AFFORDABILITY'],
  ['مجموع اللي دفعته الفترة دي', 'SPENDING_TREND'],
  ['إجمالي المصروف من الأول', 'SPENDING_TREND'],
  ['صيانة جاية خلال شهر', 'UPCOMING_MAINTENANCE'],
  ['بطارية العربية تمام', 'PART_STATUS'],
  ['ضغط الكاوتش عامل إيه', 'PART_STATUS'],
  ['الفرامل محتاجة كشف', 'PART_STATUS'],
  // English — second wave: synonyms, casual voice, common misspellings.
  ['fuel economy is dropping', 'FUEL_SPENDING'],
  ['my consumption seems high lately', 'FUEL_SPENDING'],
  ['what is the mpg these days', 'FUEL_SPENDING'],
  ['average l/100 this month', 'FUEL_SPENDING'],
  ['how much for a full tank', 'FUEL_SPENDING'],
  ['petrol prices again', 'FUEL_SPENDING'],
  ['car broke down on the highway', 'BREAKDOWN'],
  ['the engine wont start today', 'BREAKDOWN'],
  ['there is a fault in the brakes', 'BREAKDOWN'],
  ['am I over budget this month', 'BUDGET_HEALTH'],
  ['how did I do on budget', 'BUDGET_HEALTH'],
  ["what's my total spend to date", 'SPENDING_TREND'],
  ['show expenses for june', 'SPENDING_TREND'],
  ['how much does the car consume', 'FUEL_SPENDING'],
  ['how many services have i done', 'MAINT_LOG'],
  ['how many records do i have on file', 'MAINT_LOG'],
  ['any maintenance coming up', 'UPCOMING_MAINTENANCE'],
  ['what needs doing next', 'UPCOMING_MAINTENANCE'],
  ['which part should I service first', 'MAINTENANCE_PRIORITY'],
  ['when do I need an oil change', 'MAINTENANCE_PRIORITY'],
  ['check the brakes status', 'PART_STATUS'],
  ['battery check', 'PART_STATUS'],
  ['tire pressure looks low', 'PART_STATUS'],
  ['can I afford new tires this month', 'AFFORDABILITY'],
  ['is a reserve for repairs realistic', 'RECOMMENDED_RESERVE'],
  // Egyptian Arabic — second wave, including tashkeel/tatweel/typo spellings.
  ['كم استهلاك العربية الشهر ده', 'FUEL_SPENDING'],
  ['السيارة بتستهلك بنزين أوى', 'FUEL_SPENDING'],
  ['البَنْزين غلى الشهر الماضى', 'FUEL_SPENDING'],
  ['وزن اللتر بقى كام', 'FUEL_SPENDING'],
  ['عيار التنك بقى كام', 'FUEL_SPENDING'],
  ['المحروقات والترفيه', 'FUEL_SPENDING'],
  ['المشكلة اللي حصلت بقالك أسبوع', 'BREAKDOWN'],
  ['العربية خربانه', 'BREAKDOWN'],
  ['العربية عندها عطل مفاجئ', 'BREAKDOWN'],
  ['إزاي أوفر في البنزين', 'COACH_ADVICE'],
  ['إزاي أنقص استهلاك العربية', 'COACH_ADVICE'],
  ['عايز أحسّن الاقتصاد في السواقه', 'COACH_ADVICE'],
  ['الميزانية بتقول إيه', 'BUDGET_HEALTH'],
  ['الخزنة كفاية الشهر ده', 'BUDGET_HEALTH'],
  ['كام مصرّف على العربية الشهر ده', 'SPENDING_TREND'],
  ['فلوس العربية عدّت كم', 'SPENDING_TREND'],
  ['كم مسرف من أول السنة', 'SPENDING_TREND'],
  ['الموتور محتاج تغيير زيت', 'MAINTENANCE_PRIORITY'],
  ['امتي أغير الكاوتش', 'MAINTENANCE_PRIORITY'],
  ['كم صيانه عليها من أول السنة', 'MAINT_LOG'],
  ['كام صيانه من أول ما اشتريت', 'MAINT_LOG'],
  ['صيانة قادمه على الوش', 'UPCOMING_MAINTENANCE'],
  ['هتحتاج صيانة قريبا', 'UPCOMING_MAINTENANCE'],
  ['أقدر أشتري إطارات جديدة', 'AFFORDABILITY'],
  ['الفرامـــل محتاجة تغيير', 'PART_STATUS'],
  ['بَطاريه العربية ضعيفه', 'PART_STATUS'],
  ['عايز أعمل صيانة دورية', 'PART_STATUS'],
];

describe('advisor intent corpus', () => {
  it.each(CORPUS)('reads %s as %s', (question, intent) => {
    expect(detectAdvisorIntent(question)).toBe(intent);
  });

  it('combines part + spend + window in one question', () => {
    const read = readAdvisor('كام صرفت على الفرامل الشهر ده');
    expect(read.intent).toBe('PART_HISTORY');
    expect(read.part).toBe('brakes');
    expect(read.window).toBe('period');
  });

  it('keeps ranked runner-ups for fallback suggestions', () => {
    const scored = scoreAdvisorIntents('كام صرفت على الفرامل');
    expect(scored.length).toBeGreaterThanOrEqual(2);
    const intents = scored.map((entry) => entry.intent);
    expect(intents).toContain('PART_STATUS');
    expect(intents).toContain('SPENDING_TREND');
  });
});

describe('follow-up carry', () => {
  it('shifts only the window for a bare «والشهر اللي فات؟»', () => {
    const spent = readAdvisor('صرفت كام');
    expect(readAdvisor('والشهر اللي فات؟', spent)).toMatchObject({
      intent: 'SPENDING_TREND',
      window: 'prev',
    });
  });

  it('detects the previous month without carry as well', () => {
    expect(readAdvisor('مصروف الشهر اللي فات كام').window).toBe('prev');
    expect(readAdvisor('what did I spend last month', null).window).toBe('prev');
  });

  it('carries intent + part when only the window shifts', () => {
    const brakes = readAdvisor('كام صرفت على الفرامل الشهر ده');
    expect(readAdvisor('والشهر اللي فات؟', brakes)).toMatchObject({
      intent: 'PART_HISTORY',
      part: 'brakes',
      window: 'prev',
    });
  });

  it('a stronger new signal replaces the carried intent', () => {
    const brakes = readAdvisor('كام صرفت على الفرامل الشهر ده');
    expect(readAdvisor('البنزين بقى غالي أوى', brakes).intent).toBe('FUEL_SPENDING');
  });

  it('reads the same intent through tashkeel and tatweel', () => {
    expect(readAdvisor('البَنْزين زاد').intent).toBe('FUEL_SPENDING');
    expect(readAdvisor('الفرامـــل').intent).toBe('PART_STATUS');
  });
});

describe('pickVariantKey', () => {
  const splitParams = {
    total: 1,
    fuel: 1,
    maintenance: 1,
    breakdown: 1,
    other: 1,
    currency: 'EGP',
    car: 'Tiko',
  };

  it('is deterministic for the same question', () => {
    const a = pickVariantKey('advisor.answer.spendSplit', 'صرفت كام', splitParams);
    const b = pickVariantKey('advisor.answer.spendSplit', 'صرفت كام', splitParams);
    expect(a).toBe(b);
  });

  it('rotates tone across questions when a variant exists', () => {
    const seen = new Set<MsgKey>();
    for (let i = 0; i < 40; i++) {
      seen.add(pickVariantKey('advisor.answer.spendSplit', `صرفت كام ${i}`, splitParams));
    }
    expect(seen.has('advisor.answer.spendSplit')).toBe(true);
    expect(seen.has('advisor.answer.spendSplit_v2')).toBe(true);
  });

  it('never picks a variant whose placeholders are missing', () => {
    const { car: _car, ...noCar } = splitParams;
    for (let i = 0; i < 40; i++) {
      expect(pickVariantKey('advisor.answer.spendSplit', `q${i}`, noCar)).toBe(
        'advisor.answer.spendSplit',
      );
    }
  });
});

function facts(): AdvisorFacts {
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
  };
}

function logs(over: Partial<CoachLogs> = {}): CoachLogs {
  return {
    currency: 'EGP',
    periodTotal: 100,
    maintenanceCount: 3,
    breakdownCount: 2,
    lastL100: 8,
    ...over,
  };
}

// Key passthrough that keeps params visible for assertions.
const t = (key: MsgKey, params?: Record<string, string | number>) =>
  params && Object.keys(params).length
    ? `${key}(${Object.entries(params)
        .map(([k, v]) => `${k}=${v}`)
        .join(',')})`
    : key;

describe('coach human layer', () => {
  it('acknowledges a repeated part before the numbers', () => {
    const lead = coachLead(
      { intent: 'PART_HISTORY', part: 'brakes', window: 'period' },
      facts(),
      logs({
        services: [
          { kind: 'brakes', name: '', date: '2026-02-01', odometer: 100 },
          { kind: 'brakes', name: '', date: '2026-03-01', odometer: 200 },
        ],
      }),
      t,
    );
    expect(lead?.key).toBe('advisor.lead.repeatPart');
  });

  it('stays quiet when there is nothing to acknowledge', () => {
    expect(coachLead({ intent: 'MAINT_LOG', window: 'period' }, facts(), logs(), t)).toBeNull();
  });

  it('answers the previous month with the stored outlook number', () => {
    const reply = localCoachAnswer('والشهر اللي فات؟', facts(), logs({ monthPrevious: 611.4 }), t, {
      intent: 'SPENDING_TREND',
      window: 'prev',
    });
    expect(reply.text).toContain('advisor.answer.spendPrev');
    expect(reply.text).toContain('611');
  });

  it('offers one follow-up question after a data answer', () => {
    const reply = localCoachAnswer('صرفت كام', facts(), logs(), t);
    const suggestions = reply.suggestions ?? [];
    expect(suggestions.length).toBe(1);
    expect(suggestions[0]).toBe('assistant.faq.economy' satisfies AdvisorFaqKey);
  });

  it('offers two ready questions when it cannot parse the ask', () => {
    const reply = localCoachAnswer('طير زي الزلط', facts(), logs(), t);
    expect(reply.suggestions?.length).toBe(2);
    const faqKeys = ADVISOR_FAQ.map((item) => item.key);
    for (const chip of reply.suggestions ?? []) expect(faqKeys).toContain(chip);
  });

  it('weaves the car nickname into text answers', () => {
    const reply = localCoachAnswer('صرفت كام الشهر اللي فات', facts(), logs({ carName: 'Tiko' }), t);
    expect(reply.card).toBeFalsy();
    expect(reply.text).toContain('car=Tiko');
  });
});
