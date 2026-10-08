import type { Db } from '../data/db';
import type { MsgKey } from '../i18n/en';
import {
  normalizeAdvisorText,
  readAdvisor,
  type AdvisorIntent,
  type AdvisorPart,
  type AdvisorRead,
} from './advisor-intent';
import { buildAnswerCard, cardText, type AnswerCard, type CardFormat } from './advisor-card';
import { currencyWord } from './currencies';
import { computeEconomySegments, computePerFillSegments, fuelUseCompare } from './economy';
import type { PeriodTotals } from './expense-period';
import type { Breakdown, Car, FillUp, Maintenance, OtherExpense } from './models';
import {
  SYSTEM_BRAKE_DISCS_ID,
  SYSTEM_BRAKE_PADS_ID,
  SYSTEM_ENGINE_OIL_ID,
  SYSTEM_TIRES_ID,
} from './part-catalog';
import { buildMonthOutlook, currentMonthSpend } from './recommendations';
import {
  askLocal,
  partLabel,
  statusKey,
  type AdvisorFacts,
  type CoachLogs,
  type CoachServiceHit,
  type CoachSpendHit,
} from './smart-advisor';
import { buildVehicleFacts, type VehicleFactsBundle } from './vehicle-facts';

export type CoachSource = 'local' | 'remote';

export type CoachReply = {
  text: string;
  source: CoachSource;
  card?: AnswerCard;
};

export type CoachInputs = {
  car: Car;
  facts: VehicleFactsBundle;
  logs: CoachLogs;
  totals: PeriodTotals;
};

type CoachPartSnapshot = {
  name: string;
  status: string;
};

export type CoachSnapshot = {
  nickname: string;
  odometer: number;
  currency: string;
  budgetHealth: AdvisorFacts['budgetHealth'];
  affordability: AdvisorFacts['affordability'];
  recommendedReserve: number | null;
  reserveTarget: number | null;
  monthlyBudget: number | null;
  eligible90: number;
  fuelRisePct: number | null;
  lastL100: number | null;
  periodTotal: number;
  fuel: number;
  maintenance: number;
  breakdown: number;
  other: number;
  maintenanceCount: number;
  breakdownCount: number;
  parts: CoachPartSnapshot[];
};

type Translate = (key: MsgKey, params?: Record<string, string | number>) => string;

function roundOrNull(value: number | null): number | null {
  return value == null ? null : Math.round(value);
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function newest<T extends { date: string; createdAt?: string }>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => {
    const byDate = b.date.localeCompare(a.date);
    if (byDate !== 0) return byDate;
    return (b.createdAt ?? '').localeCompare(a.createdAt ?? '');
  });
}

function serviceKind(record: Maintenance): AdvisorPart | 'other' {
  if (record.type === 'oil' || record.partDefinitionId === SYSTEM_ENGINE_OIL_ID) return 'oil';
  if (record.type === 'tires' || record.partDefinitionId === SYSTEM_TIRES_ID) return 'tires';
  if (
    record.type === 'brakes' ||
    record.partDefinitionId === SYSTEM_BRAKE_PADS_ID ||
    record.partDefinitionId === SYSTEM_BRAKE_DISCS_ID
  ) {
    return 'brakes';
  }
  const blob = normalizeAdvisorText(`${record.otherLabel ?? ''} ${record.note ?? ''}`);
  if (/زيت|oil/.test(blob)) return 'oil';
  if (/كاوتش|كوتش|اطار|tire/.test(blob)) return 'tires';
  if (/فرامل|brake/.test(blob)) return 'brakes';
  return 'other';
}

function economySeries(fills: readonly FillUp[]): number[] {
  const perFill = computePerFillSegments(fills);
  const segments = perFill.length > 0 ? perFill : computeEconomySegments(fills);
  return segments.map((segment) => segment.litersPer100Km);
}

export function buildCoachLogs(
  currency: string,
  totals: PeriodTotals,
  fills: readonly FillUp[],
  maintenance: readonly Maintenance[],
  breakdowns: readonly Breakdown[],
  other: readonly OtherExpense[],
): CoachLogs {
  const series = economySeries(fills);
  const services: CoachServiceHit[] = newest(maintenance).map((record) => ({
    kind: serviceKind(record),
    name: (record.otherLabel ?? '').trim(),
    date: record.date,
    odometer: record.odometer,
  }));
  const lastBreak = newest(breakdowns)[0];
  const spends: CoachSpendHit[] = [
    ...fills.map((fill) => ({
      bucket: 'fuel' as const,
      amount: fill.cost,
      date: fill.date,
      createdAt: fill.createdAt,
    })),
    ...maintenance
      .filter((record) => record.cost != null)
      .map((record) => ({
        bucket: 'maintenance' as const,
        amount: record.cost ?? 0,
        date: record.date,
        createdAt: record.createdAt,
      })),
    ...breakdowns.map((row) => ({
      bucket: 'breakdown' as const,
      amount: row.repairCost,
      date: row.date,
      createdAt: row.createdAt,
    })),
    ...other.map((row) => ({
      bucket: 'other' as const,
      amount: row.amount,
      date: row.date,
      createdAt: row.createdAt,
    })),
  ];
  const lastSpend = newest(spends)[0];
  const allFuel = sum(fills.map((fill) => fill.cost));
  const allMaintenance = sum(maintenance.map((record) => record.cost ?? 0));
  const allBreakdown = sum(breakdowns.map((row) => row.repairCost));
  const allOther = sum(other.map((row) => row.amount));
  return {
    currency,
    periodTotal: totals.total,
    maintenanceCount: maintenance.length,
    breakdownCount: breakdowns.length,
    lastL100: series.at(-1) ?? null,
    prevL100: series.length >= 2 ? series[series.length - 2]! : null,
    spendFuel: totals.fuel,
    spendMaintenance: totals.maintenance,
    spendBreakdown: totals.breakdowns,
    spendOther: totals.other,
    allFuel,
    allMaintenance,
    allBreakdown,
    allOther,
    allTotal: allFuel + allMaintenance + allBreakdown + allOther,
    lastBreakdown:
      lastBreak && lastBreak.symptom.trim()
        ? { title: lastBreak.symptom.trim().slice(0, 80), date: lastBreak.date }
        : null,
    services,
    lastSpend: lastSpend
      ? { bucket: lastSpend.bucket, amount: lastSpend.amount, date: lastSpend.date }
      : null,
  };
}

export function loadCoachInputs(db: Db): CoachInputs | null {
  const facts = buildVehicleFacts(db);
  if (!facts) return null;
  const car = db.car();
  if (!car) return null;
  const fills = db.fillUps();
  const maintenance = db.maintenance();
  const breakdowns = db.breakdowns();
  const other = db.otherExpenses();
  const settings = db.settings();
  const totals = currentMonthSpend(fills, maintenance, breakdowns, other);
  const outlook = buildMonthOutlook(fills, maintenance, breakdowns, other);
  return {
    car,
    facts,
    totals,
    logs: {
      ...buildCoachLogs(
        currencyWord(settings.currency, settings.language),
        totals,
        fills,
        maintenance,
        breakdowns,
        other,
      ),
      monthProjected: outlook.projected,
      monthPrevious: outlook.previous,
      fuelUse: fuelUseCompare(fills),
    },
  };
}

export function coachSnapshot(
  facts: AdvisorFacts,
  logs: CoachLogs,
  totals: PeriodTotals,
  car: Car,
  t: Translate,
): CoachSnapshot {
  const parts = facts.healthItems
    .filter((item) => item.status !== 'good')
    .slice(0, 5)
    .map((item) => ({
      name: partLabel(item, t),
      status: t(statusKey(item.status)),
    }));
  return {
    nickname: car.nickname,
    odometer: car.currentOdometer,
    currency: logs.currency,
    budgetHealth: facts.budgetHealth,
    affordability: facts.affordability,
    recommendedReserve: roundOrNull(facts.recommendedReserve),
    reserveTarget: facts.reserveTarget,
    monthlyBudget: facts.monthlyBudget,
    eligible90: Math.round(facts.eligible90),
    fuelRisePct: facts.fuelRisePct,
    lastL100: logs.lastL100,
    periodTotal: Math.round(totals.total),
    fuel: totals.fuel,
    maintenance: totals.maintenance,
    breakdown: totals.breakdowns,
    other: totals.other,
    maintenanceCount: logs.maintenanceCount,
    breakdownCount: logs.breakdownCount,
    parts,
  };
}

/** Named lines for the online coach. 0 stays 0; only nulls become "not recorded". */
export function coachPrompt(snapshot: CoachSnapshot, lang: 'en' | 'ar'): string {
  const ar = lang === 'ar';
  const missing = ar ? 'مش متسجل' : 'not recorded';
  const money = (value: number | null) =>
    value == null ? missing : `${Math.round(value)} ${snapshot.currency}`;
  const row = (label: string, value: string) => `${label}: ${value}`;
  const attention =
    snapshot.parts.length === 0
      ? [row(ar ? 'محتاج اهتمام' : 'Needs attention', ar ? 'مفيش' : 'none')]
      : [
          ar ? 'محتاج اهتمام:' : 'Needs attention:',
          ...snapshot.parts.map((part) => `- ${part.name}: ${part.status}`),
        ];
  return [
    ar
      ? 'أنت مدرب DriveLog لعربيّة واحدة. جاوب بالعامية المصرية، جمل قصيرة، من غير علامات ومن غير إنجليزي.'
      : "You are DriveLog's coach for one car. Reply in short plain sentences, with no markdown.",
    ar
      ? 'استخدم الأسطر دي بس. الرقم 0 معناه صفر، مش إن البيانات ناقصة. قول «مش متسجل» بس لو السطر مكتوب كده. متخترعش تكاليف.'
      : 'Use only the lines below. 0 means zero, not missing data. Say "not recorded" only when a line says that. Do not invent costs.',
    '',
    row(ar ? 'العربية' : 'Car', snapshot.nickname),
    row(ar ? 'العداد' : 'Odometer', `${snapshot.odometer} ${ar ? 'كم' : 'km'}`),
    row(ar ? 'العملة' : 'Currency', snapshot.currency),
    row(ar ? 'مصروف الشهر ده' : 'This month', money(snapshot.periodTotal)),
    row(ar ? 'بنزين الشهر' : 'Fuel this month', money(snapshot.fuel)),
    row(ar ? 'صيانة الشهر' : 'Maintenance this month', money(snapshot.maintenance)),
    row(ar ? 'أعطال الشهر' : 'Breakdowns this month', money(snapshot.breakdown)),
    row(ar ? 'مصاريف تانية الشهر' : 'Other costs this month', money(snapshot.other)),
    row(ar ? 'سجلات الصيانة' : 'Maintenance records', String(snapshot.maintenanceCount)),
    row(ar ? 'سجلات الأعطال' : 'Breakdown records', String(snapshot.breakdownCount)),
    row(ar ? 'ميزانية الصيانة' : 'Maintenance budget', money(snapshot.monthlyBudget)),
    row(ar ? 'الاحتياطي المقترح' : 'Suggested reserve', money(snapshot.recommendedReserve)),
    row(ar ? 'هدف الاحتياطي' : 'Reserve target', money(snapshot.reserveTarget)),
    row(ar ? 'صيانة خلال 90 يوم' : 'Due within 90 days', money(snapshot.eligible90)),
    row(
      ar ? 'ارتفاع البنزين' : 'Fuel use change',
      snapshot.fuelRisePct == null ? missing : `${Math.round(snapshot.fuelRisePct)}%`,
    ),
    row(ar ? 'آخر استهلاك' : 'Latest economy', economyLine(snapshot.lastL100, ar, missing)),
    row(ar ? 'حالة الميزانية' : 'Budget health', healthWord(snapshot.budgetHealth, ar, missing)),
    row(ar ? 'القدرة على التكلفة' : 'Affordability', affordWord(snapshot.affordability, ar, missing)),
    ...attention,
  ].join('\n');
}

function economyLine(value: number | null, ar: boolean, missing: string): string {
  if (value == null) return missing;
  const n = Math.round(value * 10) / 10;
  return `${n} ${ar ? 'لتر لكل 100 كم' : 'L/100 km'}`;
}

function healthWord(health: CoachSnapshot['budgetHealth'], ar: boolean, missing: string): string {
  switch (health) {
    case 'EXCELLENT':
      return ar ? 'ممتازة' : 'Excellent';
    case 'HEALTHY':
      return ar ? 'كويسة' : 'Healthy';
    case 'WATCH':
      return ar ? 'خلي بالك' : 'Watch';
    case 'HIGH':
      return ar ? 'عالية' : 'High';
    case 'CRITICAL':
      return ar ? 'حرجة' : 'Critical';
    case 'UNKNOWN':
      return missing;
    default: {
      const _e: never = health;
      return _e;
    }
  }
}

function affordWord(value: CoachSnapshot['affordability'], ar: boolean, missing: string): string {
  switch (value) {
    case 'CAN_AFFORD':
      return ar ? 'يقدر' : 'Can afford';
    case 'TIGHT':
      return ar ? 'ضيقة' : 'Tight';
    case 'NOT_RECOMMENDED':
      return ar ? 'مش مناسب' : 'Not recommended';
    case 'UNKNOWN':
      return missing;
    default: {
      const _e: never = value;
      return _e;
    }
  }
}

export function localCoachAnswer(
  question: string,
  facts: AdvisorFacts,
  logs: CoachLogs,
  t: Translate,
  intentHint?: AdvisorIntent | AdvisorRead,
  format?: CardFormat,
): CoachReply {
  const read = asRead(question, intentHint);
  const card = buildAnswerCard(read, facts, logs, t, format);
  if (card) return { text: cardText(card), source: 'local', card };
  const answer = askLocal(question, facts, logs, t, read);
  const text = `${t(answer.titleKey)} ${t(answer.bodyKey, answer.params)}`.trim();
  return { text, source: 'local' };
}

function asRead(question: string, hint?: AdvisorIntent | AdvisorRead): AdvisorRead {
  if (hint && typeof hint === 'object') return hint;
  const read = readAdvisor(question);
  if (!hint) return read;
  return { ...read, intent: hint };
}
