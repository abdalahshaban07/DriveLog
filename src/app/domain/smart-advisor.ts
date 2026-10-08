import {
  normalizeAdvisorText,
  readAdvisor,
  type AdvisorIntent,
  type AdvisorPart,
  type AdvisorRead,
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
import type { FuelUseCompare } from './economy';
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

export type SpendBucket = 'fuel' | 'maintenance' | 'breakdown' | 'other';

export type CoachServiceHit = {
  kind: AdvisorPart | 'other';
  name: string;
  date: string;
  odometer: number;
};

export type CoachSpendHit = {
  bucket: SpendBucket;
  amount: number;
  date: string;
};

export type CoachLogs = {
  currency: string;
  periodTotal: number;
  maintenanceCount: number;
  breakdownCount: number;
  lastL100: number | null;
  /** Period split. Absent → the total-only sentence. */
  spendFuel?: number;
  spendMaintenance?: number;
  spendBreakdown?: number;
  spendOther?: number;
  allFuel?: number;
  allMaintenance?: number;
  allBreakdown?: number;
  allOther?: number;
  allTotal?: number;
  prevL100?: number | null;
  lastBreakdown?: { title: string; date: string } | null;
  /** Newest first. */
  services?: readonly CoachServiceHit[];
  lastSpend?: CoachSpendHit | null;
  /** Calendar month, same window as the home month card. */
  monthProjected?: number | null;
  monthPrevious?: number;
  fuelUse?: FuelUseCompare | null;
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

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function adviceBodyKey(question: string): MsgKey {
  const text = normalizeAdvisorText(question);
  if (/زيت|oil/.test(text)) return 'advisor.answer.adviceOil';
  if (/كاوتش|كوتش|اطار|tire/.test(text)) return 'advisor.answer.adviceTires';
  if (/فرامل|brake/.test(text)) return 'advisor.answer.adviceBrakes';
  if (/ميزاني|احتياط|budget|reserve/.test(text)) return 'advisor.answer.adviceBudget';
  if (/بنزين|وقود|استهلاك|لتر|fuel|econom|consum|سواق/.test(text)) return 'fuel.tip.tirePressure';
  return 'advisor.answer.adviceBody';
}

function toRead(question: string, hint?: AdvisorIntent | AdvisorRead): AdvisorRead {
  if (hint && typeof hint === 'object') return hint;
  const read = readAdvisor(question);
  if (!hint) return read;
  return { ...read, intent: hint };
}

function bucketLabel(bucket: SpendBucket, t: Translate): string {
  switch (bucket) {
    case 'fuel':
      return t('advisor.bucket.fuel');
    case 'maintenance':
      return t('advisor.bucket.maintenance');
    case 'breakdown':
      return t('advisor.bucket.breakdown');
    case 'other':
      return t('advisor.bucket.other');
    default: {
      const _e: never = bucket;
      return _e;
    }
  }
}

function partKindLabel(kind: AdvisorPart, t: Translate): string {
  switch (kind) {
    case 'oil':
      return t('parts.engineOil');
    case 'tires':
      return t('parts.tires');
    case 'brakes':
      return t('parts.brakePads');
    default: {
      const _e: never = kind;
      return _e;
    }
  }
}

function serviceLabel(hit: CoachServiceHit, t: Translate): string {
  if (hit.kind === 'other') return hit.name || t('advisor.part.other');
  return partKindLabel(hit.kind, t);
}

function partIds(part: AdvisorPart): readonly string[] {
  switch (part) {
    case 'oil':
      return [SYSTEM_ENGINE_OIL_ID];
    case 'tires':
      return [SYSTEM_TIRES_ID];
    case 'brakes':
      return [SYSTEM_BRAKE_PADS_ID, SYSTEM_BRAKE_DISCS_ID];
    default: {
      const _e: never = part;
      return _e;
    }
  }
}

function itemForPart(part: AdvisorPart, items: readonly HealthItem[]): HealthItem | undefined {
  const ids = partIds(part);
  return items.find((item) => ids.includes(item.partDefinitionId));
}

function mentionedPart(question: string, items: readonly HealthItem[]): HealthItem | undefined {
  const q = normalizeAdvisorText(question);
  const rules: { re: RegExp; ids: readonly string[]; word: RegExp }[] = [
    { re: /oil|زيت/, ids: [SYSTEM_ENGINE_OIL_ID], word: /oil|زيت/ },
    { re: /tire|كاوتش|كوتش|اطار/, ids: [SYSTEM_TIRES_ID], word: /tire|كاوتش|كوتش|اطار/ },
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
  hint?: AdvisorIntent | AdvisorRead,
): LocalAnswer {
  const read = toRead(question, hint);
  const intent = read.intent;
  switch (intent) {
    case 'RECOMMENDED_RESERVE':
      return facts.recommendedReserve == null
        ? answer('advisor.answer.reserveTitle', 'advisor.answer.reserveUnknown')
        : answer('advisor.answer.reserveTitle', 'advisor.answer.reserveBody', {
            amount: Math.round(facts.recommendedReserve),
            currency: logs.currency,
          });
    case 'MAINTENANCE_PRIORITY': {
      const item = read.part
        ? itemForPart(read.part, facts.healthItems)
        : focusPart(question, facts.healthItems);
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
      if (logs.lastL100 != null && logs.prevL100 != null) {
        return answer('advisor.answer.fuelTitle', 'advisor.answer.fuelDelta', {
          l100: round1(logs.lastL100),
          prev: round1(logs.prevL100),
          delta: round1(logs.lastL100 - logs.prevL100),
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
      const item = read.part
        ? itemForPart(read.part, facts.healthItems)
        : focusPart(question, facts.healthItems);
      return item
        ? answer(
            'advisor.answer.partStatusTitle',
            'advisor.answer.partStatusBody',
            partParams(item, t),
          )
        : answer('advisor.answer.partStatusTitle', 'advisor.answer.partStatusEmpty');
    }
    case 'PART_HISTORY': {
      const services = logs.services ?? [];
      const pool = read.part ? services.filter((hit) => hit.kind === read.part) : services;
      const hit = read.window === 'all' ? undefined : pool[0];
      if (hit) {
        return answer('advisor.answer.partHistoryTitle', 'advisor.answer.partHistoryLast', {
          part: serviceLabel(hit, t),
          date: hit.date,
          km: Math.round(hit.odometer),
        });
      }
      if (read.part && logs.services) {
        return answer('advisor.answer.partHistoryTitle', 'advisor.answer.partHistoryCount', {
          count: pool.length,
          part: partKindLabel(read.part, t),
        });
      }
      return answer('advisor.answer.partHistoryTitle', 'advisor.answer.partHistoryBody', {
        count: logs.maintenanceCount,
      });
    }
    case 'MAINT_LOG':
      return answer('advisor.answer.maintLogTitle', 'advisor.answer.maintLogBody', {
        count: logs.maintenanceCount,
      });
    case 'BREAKDOWN': {
      const last = logs.lastBreakdown;
      if (read.window !== 'all' && last?.title) {
        return answer('advisor.answer.breakdownTitle', 'advisor.answer.breakdownLast', {
          title: last.title,
          date: last.date,
          count: logs.breakdownCount,
        });
      }
      return answer('advisor.answer.breakdownTitle', 'advisor.answer.breakdownBody', {
        count: logs.breakdownCount,
      });
    }
    case 'SPENDING_TREND': {
      if (read.window === 'last' && logs.lastSpend) {
        return answer('advisor.answer.spendTitle', 'advisor.answer.spendLast', {
          label: bucketLabel(logs.lastSpend.bucket, t),
          amount: Math.round(logs.lastSpend.amount),
          date: logs.lastSpend.date,
          currency: logs.currency,
        });
      }
      const all = read.window === 'all';
      const fuel = all ? logs.allFuel : logs.spendFuel;
      const maintenance = all ? logs.allMaintenance : logs.spendMaintenance;
      const breakdown = all ? logs.allBreakdown : logs.spendBreakdown;
      const other = all ? logs.allOther : logs.spendOther;
      const total = all ? (logs.allTotal ?? logs.periodTotal) : logs.periodTotal;
      if (fuel != null && maintenance != null && breakdown != null && other != null) {
        return answer(
          'advisor.answer.spendTitle',
          all ? 'advisor.answer.spendAll' : 'advisor.answer.spendSplit',
          {
            total: Math.round(total),
            fuel: Math.round(fuel),
            maintenance: Math.round(maintenance),
            breakdown: Math.round(breakdown),
            other: Math.round(other),
            currency: logs.currency,
          },
        );
      }
      return answer('advisor.answer.spendTitle', 'advisor.answer.spendBody', {
        total: Math.round(logs.periodTotal),
        currency: logs.currency,
      });
    }
    case 'COACH_ADVICE':
      return answer('advisor.answer.adviceTitle', adviceBodyKey(question));
    case 'UNSUPPORTED':
      return answer('advisor.answer.unsupportedTitle', 'advisor.answer.unsupportedBody');
    default: {
      const _e: never = intent;
      return _e;
    }
  }
}
