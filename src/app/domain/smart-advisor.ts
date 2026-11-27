import {
  normalizeAdvisorText,
  readAdvisor,
  type AdvisorIntent,
  type AdvisorPart,
  type AdvisorRange,
  type AdvisorRead,
} from './advisor-intent';
import type { Affordability, BudgetHealth } from './budget-engine';
import type { DataQualityTip } from './data-quality';
import type { MsgKey } from '../i18n/en';
import { en } from '../i18n/en';
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
  partDefinitionId?: string;
  /** Maintenance cost; null when the record has no price. */
  amount?: number | null;
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
  /** Active car nickname — personalizes human answers. */
  carName?: string;
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
  /** Every spend row across buckets, newest first, for named date windows. */
  spends?: readonly CoachSpendHit[];
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

export type ResolvedWindow = { from: string; to: string; label: string };

function isoDay(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function monthKey(month: number): MsgKey {
  return `advisor.month.${month}` as MsgKey;
}

function resolveRange(range: AdvisorRange, t: Translate, now: Date): ResolvedWindow {
  switch (range.kind) {
    case 'yearToDate': {
      return {
        from: `${now.getFullYear()}-01-01`,
        to: isoDay(now),
        label: t('advisor.window.yearToDate'),
      };
    }
    case 'month': {
      // The nearest past occurrence: a future month means last year.
      const year = range.month > now.getMonth() + 1 ? now.getFullYear() - 1 : now.getFullYear();
      const from = `${year}-${String(range.month).padStart(2, '0')}-01`;
      const lastDay = new Date(year, range.month, 0);
      const to = isoDay(lastDay > now ? now : lastDay);
      const name = t(monthKey(range.month));
      return {
        from,
        to,
        label: year === now.getFullYear() ? name : `${name} ${year}`,
      };
    }
    case 'lastMonths': {
      const from = new Date(now.getFullYear(), now.getMonth() - (range.count - 1), 1);
      return {
        from: isoDay(from),
        to: isoDay(now),
        label: t('advisor.window.lastMonths', { count: range.count }),
      };
    }
    default: {
      const _e: never = range;
      return _e;
    }
  }
}

/** Date bounds for the asked window, or null when the question is unbounded. */
function resolveWindow(read: AdvisorRead, t: Translate, now = new Date()): ResolvedWindow | null {
  switch (read.window) {
    case 'period': {
      const from = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from: isoDay(from), to: isoDay(now), label: t('advisor.window.thisMonth') };
    }
    case 'prev': {
      const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const last = new Date(now.getFullYear(), now.getMonth(), 0);
      return { from: isoDay(first), to: isoDay(last), label: t('advisor.window.lastMonth') };
    }
    case 'range':
      return read.range ? resolveRange(read.range, t, now) : null;
    case 'all':
    case 'last':
      return null;
    default: {
      const _e: never = read.window;
      return _e;
    }
  }
}

function inWindow<T extends { date: string }>(rows: readonly T[], bounds: ResolvedWindow | null): T[] {
  if (!bounds) return [...rows];
  return rows.filter((row) => row.date >= bounds.from && row.date <= bounds.to);
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

const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';

function arNum(n: number): string {
  return String(n).replace(/\d/g, (d) => AR_DIGITS[Number(d)]!);
}

type CountForms = { one: string; dual: string; few: string; many: string; enOne: string; enMany: string };

/** Egyptian count grammar: واحد / اتنين (dual) / ٣-١٠ (plural) / ١١+ (singular), with Eastern digits. */
function countPhrase(n: number, t: Translate, f: CountForms): string {
  if (t('common.km') !== 'كم') return n === 1 ? `1 ${f.enOne}` : `${n} ${f.enMany}`;
  if (n === 1) return f.one;
  if (n === 2) return f.dual;
  if (n <= 10) return `${arNum(n)} ${f.few}`;
  return `${arNum(n)} ${f.many}`;
}

const RECORD_FORMS: CountForms = { one: 'سجل واحد', dual: 'سجلين', few: 'سجلات', many: 'سجل', enOne: 'record', enMany: 'records' };
const MAINT_RECORD_FORMS: CountForms = { one: 'سجل صيانة واحد', dual: 'سجلين صيانة', few: 'سجلات صيانة', many: 'سجل صيانة', enOne: 'maintenance record', enMany: 'maintenance records' };
const OP_FORMS: CountForms = { one: 'عملية واحدة', dual: 'عمليتين', few: 'عمليات', many: 'عملية', enOne: 'entry', enMany: 'entries' };
const BREAKDOWN_FORMS: CountForms = { one: 'عطل واحد', dual: 'عطلين', few: 'أعطال', many: 'عطل', enOne: 'breakdown', enMany: 'breakdowns' };
const SERVICE_ENTRY_FORMS: CountForms = { one: 'صيانة واحدة', dual: 'صيانتين', few: 'صيانات', many: 'صيانة', enOne: 'service entry', enMany: 'service entries' };

/** «آخر X» line: Arabic keeps the dual, English stays numeric. */
function listedPhrase(n: number, t: Translate): string {
  if (t('common.km') !== 'كم') return String(n);
  if (n === 1) return 'واحدة';
  if (n === 2) return 'اتنين';
  if (n <= 10) return `${arNum(n)} صيانات`;
  return `${arNum(n)} صيانة`;
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
    case 'CAR_SUMMARY': {
      // The catch-up answer a driver actually asks for: money, fuel, what's next.
      const due = facts.healthItems.find((item) => item.status !== 'good');
      return answer('advisor.answer.summaryTitle', 'advisor.answer.summaryBody', {
        spend: Math.round(logs.periodTotal),
        currency: logs.currency,
        l100:
          logs.lastL100 == null
            ? t('assistant.card.notRecorded')
            : `${round1(logs.lastL100)} ${t('common.l100')}`,
        due: due
          ? `${partLabel(due, t)} ${t(statusKey(due.status))}`
          : t('advisor.answer.summaryNoDue'),
      });
    }
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
          records: countPhrase(pool.length, t, MAINT_RECORD_FORMS),
          ops: countPhrase(pool.length, t, OP_FORMS),
          part: partKindLabel(read.part, t),
        });
      }
      return answer('advisor.answer.partHistoryTitle', 'advisor.answer.partHistoryBody', {
        records: countPhrase(logs.maintenanceCount, t, MAINT_RECORD_FORMS),
        services: countPhrase(logs.maintenanceCount, t, SERVICE_ENTRY_FORMS),
      });
    }
    case 'MAINT_LOG':
      return answer('advisor.answer.maintLogTitle', 'advisor.answer.maintLogBody', {
        records: countPhrase(logs.maintenanceCount, t, MAINT_RECORD_FORMS),
        services: countPhrase(logs.maintenanceCount, t, SERVICE_ENTRY_FORMS),
      });
    case 'SERVICE_LIST': {
      const services = logs.services ?? [];
      const pool = read.part ? services.filter((hit) => hit.kind === read.part) : services;
      const partName = read.part ? partKindLabel(read.part, t) : undefined;
      if (!pool.length) {
        return partName
          ? answer('advisor.answer.serviceListTitle', 'advisor.answer.serviceListEmptyPart', {
              part: partName,
            })
          : answer('advisor.answer.serviceListTitle', 'advisor.answer.serviceListEmpty');
      }
      const top = pool.slice(0, read.count ?? 3);
      const list = top.map((hit) => `${serviceLabel(hit, t)} · ${hit.date}`).join('\n');
      return answer('advisor.answer.serviceListTitle', 'advisor.answer.serviceListBody', {
        listed: listedPhrase(top.length, t),
        list,
      });
    }
    case 'PART_COST': {
      const services = logs.services ?? [];
      const pool = read.part ? services.filter((hit) => hit.kind === read.part) : services;
      const partName = read.part ? partKindLabel(read.part, t) : t('advisor.bucket.maintenance');
      const bounds = resolveWindow(read, t);
      const label = bounds?.label ?? t('advisor.window.all');
      const rows = inWindow(pool, bounds);
      if (!rows.length) {
        return answer('advisor.answer.partCostTitle', 'advisor.answer.partCostNone', {
          window: label,
          part: partName,
        });
      }
      const priced = rows.filter((hit) => hit.amount != null);
      if (!priced.length) {
        return answer('advisor.answer.partCostTitle', 'advisor.answer.partCostUnknown', {
          window: label,
          part: partName,
          records: countPhrase(rows.length, t, RECORD_FORMS),
        });
      }
      const total = priced.reduce((sum, hit) => sum + (hit.amount ?? 0), 0);
      return answer('advisor.answer.partCostTitle', 'advisor.answer.partCostBody', {
        window: label,
        part: partName,
        total: Math.round(total),
        currency: logs.currency,
        records: countPhrase(priced.length, t, RECORD_FORMS),
        date: priced[0]!.date,
      });
    }
    case 'SPEND_COMPARE': {
      const current = logs.periodTotal;
      const prev = logs.monthPrevious ?? 0;
      if (current <= 0 && prev <= 0) {
        return answer('advisor.answer.compareTitle', 'advisor.answer.compareEmpty');
      }
      if (prev <= 0) {
        return answer('advisor.answer.compareTitle', 'advisor.answer.compareNoPrev', {
          total: Math.round(current),
          currency: logs.currency,
        });
      }
      const pct = Math.round(((current - prev) / prev) * 100);
      const bodyKey =
        pct > 3
          ? 'advisor.answer.compareUp'
          : pct < -3
            ? 'advisor.answer.compareDown'
            : 'advisor.answer.compareFlat';
      return answer('advisor.answer.compareTitle', bodyKey, {
        total: Math.round(current),
        prev: Math.round(prev),
        pct: Math.abs(pct),
        currency: logs.currency,
      });
    }
    case 'BREAKDOWN': {
      const last = logs.lastBreakdown;
      if (read.window !== 'all' && last?.title) {
        return answer('advisor.answer.breakdownTitle', 'advisor.answer.breakdownLast', {
          title: last.title,
          date: last.date,
          breakdowns: countPhrase(logs.breakdownCount, t, BREAKDOWN_FORMS),
        });
      }
      return answer('advisor.answer.breakdownTitle', 'advisor.answer.breakdownBody', {
        breakdowns: countPhrase(logs.breakdownCount, t, BREAKDOWN_FORMS),
      });
    }
    case 'SPENDING_TREND': {
      if (read.window === 'range' && logs.spends) {
        const bounds = resolveWindow(read, t);
        const rows = inWindow(logs.spends, bounds);
        const label = bounds?.label ?? t('advisor.window.all');
        if (!rows.length) {
          return answer('advisor.answer.spendTitle', 'advisor.answer.spendRangeEmpty', {
            window: label,
          });
        }
        const total = rows.reduce((sum, row) => sum + row.amount, 0);
        return answer('advisor.answer.spendTitle', 'advisor.answer.spendRange', {
          window: label,
          total: Math.round(total),
          currency: logs.currency,
        });
      }
      if (read.window === 'prev') {
        return answer('advisor.answer.spendTitle', 'advisor.answer.spendPrev', {
          total: Math.round(logs.monthPrevious ?? 0),
          currency: logs.currency,
        });
      }
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

function fnv1a(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function placeholdersOf(text: string): string[] {
  return [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!);
}

/**
 * Deterministic tone rotation: the same question always gets the same wording,
 * different questions vary. A variant is only used when every placeholder it
 * needs is present — facts can never be dropped or invented.
 */
export function pickVariantKey(
  base: MsgKey,
  seed: string,
  params: Record<string, string | number>,
): MsgKey {
  const usable = (key: string): key is MsgKey =>
    key in en && placeholdersOf(en[key as MsgKey]).every((p) => p in params);
  const slot = fnv1a(`${seed}|${base}`) % 4;
  const order = slot === 1 ? ['_v2', '_v3'] : slot === 2 ? ['_v3', '_v2'] : [];
  for (const suffix of order) {
    const key = `${base}${suffix}`;
    if (usable(key)) return key;
  }
  return base;
}

/** One-sentence acknowledgment shown before the numbers for hot intents. */
export function coachLead(
  read: AdvisorRead,
  facts: AdvisorFacts,
  logs: CoachLogs,
  t: Translate,
): { key: MsgKey; params: Record<string, string | number> } | null {
  if (read.part && (read.intent === 'PART_HISTORY' || read.intent === 'MAINTENANCE_PRIORITY')) {
    const same = (logs.services ?? []).filter((hit) => hit.kind === read.part);
    if (same.length >= 2) {
      return { key: 'advisor.lead.repeatPart', params: { part: partKindLabel(read.part, t) } };
    }
  }
  if (read.intent === 'BREAKDOWN' && logs.breakdownCount >= 2) {
    return { key: 'advisor.lead.secondFault', params: { count: logs.breakdownCount } };
  }
  if (read.intent === 'BUDGET_HEALTH' && (facts.budgetHealth === 'HIGH' || facts.budgetHealth === 'CRITICAL')) {
    return { key: 'advisor.lead.budgetHigh', params: {} };
  }
  return null;
                               }
