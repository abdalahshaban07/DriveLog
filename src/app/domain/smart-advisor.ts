import {
  detectAdvisorIntent,
  normalizeAdvisorText,
  type AdvisorIntent,
} from './advisor-intent';
import type { Affordability, BudgetHealth } from './budget-engine';
import type { DataQualityTip } from './data-quality';
import type { MsgKey } from '../i18n/en';
import type { HealthStatus } from './models';
import {
  SYSTEM_BRAKE_DISCS_ID,
  SYSTEM_BRAKE_PADS_ID,
  SYSTEM_ENGINE_OIL_ID,
  SYSTEM_TIRES_ID,
} from './part-catalog';
import type { HealthItem } from './vehicle-health';

export type AdvisorFacts = {
  budgetHealth: BudgetHealth;
  healthItems: readonly HealthItem[];
  eligible90: number;
  fuelRisePct: number | null;
  costAnomaly: boolean;
  savingRecommendation: boolean;
  forecastAvailable: boolean;
  dataQuality: readonly DataQualityTip[];
  monthlyBudget: number | null;
  recommendedReserve: number | null;
  reserveTarget: number | null;
  affordability: Affordability;
};

export type CoachLogs = {
  currency: string;
  periodTotal: number;
  maintenanceCount: number;
  breakdownCount: number;
  lastL100: number | null;
};

export type LocalAnswer = {
  titleKey: MsgKey;
  bodyKey: MsgKey;
  params: Record<string, string | number>;
};

type Translate = (key: MsgKey, params?: Record<string, string | number>) => string;

function answer(
  titleKey: MsgKey,
  bodyKey: MsgKey,
  params: Record<string, string | number> = {},
): LocalAnswer {
  return { titleKey, bodyKey, params };
}

export function statusKey(status: HealthStatus): MsgKey {
  switch (status) {
    case 'good':
      return 'health.status.good';
    case 'soon':
      return 'health.status.soon';
    case 'due':
      return 'health.status.due';
    case 'overdue':
      return 'health.status.overdue';
    case 'inspect':
      return 'health.status.inspect';
    case 'unknown':
      return 'health.status.unknown';
    case 'critical':
      return 'health.status.critical';
    default: {
      const _e: never = status;
      return _e;
    }
  }
}

function budgetLabel(health: BudgetHealth, t: Translate): string {
  switch (health) {
    case 'EXCELLENT':
      return t('budget.health.EXCELLENT');
    case 'HEALTHY':
      return t('budget.health.HEALTHY');
    case 'WATCH':
      return t('budget.health.WATCH');
    case 'HIGH':
      return t('budget.health.HIGH');
    case 'CRITICAL':
      return t('budget.health.CRITICAL');
    case 'UNKNOWN':
      return t('budget.health.UNKNOWN');
    default: {
      const _e: never = health;
      return _e;
    }
  }
}

function affordLabel(verdict: Affordability, t: Translate): string {
  switch (verdict) {
    case 'CAN_AFFORD':
      return t('advisor.afford.CAN_AFFORD');
    case 'TIGHT':
      return t('advisor.afford.TIGHT');
    case 'NOT_RECOMMENDED':
      return t('advisor.afford.NOT_RECOMMENDED');
    case 'UNKNOWN':
      return t('advisor.afford.UNKNOWN');
    default: {
      const _e: never = verdict;
      return _e;
    }
  }
}

export function partLabel(item: HealthItem, t: Translate): string {
  const name = item.part.name?.trim();
  if (name) return name;
  if (item.part.labelKey) return t(item.part.labelKey as MsgKey);
  return item.partDefinitionId;
}

function partParams(item: HealthItem, t: Translate): Record<string, string | number> {
  return { part: partLabel(item, t), status: t(statusKey(item.status)) };
}

function mentionedPart(
  question: string,
  items: readonly HealthItem[],
): HealthItem | undefined {
  const q = normalizeAdvisorText(question);
  const rules: { re: RegExp; ids: readonly string[]; word: RegExp }[] = [
    { re: /oil|زيت/, ids: [SYSTEM_ENGINE_OIL_ID], word: /oil|زيت/ },
    { re: /tire|كاوتش|اطار/, ids: [SYSTEM_TIRES_ID], word: /tire|كاوتش|اطار/ },
    {
      re: /brake|فرامل/,
      ids: [SYSTEM_BRAKE_PADS_ID, SYSTEM_BRAKE_DISCS_ID],
      word: /brake|فرامل/,
    },
  ];
  for (const rule of rules) {
    if (!rule.re.test(q)) continue;
    const hit = items.find((item) => {
      if (rule.ids.includes(item.partDefinitionId)) return true;
      const blob = normalizeAdvisorText(`${item.part.name ?? ''} ${item.part.labelKey ?? ''}`);
      return rule.word.test(blob);
    });
    if (hit) return hit;
  }
  return undefined;
}

function focusPart(question: string, items: readonly HealthItem[]): HealthItem | undefined {
  return (
    mentionedPart(question, items) ??
    items.find((item) => item.status !== 'good' && item.status !== 'unknown')
  );
}

export function askLocal(
  question: string,
  facts: AdvisorFacts,
  logs: CoachLogs,
  t: Translate,
  hint?: AdvisorIntent,
): LocalAnswer {
  const intent = hint ?? detectAdvisorIntent(question);
  switch (intent) {
    case 'RECOMMENDED_RESERVE':
      return facts.recommendedReserve == null
        ? answer('advisor.answer.reserveTitle', 'advisor.answer.reserveUnknown')
        : answer('advisor.answer.reserveTitle', 'advisor.answer.reserveBody', {
            amount: Math.round(facts.recommendedReserve),
            currency: logs.currency,
          });
    case 'MAINTENANCE_PRIORITY': {
      const item = focusPart(question, facts.healthItems);
      return item
        ? answer('advisor.answer.priorityTitle', 'advisor.answer.priorityBody', partParams(item, t))
        : answer('advisor.answer.priorityTitle', 'advisor.answer.priorityEmpty');
    }
    case 'FUEL_SPENDING':
      if (facts.fuelRisePct != null) {
        return answer('advisor.answer.fuelTitle', 'advisor.answer.fuelBody', {
          pct: Math.round(facts.fuelRisePct),
        });
      }
      if (logs.lastL100 != null) {
        return answer('advisor.answer.fuelTitle', 'advisor.answer.fuelEconomy', {
          l100: logs.lastL100,
        });
      }
      return answer('advisor.answer.fuelTitle', 'advisor.answer.fuelUnknown');
    case 'UPCOMING_MAINTENANCE':
      return facts.eligible90 > 0
        ? answer('advisor.answer.upcomingTitle', 'advisor.answer.upcomingBody', {
            amount: Math.round(facts.eligible90),
            currency: logs.currency,
          })
        : answer('advisor.answer.upcomingTitle', 'advisor.answer.upcomingEmpty');
    case 'AFFORDABILITY':
      return answer('advisor.answer.affordTitle', 'advisor.answer.affordBody', {
        verdict: affordLabel(facts.affordability, t),
      });
    case 'BUDGET_HEALTH':
      return answer('advisor.answer.budgetTitle', 'advisor.answer.budgetBody', {
        status: budgetLabel(facts.budgetHealth, t),
      });
    case 'PART_STATUS': {
      const item = focusPart(question, facts.healthItems);
      return item
        ? answer(
            'advisor.answer.partStatusTitle',
            'advisor.answer.partStatusBody',
            partParams(item, t),
          )
        : answer('advisor.answer.partStatusTitle', 'advisor.answer.partStatusEmpty');
    }
    case 'PART_HISTORY':
      return answer('advisor.answer.partHistoryTitle', 'advisor.answer.partHistoryBody', {
        count: logs.maintenanceCount,
      });
    case 'MAINT_LOG':
      return answer('advisor.answer.maintLogTitle', 'advisor.answer.maintLogBody', {
        count: logs.maintenanceCount,
      });
    case 'BREAKDOWN':
      return answer('advisor.answer.breakdownTitle', 'advisor.answer.breakdownBody', {
        count: logs.breakdownCount,
      });
    case 'SPENDING_TREND':
      return answer('advisor.answer.spendTitle', 'advisor.answer.spendBody', {
        total: Math.round(logs.periodTotal),
        currency: logs.currency,
      });
    case 'UNSUPPORTED':
      return answer('advisor.answer.unsupportedTitle', 'advisor.answer.unsupportedBody');
    default: {
      const _e: never = intent;
      return _e;
    }
  }
}
