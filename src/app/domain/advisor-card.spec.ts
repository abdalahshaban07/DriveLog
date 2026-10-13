import { describe, expect, it } from 'vitest';
import {
  ADVISOR_FAQ,
  advisorFaqVisible,
  buildAnswerCard,
  cardText,
  faqQueryMatch,
  faqSuggests,
  markFaqQuery,
  namedPartCard,
} from './advisor-card';
import { localCoachAnswer } from './local-coach';
import { SYSTEM_ENGINE_OIL_ID } from './part-catalog';
import type { PartDefinition } from './models';
import type { AdvisorFacts, CoachLogs } from './smart-advisor';
import type { HealthItem } from './vehicle-health';
import { ar } from '../i18n/ar';
import type { MsgKey } from '../i18n/en';

const t = (key: MsgKey, params?: Record<string, string | number>) =>
  params ? `${key} ${Object.values(params).join(' ')}` : key;

function facts(over: Partial<AdvisorFacts> = {}): AdvisorFacts {
  return {
    budgetHealth: 'UNKNOWN',
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

function logs(over: Partial<CoachLogs> = {}): CoachLogs {
  return {
    currency: 'جنيه',
    periodTotal: 0,
    maintenanceCount: 0,
    breakdownCount: 0,
    lastL100: null,
    ...over,
  };
}

function oil(over: Partial<HealthItem> = {}): HealthItem {
  const part: PartDefinition = {
    id: SYSTEM_ENGINE_OIL_ID,
    labelKey: 'parts.engineOil',
    category: 'ENGINE',
    source: 'system',
    trackingMode: 'interval',
    manufacturerIntervalKm: 10000,
    active: true,
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
  };
  return {
    partDefinitionId: SYSTEM_ENGINE_OIL_ID,
    part,
    status: 'soon',
    reasons: [],
    confidence: 'high',
    primarySource: 'USER_HISTORY',
    sources: ['USER_HISTORY'],
    remainingKm: 800,
    lastServiceDate: '2026-06-01',
    lastServiceOdo: 40000,
    ...over,
  };
}

describe('buildAnswerCard', () => {
  it('shows this month without zero categories, plus the projection and last month', () => {
    const card = buildAnswerCard(
      { intent: 'SPENDING_TREND', window: 'period' },
      facts(),
      logs({
        periodTotal: 1862,
        spendFuel: 1862,
        spendMaintenance: 0,
        spendBreakdown: 0,
        spendOther: 0,
        monthProjected: 7217,
        monthPrevious: 25543,
      }),
      t,
    );
    expect(card).toMatchObject({
      kicker: 'assistant.card.month',
      figure: '1862',
      unit: 'جنيه',
      note: 'assistant.card.lastMonth 25543 جنيه',
    });
    expect(card?.lines.map((line) => line.label)).toEqual([
      'advisor.bucket.fuel',
      'assistant.card.projected',
    ]);
    expect(cardText(card!)).toContain('1862 جنيه');
  });

  it('uses the same fuel comparison as the home card', () => {
    const card = buildAnswerCard(
      { intent: 'FUEL_SPENDING', window: 'period' },
      facts(),
      logs({
        fuelUse: {
          liters: 77.6,
          previousLiters: 99,
          km: 982,
          previousKm: 1225,
          l100: 7.9,
          previousL100: 8.1,
          pct: -22,
          tone: 'down',
          direction: 'down',
          reason: 'distance',
          currentEnd: '2026-03-10',
          previousEnd: '2026-02-10',
        },
      }),
      t,
    );
    expect(card?.figure).toBe('77.6');
    expect(card?.unit).toBe('assistant.card.liter');
    expect(card?.note).toBe('home.useWhy.down.distance');
    expect(card?.lines).toHaveLength(2);
  });

  it('dates the last oil change', () => {
    const card = buildAnswerCard(
      { intent: 'PART_HISTORY', part: 'oil', window: 'last' },
      facts(),
      logs({
        services: [{ kind: 'oil', name: '', date: '2026-06-01', odometer: 40000 }],
      }),
      t,
    );
    expect(card).toMatchObject({
      kicker: 'parts.engineOil',
      figure: '2026-06-01',
    });
    expect(card?.lines[0]?.value).toContain('40000');
  });

  it('names the nearest due part and keeps its remaining km', () => {
    const card = buildAnswerCard(
      { intent: 'UPCOMING_MAINTENANCE', window: 'period' },
      facts({ healthItems: [oil()], eligible90: 0 }),
      logs(),
      t,
    );
    expect(card?.figure).toBe('parts.engineOil');
    expect(card?.lines[0]?.label).toBe('assistant.card.left');
    expect(card?.note).toBe('health.status.soon');
  });

  it('hides questions the logs cannot answer', () => {
    const visible = ADVISOR_FAQ.filter((item) => advisorFaqVisible(item, facts(), logs())).map(
      (item) => item.key,
    );
    expect(visible).toEqual(['assistant.faq.period']);
    expect(
      advisorFaqVisible(
        ADVISOR_FAQ.find((item) => item.key === 'assistant.faq.oilDue')!,
        facts({ healthItems: [oil()] }),
        logs(),
      ),
    ).toBe(true);
  });
});

describe('faq search', () => {
  it('matches a folded fragment and marks it in the original question', () => {
    expect(faqQueryMatch('الزيت محتاج يتغير؟', 'زيت')).toBe(true);
    expect(faqQueryMatch('صرفت كام الشهر ده؟', 'زيت')).toBe(false);
    expect(faqQueryMatch('إزاي أحسّن', 'ازاي')).toBe(true);
    expect(markFaqQuery('الزيت محتاج يتغير؟', 'زيت')).toEqual([
      { text: 'ال', mark: false },
      { text: 'زيت', mark: true },
      { text: ' محتاج يتغير؟', mark: false },
    ]);
    expect(markFaqQuery('إزاي أحسّن', 'ازاي')[0]).toEqual({ text: 'إزاي', mark: true });
  });

  it('suggests the month question for الصرف even though the label does not contain it', () => {
    const period = ADVISOR_FAQ.find((item) => item.key === 'assistant.faq.period')!;
    const last = ADVISOR_FAQ.find((item) => item.key === 'assistant.faq.lastSpend')!;
    const oilDue = ADVISOR_FAQ.find((item) => item.key === 'assistant.faq.oilDue')!;
    expect(faqSuggests(period, 'صرفت كام الشهر ده؟', 'الصرف')).toBe(true);
    expect(faqSuggests(last, 'آخر حاجة صرفت فيها كام؟', 'الصرف')).toBe(false);
    expect(faqSuggests(oilDue, 'الزيت محتاج يتغير؟', 'زيت')).toBe(true);
    expect(faqSuggests(period, 'صرفت كام الشهر ده؟', 'زيت')).toBe(false);
    const economy = ADVISOR_FAQ.find((item) => item.key === 'assistant.faq.economy')!;
    expect(faqSuggests(economy, 'استهلاك البنزين عامل إزاي؟', 'ازاي احسن الاستهلاك')).toBe(false);
  });

  it('leaves a how-to question without a numbers card', () => {
    const card = buildAnswerCard(
      { intent: 'COACH_ADVICE', window: 'period' },
      facts(),
      logs({
        fuelUse: {
          liters: 77.6,
          previousLiters: 99,
          km: 982,
          previousKm: 1225,
          l100: 7.9,
          previousL100: 8.1,
          pct: -22,
          tone: 'down',
          direction: 'down',
          reason: 'distance',
          currentEnd: '2026-03-10',
          previousEnd: '2026-02-10',
        },
      }),
      t,
    );
    expect(card).toBeNull();
  });
});

const arT = (key: MsgKey, params?: Record<string, string | number>) =>
  params ? `${ar[key]} ${Object.values(params).join(' ')}` : ar[key];

function plugs(over: Partial<HealthItem> = {}): HealthItem {
  const part: PartDefinition = {
    id: 'sys-spark-plugs',
    labelKey: 'parts.sparkPlugs',
    category: 'ENGINE',
    source: 'system',
    trackingMode: 'history',
    active: true,
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
  };
  return {
    partDefinitionId: 'sys-spark-plugs',
    part,
    status: 'unknown',
    reasons: ['health.reason.trackingOnly'],
    confidence: 'low',
    primarySource: 'UNKNOWN',
    sources: [],
    ...over,
  };
}

describe('namedPartCard', () => {
  it('answers spark plugs from the log, including the spoken plural', () => {
    const card = namedPartCard(
      'أمتي اغير البوجيهات',
      { intent: 'MAINTENANCE_PRIORITY', window: 'period' },
      facts({ healthItems: [plugs()] }),
      logs({
        services: [
          {
            kind: 'other',
            name: '',
            date: '2026-07-29',
            odometer: 32000,
            partDefinitionId: 'sys-spark-plugs',
          },
        ],
      }),
      arT,
    );
    expect(card).toMatchObject({
      kicker: 'البواجي',
      figure: '2026-07-29',
      note: 'متابعة بس - مفيش فترة محددة',
    });
    expect(card?.lines[0]?.value).toContain('32000');
    expect(cardText(card!)).not.toContain('مش متسجل');
  });

  it('says not recorded when that part has no log row', () => {
    const card = namedPartCard(
      'أمتي اغير البواجي',
      { intent: 'MAINTENANCE_PRIORITY', window: 'period' },
      facts(),
      logs(),
      arT,
    );
    expect(card).toMatchObject({ kicker: 'البواجي', figure: 'مش متسجل', lines: [] });
  });

  it('shows status and remaining distance when the part has a schedule', () => {
    const scheduled = plugs({
      partDefinitionId: 'sys-timing-belt',
      status: 'soon',
      remainingKm: 4000,
      lastServiceDate: '2026-01-02',
      lastServiceOdo: 10000,
      part: {
        ...plugs().part,
        id: 'sys-timing-belt',
        labelKey: 'parts.timingBelt',
        trackingMode: 'interval',
        userIntervalKm: 60000,
      },
    });
    const card = namedPartCard(
      'امتي اغير سير التوقيت',
      { intent: 'PART_STATUS', window: 'period' },
      facts({ healthItems: [scheduled] }),
      logs(),
      arT,
    );
    expect(card?.kicker).toBe('سير التوقيت');
    expect(card?.figure).toBe('قريب');
    expect(card?.lines.map((line) => line.label)).toEqual(['الباقي', 'آخر تغيير', 'المعاد']);
    expect(card?.note).toBeUndefined();
  });

  it('picks the longer catalog name over a shorter one', () => {
    const card = namedPartCard(
      'امتي اغير سير التوقيت',
      { intent: 'MAINTENANCE_PRIORITY', window: 'period' },
      facts(),
      logs(),
      arT,
    );
    expect(card?.kicker).toBe('سير التوقيت');
    expect(card?.figure).toBe('مش متسجل');
  });

  it('keeps oil on its own card and still names the oil filter', () => {
    const oilReply = localCoachAnswer('أمتي اغير الزيت', facts({ healthItems: [oil()] }), logs(), arT);
    expect(oilReply.card?.kicker).toBe('زيت المحرك');
    expect(oilReply.card?.figure).toBe(ar['health.status.soon']);

    const filterReply = localCoachAnswer(
      'أمتي اغير فلتر الزيت',
      facts({ healthItems: [oil(), plugs()] }),
      logs({
        services: [
          {
            kind: 'other',
            name: '',
            date: '2026-05-09',
            odometer: 28000,
            partDefinitionId: 'sys-oil-filter',
          },
        ],
      }),
      arT,
    );
    expect(filterReply.card?.kicker).toBe('فلتر الزيت');
    expect(filterReply.card?.figure).toBe('2026-05-09');
  });

  it('leaves advice and spending questions off the part card', () => {
    const read = { intent: 'COACH_ADVICE' as const, window: 'period' as const };
    expect(
      namedPartCard('ازاي اغير البوجيهات', read, facts({ healthItems: [plugs()] }), logs(), arT),
    ).toBeNull();
    const spend = localCoachAnswer(
      'صرفت كام',
      facts({ healthItems: [plugs()] }),
      logs({ periodTotal: 100, spendFuel: 100, spendMaintenance: 0, spendBreakdown: 0, spendOther: 0 }),
      arT,
    );
    expect(spend.card?.kicker).not.toBe('البواجي');
  });
});
