import type { MsgKey } from '../i18n/en';
import {
  normalizeAdvisorText,
  readAdvisor,
  type AdvisorPart,
  type AdvisorRead,
} from './advisor-intent';
import type { FuelUseCompare, FuelUseReason } from './economy';
import type { HealthStatus } from './models';
import {
  SYSTEM_BRAKE_DISCS_ID,
  SYSTEM_BRAKE_PADS_ID,
  SYSTEM_ENGINE_OIL_ID,
  SYSTEM_TIRES_ID,
} from './part-catalog';
import {
  partLabel,
  statusKey,
  type AdvisorFacts,
  type CoachLogs,
  type CoachServiceHit,
} from './smart-advisor';
import type { HealthItem } from './vehicle-health';

export type AnswerCard = {
  kicker: string;
  figure: string;
  unit?: string;
  lines: { label: string; value: string }[];
  note?: string;
};

export type CardFormat = {
  amount: (value: number) => string;
  liters: (value: number) => string;
  date: (iso: string) => string;
};

export type AdvisorFaqGroup = 'spend' | 'car' | 'budget';

export type AdvisorFaqKey =
  | 'assistant.faq.period'
  | 'assistant.faq.lastSpend'
  | 'assistant.faq.allSpend'
  | 'assistant.faq.economy'
  | 'assistant.faq.oilDue'
  | 'assistant.faq.tires'
  | 'assistant.faq.brakes'
  | 'assistant.faq.oilLast'
  | 'assistant.faq.upcoming'
  | 'assistant.faq.breakdown'
  | 'assistant.faq.budget'
  | 'assistant.faq.reserve';

export type AdvisorFaq = {
  key: AdvisorFaqKey;
  group: AdvisorFaqGroup;
  read: AdvisorRead;
};

type Translate = (key: MsgKey, params?: Record<string, string | number>) => string;

export const ADVISOR_FAQ: readonly AdvisorFaq[] = [
  { key: 'assistant.faq.period', group: 'spend', read: { intent: 'SPENDING_TREND', window: 'period' } },
  { key: 'assistant.faq.lastSpend', group: 'spend', read: { intent: 'SPENDING_TREND', window: 'last' } },
  { key: 'assistant.faq.allSpend', group: 'spend', read: { intent: 'SPENDING_TREND', window: 'all' } },
  { key: 'assistant.faq.economy', group: 'spend', read: { intent: 'FUEL_SPENDING', window: 'period' } },
  { key: 'assistant.faq.oilDue', group: 'car', read: { intent: 'PART_STATUS', part: 'oil', window: 'period' } },
  { key: 'assistant.faq.tires', group: 'car', read: { intent: 'PART_STATUS', part: 'tires', window: 'period' } },
  { key: 'assistant.faq.brakes', group: 'car', read: { intent: 'PART_STATUS', part: 'brakes', window: 'period' } },
  { key: 'assistant.faq.oilLast', group: 'car', read: { intent: 'PART_HISTORY', part: 'oil', window: 'last' } },
  { key: 'assistant.faq.upcoming', group: 'car', read: { intent: 'UPCOMING_MAINTENANCE', window: 'period' } },
  { key: 'assistant.faq.breakdown', group: 'car', read: { intent: 'BREAKDOWN', window: 'last' } },
  { key: 'assistant.faq.budget', group: 'budget', read: { intent: 'BUDGET_HEALTH', window: 'period' } },
  { key: 'assistant.faq.reserve', group: 'budget', read: { intent: 'RECOMMENDED_RESERVE', window: 'period' } },
];

const PLAIN: CardFormat = {
  amount: (value) => String(Math.round(value)),
  liters: (value) => String(Math.round(value * 10) / 10),
  date: (iso) => iso,
};

export function cardText(card: AnswerCard): string {
  const head = [card.kicker, [card.figure, card.unit].filter(Boolean).join(' ')];
  const lines = card.lines.map((line) => `${line.label} ${line.value}`.trim());
  return [...head, ...lines, card.note ?? ''].map((line) => line.trim()).filter(Boolean).join('\n');
}

export type FaqMark = { text: string; mark: boolean };

/** Empty query matches every question. Otherwise the folded label must contain the query. */
export function faqQueryMatch(label: string, query: string): boolean {
  const needle = normalizeAdvisorText(query);
  if (!needle) return true;
  return normalizeAdvisorText(label).includes(needle);
}

/** A typed word like «الصرف» should surface the ready question for that intent. */
export function faqSuggests(item: AdvisorFaq, label: string, query: string): boolean {
  const needle = normalizeAdvisorText(query);
  if (!needle) return false;
  if (normalizeAdvisorText(label).includes(needle)) return true;
  const read = readAdvisor(query);
  if (read.intent === 'UNSUPPORTED' || read.intent !== item.read.intent) return false;
  if (read.part && read.part !== item.read.part) return false;
  return read.window === item.read.window;
}

/** Highlight the query inside a question. Folding keeps إزاي and ازاي on the same span. */
export function markFaqQuery(label: string, query: string): FaqMark[] {
  const needle = normalizeAdvisorText(query);
  if (!needle) return [{ text: label, mark: false }];
  const folded = foldSpans(label);
  const at = folded.fold.indexOf(needle);
  if (at < 0) return [{ text: label, mark: false }];
  const start = folded.starts[at]!;
  const end = folded.ends[at + needle.length - 1]!;
  const parts = [
    { text: label.slice(0, start), mark: false },
    { text: label.slice(start, end), mark: true },
    { text: label.slice(end), mark: false },
  ];
  return parts.filter((part) => part.text.length > 0);
}

function foldSpans(label: string): { fold: string; starts: number[]; ends: number[] } {
  let fold = '';
  const starts: number[] = [];
  const ends: number[] = [];
  for (let i = 0; i < label.length; i++) {
    const piece = foldChar(label[i]!);
    for (const out of piece) {
      fold += out;
      starts.push(i);
      ends.push(i + 1);
    }
  }
  return { fold, starts, ends };
}

function foldChar(ch: string): string {
  return ch
    .normalize('NFKD')
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .toLowerCase();
}

export function advisorFaqVisible(item: AdvisorFaq, facts: AdvisorFacts, logs: CoachLogs): boolean {
  switch (item.key) {
    case 'assistant.faq.period':
      return true;
    case 'assistant.faq.lastSpend':
      return logs.lastSpend != null;
    case 'assistant.faq.allSpend':
      return (logs.allTotal ?? 0) > 0;
    case 'assistant.faq.economy':
      return logs.fuelUse != null || logs.lastL100 != null;
    case 'assistant.faq.oilDue':
      return preferred('oil', facts.healthItems) != null;
    case 'assistant.faq.tires':
      return preferred('tires', facts.healthItems) != null;
    case 'assistant.faq.brakes':
      return preferred('brakes', facts.healthItems) != null;
    case 'assistant.faq.oilLast':
      return serviceOf(logs, 'oil') != null;
    case 'assistant.faq.upcoming':
      return facts.healthItems.length > 0;
    case 'assistant.faq.breakdown':
      return logs.lastBreakdown != null;
    case 'assistant.faq.budget':
      return facts.monthlyBudget != null || facts.budgetHealth !== 'UNKNOWN';
    case 'assistant.faq.reserve':
      return facts.recommendedReserve != null;
    default: {
      const _e: never = item.key;
      return _e;
    }
  }
}

export function buildAnswerCard(
  read: AdvisorRead,
  facts: AdvisorFacts,
  logs: CoachLogs,
  t: Translate,
  format: CardFormat = PLAIN,
): AnswerCard | null {
  switch (read.intent) {
    case 'SPENDING_TREND':
      return spendCard(read, logs, t, format);
    case 'FUEL_SPENDING':
      return fuelCard(logs, t, format);
    case 'PART_STATUS':
    case 'MAINTENANCE_PRIORITY':
      return read.part ? statusCard(read.part, facts, logs, t, format) : null;
    case 'PART_HISTORY':
      return read.part ? historyCard(read.part, logs, t, format) : null;
    case 'UPCOMING_MAINTENANCE':
      return upcomingCard(facts, logs, t, format);
    case 'BREAKDOWN':
      return faultCard(logs, t, format);
    case 'BUDGET_HEALTH':
      return budgetCard(facts, logs, t, format);
    case 'RECOMMENDED_RESERVE':
      return reserveCard(facts, logs, t, format);
    case 'AFFORDABILITY':
    case 'MAINT_LOG':
    case 'UNSUPPORTED':
      return null;
    default: {
      const _e: never = read.intent;
      return _e;
    }
  }
}

function money(logs: CoachLogs, format: CardFormat, value: number): string {
  return `${format.amount(value)} ${logs.currency}`;
}

function km(t: Translate, format: CardFormat, value: number): string {
  return `${format.amount(value)} ${t('common.km')}`;
}

function spendCard(
  read: AdvisorRead,
  logs: CoachLogs,
  t: Translate,
  format: CardFormat,
): AnswerCard | null {
  if (read.window === 'last') {
    const last = logs.lastSpend;
    if (!last) return null;
    return {
      kicker: t('assistant.card.last'),
      figure: format.amount(last.amount),
      unit: logs.currency,
      lines: [{ label: bucket(last.bucket, t), value: format.date(last.date) }],
    };
  }
  const all = read.window === 'all';
  const fuel = all ? (logs.allFuel ?? 0) : (logs.spendFuel ?? 0);
  const maintenance = all ? (logs.allMaintenance ?? 0) : (logs.spendMaintenance ?? 0);
  const breakdown = all ? (logs.allBreakdown ?? 0) : (logs.spendBreakdown ?? 0);
  const other = all ? (logs.allOther ?? 0) : (logs.spendOther ?? 0);
  const total = all ? (logs.allTotal ?? logs.periodTotal) : logs.periodTotal;
  const lines = [
    line(t('advisor.bucket.fuel'), fuel, logs, format),
    line(t('advisor.bucket.maintenance'), maintenance, logs, format),
    line(t('advisor.bucket.breakdown'), breakdown, logs, format),
    line(t('advisor.bucket.other'), other, logs, format),
  ].filter((row): row is { label: string; value: string } => row != null);
  if (!all && logs.monthProjected != null) {
    lines.push({
      label: t('assistant.card.projected'),
      value: money(logs, format, logs.monthProjected),
    });
  }
  const note =
    !all && (logs.monthPrevious ?? 0) > 0
      ? t('assistant.card.lastMonth', { amount: money(logs, format, logs.monthPrevious ?? 0) })
      : undefined;
  return {
    kicker: t(all ? 'assistant.card.all' : 'assistant.card.month'),
    figure: format.amount(total),
    unit: logs.currency,
    lines,
    note,
  };
}

function line(
  label: string,
  value: number,
  logs: CoachLogs,
  format: CardFormat,
): { label: string; value: string } | null {
  if (!(value > 0)) return null;
  return { label, value: money(logs, format, value) };
}

function bucket(kind: 'fuel' | 'maintenance' | 'breakdown' | 'other', t: Translate): string {
  switch (kind) {
    case 'fuel':
      return t('advisor.bucket.fuel');
    case 'maintenance':
      return t('advisor.bucket.maintenance');
    case 'breakdown':
      return t('advisor.bucket.breakdown');
    case 'other':
      return t('advisor.bucket.other');
    default: {
      const _e: never = kind;
      return _e;
    }
  }
}

function fuelCard(logs: CoachLogs, t: Translate, format: CardFormat): AnswerCard | null {
  const use = logs.fuelUse;
  if (use) {
    const lines: { label: string; value: string }[] = [];
    if (use.km > 0 && use.previousKm > 0) {
      lines.push({
        label: t('home.useDistance'),
        value: `${km(t, format, use.km)} ${t('home.useVersus')} ${km(t, format, use.previousKm)}`,
      });
    }
    if (use.previousLiters > 0) {
      lines.push({
        label: t('home.useLiters'),
        value: `${format.liters(use.liters)} ${t('home.useVersus')} ${format.liters(use.previousLiters)}`,
      });
    }
    return {
      kicker: t('assistant.card.fuel'),
      figure: format.liters(use.liters),
      unit: t('assistant.card.liter'),
      lines,
      note: why(use, t),
    };
  }
  if (logs.lastL100 == null) return null;
  const lines =
    logs.prevL100 != null
      ? [{ label: t('fuel.last'), value: `${format.liters(logs.prevL100)} ${t('common.lPer100')}` }]
      : [];
  return {
    kicker: t('fuel.economy'),
    figure: format.liters(logs.lastL100),
    unit: t('common.lPer100'),
    lines,
  };
}

function why(use: FuelUseCompare, t: Translate): string | undefined {
  if (!use.reason || !use.direction) return undefined;
  return t(whyKey(use.direction, use.reason));
}

function whyKey(direction: 'up' | 'down', reason: FuelUseReason): MsgKey {
  if (direction === 'up') {
    switch (reason) {
      case 'distance':
        return 'home.useWhy.up.distance';
      case 'rate':
        return 'home.useWhy.up.rate';
      case 'both':
        return 'home.useWhy.up.both';
      case 'distanceDespiteRate':
        return 'home.useWhy.up.distanceDespiteRate';
      case 'rateDespiteDistance':
        return 'home.useWhy.up.rateDespiteDistance';
      default: {
        const _e: never = reason;
        return _e;
      }
    }
  }
  switch (reason) {
    case 'distance':
      return 'home.useWhy.down.distance';
    case 'rate':
      return 'home.useWhy.down.rate';
    case 'both':
      return 'home.useWhy.down.both';
    case 'distanceDespiteRate':
      return 'home.useWhy.down.distanceDespiteRate';
    case 'rateDespiteDistance':
      return 'home.useWhy.down.rateDespiteDistance';
    default: {
      const _e: never = reason;
      return _e;
    }
  }
}

function statusCard(
  part: AdvisorPart,
  facts: AdvisorFacts,
  logs: CoachLogs,
  t: Translate,
  format: CardFormat,
): AnswerCard | null {
  const item = preferred(part, facts.healthItems);
  if (!item) return null;
  const lines = partLines(item, serviceOf(logs, part), t, format);
  return {
    kicker: partLabel(item, t),
    figure: t(statusKey(item.status)),
    lines,
    note: item.status === 'unknown' && lines.length === 0 ? t('assistant.card.logHint') : undefined,
  };
}

function historyCard(
  part: AdvisorPart,
  logs: CoachLogs,
  t: Translate,
  format: CardFormat,
): AnswerCard | null {
  const hit = serviceOf(logs, part);
  if (!hit) return null;
  return {
    kicker: partName(part, t),
    figure: format.date(hit.date),
    lines: [{ label: t('common.km'), value: km(t, format, hit.odometer) }],
  };
}

function partLines(
  item: HealthItem,
  hit: CoachServiceHit | undefined,
  t: Translate,
  format: CardFormat,
): { label: string; value: string }[] {
  const lines: { label: string; value: string }[] = [];
  if (item.remainingKm != null && item.remainingKm > 0) {
    lines.push({ label: t('assistant.card.left'), value: km(t, format, item.remainingKm) });
  }
  const date = item.lastServiceDate ?? hit?.date;
  const odo = item.lastServiceOdo ?? hit?.odometer;
  if (date && odo != null) {
    lines.push({
      label: t('assistant.card.lastChange'),
      value: `${format.date(date)} · ${km(t, format, odo)}`,
    });
  }
  const interval = item.part.userIntervalKm ?? item.part.manufacturerIntervalKm;
  if (interval != null && interval > 0) {
    lines.push({ label: t('assistant.card.interval'), value: km(t, format, interval) });
  }
  return lines;
}

function upcomingCard(
  facts: AdvisorFacts,
  logs: CoachLogs,
  t: Translate,
  format: CardFormat,
): AnswerCard | null {
  if (facts.healthItems.length === 0 && facts.eligible90 <= 0) return null;
  const next = facts.healthItems
    .filter(
      (item) =>
        item.status === 'critical' ||
        item.status === 'overdue' ||
        item.status === 'due' ||
        item.status === 'soon',
    )
    .sort((a, b) => rank(a.status) - rank(b.status))[0];
  const lines: { label: string; value: string }[] = [];
  if (next?.remainingKm != null && next.remainingKm > 0) {
    lines.push({ label: t('assistant.card.left'), value: km(t, format, next.remainingKm) });
  }
  return {
    kicker: t('assistant.card.upcoming'),
    figure: next ? partLabel(next, t) : t('assistant.card.none'),
    lines,
    note:
      facts.eligible90 > 0
        ? t('assistant.card.within90', { amount: money(logs, format, facts.eligible90) })
        : next
          ? t(statusKey(next.status))
          : t('assistant.card.noneSoon'),
  };
}

function faultCard(logs: CoachLogs, t: Translate, format: CardFormat): AnswerCard | null {
  const last = logs.lastBreakdown;
  if (!last) return null;
  return {
    kicker: t('assistant.card.fault'),
    figure: last.title,
    lines: [{ label: t('assistant.card.lastChange'), value: format.date(last.date) }],
    note:
      logs.breakdownCount > 1
        ? t('assistant.card.faultCount', { count: format.amount(logs.breakdownCount) })
        : undefined,
  };
}

function budgetCard(facts: AdvisorFacts, logs: CoachLogs, t: Translate, format: CardFormat): AnswerCard | null {
  if (facts.monthlyBudget == null && facts.budgetHealth === 'UNKNOWN') return null;
  const lines: { label: string; value: string }[] = [];
  if (facts.monthlyBudget != null) {
    lines.push({
      label: t('assistant.card.month'),
      value: t('assistant.card.spentOf', {
        spent: money(logs, format, logs.spendMaintenance ?? 0),
        budget: money(logs, format, facts.monthlyBudget),
      }),
    });
  }
  return {
    kicker: t('assistant.card.budget'),
    figure: t(budgetKey(facts.budgetHealth)),
    lines,
  };
}

function budgetKey(health: AdvisorFacts['budgetHealth']): MsgKey {
  switch (health) {
    case 'EXCELLENT':
      return 'budget.health.EXCELLENT';
    case 'HEALTHY':
      return 'budget.health.HEALTHY';
    case 'WATCH':
      return 'budget.health.WATCH';
    case 'HIGH':
      return 'budget.health.HIGH';
    case 'CRITICAL':
      return 'budget.health.CRITICAL';
    case 'UNKNOWN':
      return 'budget.health.UNKNOWN';
    default: {
      const _e: never = health;
      return _e;
    }
  }
}

function reserveCard(facts: AdvisorFacts, logs: CoachLogs, t: Translate, format: CardFormat): AnswerCard | null {
  if (facts.recommendedReserve == null) return null;
  const lines =
    facts.eligible90 > 0
      ? [
          {
            label: t('assistant.card.upcoming'),
            value: money(logs, format, facts.eligible90),
          },
        ]
      : [];
  return {
    kicker: t('assistant.card.reserve'),
    figure: format.amount(facts.recommendedReserve),
    unit: logs.currency,
    lines,
    note: t('assistant.card.reserveBasis'),
  };
}

function partName(part: AdvisorPart, t: Translate): string {
  switch (part) {
    case 'oil':
      return t('parts.engineOil');
    case 'tires':
      return t('parts.tires');
    case 'brakes':
      return t('parts.brakePads');
    default: {
      const _e: never = part;
      return _e;
    }
  }
}

function serviceOf(logs: CoachLogs, part: AdvisorPart): CoachServiceHit | undefined {
  return logs.services?.find((hit) => hit.kind === part);
}

function idsFor(part: AdvisorPart): readonly string[] {
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

function preferred(part: AdvisorPart, items: readonly HealthItem[]): HealthItem | undefined {
  const ids = idsFor(part);
  return items
    .filter((item) => ids.includes(item.partDefinitionId))
    .sort((a, b) => rank(a.status) - rank(b.status))[0];
}

function rank(status: HealthStatus): number {
  switch (status) {
    case 'critical':
      return 0;
    case 'overdue':
      return 1;
    case 'due':
      return 2;
    case 'soon':
      return 3;
    case 'inspect':
      return 4;
    case 'unknown':
      return 5;
    case 'good':
      return 6;
    default: {
      const _e: never = status;
      return _e;
    }
  }
}
