import { describe, expect, it } from 'vitest';
import {
  ADVISOR_FAQ,
  advisorFaqVisible,
  buildAnswerCard,
  cardText,
  faqQueryMatch,
  faqSuggests,
  markFaqQuery,
} from './advisor-card';
import { SYSTEM_ENGINE_OIL_ID } from './part-catalog';
import type { PartDefinition } from './models';
import type { AdvisorFacts, CoachLogs } from './smart-advisor';
import type { HealthItem } from './vehicle-health';
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
        },
      }),
      t,
    );
    expect(card).toBeNull();
  });
});
