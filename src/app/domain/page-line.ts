import { DUE_SOON_DAYS, DUE_SOON_KM } from '../core/config';
import { daysUntilExpiry } from './vehicle-docs';
import { compareDateOnly, nextDueItem } from './dues';
import { daysUntil } from './expense-period';
import type { HistoryRangePreset } from './export-history';
import {
  computeEconomySegments,
  computePerFillSegments,
  tankEconomyVsAvg,
  TANK_ECONOMY_FLAT_PCT,
} from './economy';
import type { MsgKey } from '../i18n/en';
import type {
  Breakdown,
  ChargeSession,
  DateOnly,
  DueItem,
  DueStatus,
  FillUp,
  FuelGrade,
  Maintenance,
} from './models';

export const PAGE_LINE_IDS = [
  'home',
  'fuel',
  'around',
  'charts',
  'reports',
  'maintenance',
  'upcoming',
  'pretrip',
  'vault',
  'breakdowns',
  'budget',
  'passport',
  'health',
  'fuelLog',
  'maintLog',
] as const;

export type PageLineId = (typeof PAGE_LINE_IDS)[number];

export type PageLineEnergy = 'all' | 'fuel' | 'charge';

/** Active filter slice. Absent on pages that have no filter. */
export type PageLineLens = {
  from?: string;
  to?: string;
  /** Already translated, e.g. "آخر ٣ شهور". */
  period?: string;
  grade?: FuelGrade;
  gradeLabel?: string;
  energy?: PageLineEnergy;
  /** Maintenance-history type id. Absent means every type. */
  service?: string;
};

export type PageLineHealth = {
  label: string;
  urgency: 'overdue' | 'dueSoon' | 'later';
  remainingKm?: number;
  dueDate?: DateOnly;
};

/** License line only inside this window (includes overdue). */
const LICENSE_WINDOW_DAYS = 45;
const TIRE_STALE_DAYS = 30;
const PAIR_DAYS = 21;
const PAIR_KM = 1500;
const CADENCE_GAPS = 2;

export interface PageLineBag {
  today: DateOnly;
  currency: string;
  fills: readonly FillUp[];
  maintenance: readonly Maintenance[];
  breakdowns: readonly Breakdown[];
  licenseExpiry?: DateOnly;
  insuranceExpiry?: DateOnly;
  /** Latest pre-trip date where tires were checked. Missing = never. */
  tireCheckedOn?: DateOnly;
  dues: readonly DueItem[];
  /** Same rows the Coming up page lists. Remaining km and date are set only when the row has them. */
  upcoming: readonly {
    label: string;
    status: DueStatus;
    remainingKm?: number;
    dueDate?: DateOnly;
  }[];
  /** Active health parts. Empty when the car has none. */
  health: readonly PageLineHealth[];
  odometer: number;
  reportFuel: number;
  reportMaint: number;
  reportTotal: number;
  /**
   * Charts filter, inclusive. Absent keeps the last-3-months scan.
   * Empty string leaves that side open.
   */
  chartsFrom?: string;
  chartsTo?: string;
  /** Null when the car has no monthly cap. */
  budgetRemaining: number | null;
  labelDue: (item: DueItem) => string;
  labelMaint: (row: Maintenance) => string;
  charges?: readonly ChargeSession[];
  labelGrade?: (grade: FuelGrade) => string;
  lens?: PageLineLens;
}

export type PageLineFact =
  | { id: 'homeBoth'; label: string }
  | { id: 'homeUse' }
  | { id: 'homeDue'; label: string }
  | { id: 'homeBetter' }
  | { id: 'homeFlat' }
  | { id: 'fuelCadence'; interval: number; days: number }
  | { id: 'fuelToday'; interval: number }
  | { id: 'fuelUse' }
  | { id: 'aroundEg' }
  | { id: 'aroundNear' }
  | { id: 'charts'; month: string }
  | { id: 'reportsFuel' }
  | { id: 'reportsMaint' }
  | { id: 'reportsEven' }
  | { id: 'maintPair'; a: string; b: string }
  | { id: 'upcoming'; count: number; name: string }
  | { id: 'upcomingOne'; name: string }
  | { id: 'upcomingTwo'; name: string }
  | { id: 'pretrip'; days: number }
  | { id: 'pretripLicense'; days: number }
  | { id: 'pretripLicenseOver' }
  | { id: 'pretripOver' }
  | { id: 'pretripTires' }
  | { id: 'vault' }
  | { id: 'breakdown'; shop: string }
  | { id: 'breakdownRepeat' }
  | { id: 'budget' }
  | { id: 'passport'; months: number }
  | { id: 'passportOne' }
  | { id: 'healthOver'; name: string }
  | { id: 'healthOverCount'; count: number; name: string }
  | { id: 'healthSoon'; name: string }
  | { id: 'healthSoonCount'; count: number; name: string }
  | { id: 'healthNextKm'; name: string; km: number }
  | { id: 'healthNextDate'; name: string; date: string }
  | { id: 'healthNext'; name: string }
  | { id: 'fuelLogCost'; period: string; dir: 'up' | 'down' }
  | { id: 'fuelLogGrade'; grade: string; other: string; dir: 'up' | 'down' }
  | { id: 'fuelLogCharge'; period: string; count: number; kwh: number }
  | { id: 'fuelLogCount'; period: string; count: number; liters: number }
  | { id: 'maintLogTop'; period: string; name: string }
  | { id: 'maintLogCost'; name: string; dir: 'up' | 'down' }
  | { id: 'maintLogCount'; period: string; count: number; name: string }
  | { id: 'reportsShare'; period: string; kind: 'fuel' | 'maint'; pct: number }
  | { id: 'reportsEvenPeriod'; period: string }
  | { id: 'chartsUse'; dir: 'worse' | 'better' | 'flat'; period: string };

export function pageLineFact(page: PageLineId, bag: PageLineBag): PageLineFact | null {
  switch (page) {
    case 'home':
      return homeFact(bag);
    case 'fuel':
      return fuelFact(bag);
    case 'around':
      return bag.currency === 'EGP' ? { id: 'aroundEg' } : { id: 'aroundNear' };
    case 'charts':
      return chartsFact(bag);
    case 'reports':
      return reportsFact(bag);
    case 'maintenance':
      return maintFact(bag);
    case 'upcoming':
      return upcomingFact(bag);
    case 'pretrip':
      return pretripFact(bag);
    case 'vault':
      return vaultFact(bag);
    case 'breakdowns':
      return breakdownFact(bag);
    case 'budget':
      return budgetFact(bag);
    case 'passport':
      return passportFact(bag);
    case 'health':
      return healthFact(bag);
    case 'fuelLog':
      return fuelLogFact(bag);
    case 'maintLog':
      return maintLogFact(bag);
    default: {
      const _never: never = page;
      return _never;
    }
  }
}

export function pageLineSentence(
  fact: PageLineFact,
  lang: 'en' | 'ar',
): { key: MsgKey; params?: Record<string, string | number> } {
  switch (fact.id) {
    case 'homeBoth':
      return { key: 'pageLine.homeBoth', params: { label: fact.label } };
    case 'homeUse':
      return { key: 'pageLine.homeUse' };
    case 'homeDue':
      return { key: 'pageLine.homeDue', params: { label: fact.label } };
    case 'homeBetter':
      return { key: 'pageLine.homeBetter' };
    case 'homeFlat':
      return { key: 'pageLine.homeFlat' };
    case 'fuelCadence':
      return {
        key: 'pageLine.fuelCadence',
        params: { interval: fact.interval, days: fact.days },
      };
    case 'fuelToday':
      return { key: 'pageLine.fuelToday', params: { interval: fact.interval } };
    case 'fuelUse':
      return { key: 'pageLine.fuelUse' };
    case 'aroundEg':
      return { key: 'pageLine.aroundEg' };
    case 'aroundNear':
      return { key: 'pageLine.aroundNear' };
    case 'charts':
      return { key: 'pageLine.charts', params: { month: monthName(fact.month, lang) } };
    case 'reportsFuel':
      return { key: 'pageLine.reportsFuel' };
    case 'reportsMaint':
      return { key: 'pageLine.reportsMaint' };
    case 'reportsEven':
      return { key: 'pageLine.reportsEven' };
    case 'maintPair':
      return { key: 'pageLine.maintPair', params: { a: fact.a, b: fact.b } };
    case 'upcoming':
      return { key: 'pageLine.upcoming', params: { count: fact.count, name: fact.name } };
    case 'upcomingOne':
      return { key: 'pageLine.upcomingOne', params: { name: fact.name } };
    case 'upcomingTwo':
      return { key: 'pageLine.upcomingTwo', params: { name: fact.name } };
    case 'pretrip':
      return { key: 'pageLine.pretrip', params: { days: fact.days } };
    case 'pretripLicense':
      return { key: 'pageLine.pretripLicense', params: { days: fact.days } };
    case 'pretripLicenseOver':
      return { key: 'pageLine.pretripLicenseOver' };
    case 'pretripOver':
      return { key: 'pageLine.pretripOver' };
    case 'pretripTires':
      return { key: 'pageLine.pretripTires' };
    case 'vault':
      return { key: 'pageLine.vault' };
    case 'breakdown':
      return { key: 'pageLine.breakdown', params: { shop: fact.shop } };
    case 'breakdownRepeat':
      return { key: 'pageLine.breakdownRepeat' };
    case 'budget':
      return { key: 'pageLine.budget' };
    case 'passport':
      return { key: 'pageLine.passport', params: { months: fact.months } };
    case 'passportOne':
      return { key: 'pageLine.passportOne' };
    case 'healthOver':
      return { key: 'pageLine.healthOver', params: { name: fact.name } };
    case 'healthOverCount':
      return {
        key: 'pageLine.healthOverCount',
        params: { count: fact.count, name: fact.name },
      };
    case 'healthSoon':
      return { key: 'pageLine.healthSoon', params: { name: fact.name } };
    case 'healthSoonCount':
      return {
        key: 'pageLine.healthSoonCount',
        params: { count: fact.count, name: fact.name },
      };
    case 'healthNextKm':
      return { key: 'pageLine.healthNextKm', params: { name: fact.name, km: fact.km } };
    case 'healthNextDate':
      return { key: 'pageLine.healthNextDate', params: { name: fact.name, date: fact.date } };
    case 'healthNext':
      return { key: 'pageLine.healthNext', params: { name: fact.name } };
    case 'fuelLogCost':
      return {
        key: fact.dir === 'up' ? 'pageLine.fuelLogUp' : 'pageLine.fuelLogDown',
        params: { period: fact.period },
      };
    case 'fuelLogGrade':
      return {
        key: fact.dir === 'up' ? 'pageLine.fuelLogGradeUp' : 'pageLine.fuelLogGradeDown',
        params: { grade: fact.grade, other: fact.other },
      };
    case 'fuelLogCharge':
      return fact.count === 1
        ? { key: 'pageLine.fuelLogChargeOne', params: { period: fact.period, kwh: fact.kwh } }
        : {
            key: 'pageLine.fuelLogCharge',
            params: { period: fact.period, count: fact.count, kwh: fact.kwh },
          };
    case 'fuelLogCount':
      return fact.count === 1
        ? { key: 'pageLine.fuelLogCountOne', params: { period: fact.period, liters: fact.liters } }
        : {
            key: 'pageLine.fuelLogCount',
            params: { period: fact.period, count: fact.count, liters: fact.liters },
          };
    case 'maintLogTop':
      return { key: 'pageLine.maintLogTop', params: { period: fact.period, name: fact.name } };
    case 'maintLogCost':
      return {
        key: fact.dir === 'up' ? 'pageLine.maintLogUp' : 'pageLine.maintLogDown',
        params: { name: fact.name },
      };
    case 'maintLogCount':
      return fact.count === 1
        ? { key: 'pageLine.maintLogCountOne', params: { period: fact.period, name: fact.name } }
        : {
            key: 'pageLine.maintLogCount',
            params: { period: fact.period, count: fact.count, name: fact.name },
          };
    case 'reportsShare':
      return {
        key: fact.kind === 'fuel' ? 'pageLine.reportsFuelShare' : 'pageLine.reportsMaintShare',
        params: { period: fact.period, pct: fact.pct },
      };
    case 'reportsEvenPeriod':
      return { key: 'pageLine.reportsEvenPeriod', params: { period: fact.period } };
    case 'chartsUse':
      return chartsUseSentence(fact.dir, fact.period);
    default: {
      const _never: never = fact;
      return _never;
    }
  }
}

/** Reject a rewrite that adds a number the local sentence did not have. */
export function rewriteKeepsFacts(source: string, next: string): boolean {
  const line = firstSentence(next);
  if (!line || line.length > 180) return false;
  const allowed = new Set(numericTokens(source));
  if (!numericTokens(line).every((n) => allowed.has(n))) return false;
  const sourceWords = contentWords(source);
  const nextWords = contentWords(line);
  if (!sourceWords.length) return nextWords.length === 0;
  const allowedWords = new Set(sourceWords);
  if (nextWords.some((word) => !allowedWords.has(word))) return false;
  return sourceWords.every((word) => line.includes(word));
}

export function firstSentence(text: string): string {
  const line = text.replace(/\s+/g, ' ').trim();
  const match = /^.{1,180}?[.!?؟](?=\s|$)/.exec(line);
  return (match?.[0] ?? line).trim();
}

function homeFact(bag: PageLineBag): PageLineFact | null {
  const vs = tankEconomyVsAvg(bag.fills);
  const due = urgentDue(bag);
  if (vs?.direction === 'worse' && due) return { id: 'homeBoth', label: due };
  if (vs?.direction === 'worse') return { id: 'homeUse' };
  if (due) return { id: 'homeDue', label: due };
  if (vs?.direction === 'better') return { id: 'homeBetter' };
  if (vs?.direction === 'flat') return { id: 'homeFlat' };
  return fuelFact(bag);
}

function fuelFact(bag: PageLineBag): PageLineFact | null {
  const fills = gradeFills(bag);
  if (tankEconomyVsAvg(fills)?.direction === 'worse') return { id: 'fuelUse' };
  const dates = [...new Set(fills.map((f) => f.date))].filter((d) => d <= bag.today).sort();
  if (dates.length < CADENCE_GAPS + 1) return null;
  const gaps: number[] = [];
  for (let i = 1; i < dates.length; i++) {
    const gap = daysUntil(dates[i]!, dates[i - 1]!);
    if (gap > 0) gaps.push(gap);
  }
  if (gaps.length < CADENCE_GAPS) return null;
  const interval = Math.round(median(gaps));
  if (interval < 1) return null;
  const since = -daysUntil(dates[dates.length - 1]!, bag.today);
  if (since < 0) return null;
  if (since === 0) return { id: 'fuelToday', interval };
  return { id: 'fuelCadence', interval, days: since };
}

function chartsFact(bag: PageLineBag): PageLineFact | null {
  const scoped = bag.chartsFrom != null || bag.chartsTo != null;
  // ponytail: the named month follows the filter; the month before it can sit outside, and spend is the whole month.
  const fromMonth = scoped
    ? bag.chartsFrom
      ? bag.chartsFrom.slice(0, 7)
      : ''
    : threeMonthStart(bag.today).slice(0, 7);
  const toMonth = scoped && bag.chartsTo ? bag.chartsTo.slice(0, 7) : '';
  const fuel = new Map<string, number>();
  const maint = new Map<string, number>();
  for (const row of bag.fills) addMonth(fuel, row.date, row.cost);
  for (const row of bag.maintenance) addMonth(maint, row.date, row.cost ?? 0);
  const months = [...new Set([...fuel.keys(), ...maint.keys()])].sort();
  let best: { month: string; total: number } | null = null;
  for (let i = 1; i < months.length; i++) {
    const month = months[i]!;
    if (fromMonth && month < fromMonth) continue;
    if (toMonth && month > toMonth) continue;
    const prev = months[i - 1]!;
    const fuelCost = fuel.get(month) ?? 0;
    const maintCost = maint.get(month) ?? 0;
    const total = fuelCost + maintCost;
    const prevTotal = (fuel.get(prev) ?? 0) + (maint.get(prev) ?? 0);
    if (maintCost <= fuelCost || total <= prevTotal) continue;
    if (!best || total > best.total || (total === best.total && month > best.month)) {
      best = { month, total };
    }
  }
  if (best) return { id: 'charts', month: best.month };
  if (bag.chartsFrom == null && bag.chartsTo == null) return null;
  const dir = windowEconomy(bag);
  return dir ? { id: 'chartsUse', dir, period: bag.lens?.period ?? '' } : null;
}

function reportsFact(bag: PageLineBag): PageLineFact | null {
  const { reportFuel: fuel, reportMaint: maint, reportTotal: total } = bag;
  if (fuel <= 0 && maint <= 0) return null;
  const close = fuel > 0 && maint > 0 && fuel < maint * 1.25 && maint < fuel * 1.25;
  const period = bag.lens?.period;
  if (period) {
    if (close) return { id: 'reportsEvenPeriod', period };
    const base = total > 0 ? total : fuel + maint;
    const pct = Math.round(((fuel >= maint ? fuel : maint) / base) * 100);
    return {
      id: 'reportsShare',
      period,
      kind: fuel >= maint ? 'fuel' : 'maint',
      pct,
    };
  }
  if (close) return { id: 'reportsEven' };
  return fuel >= maint ? { id: 'reportsFuel' } : { id: 'reportsMaint' };
}

function maintFact(bag: PageLineBag): PageLineFact | null {
  const urgentHit = urgentPair(bag);
  if (urgentHit) {
    const [a, b] = urgentHit;
    return { id: 'maintPair', a: bag.labelMaint(a), b: bag.labelMaint(b) };
  }
  const rows = bag.maintenance.filter((m) => m.dueDate || m.dueKm != null);
  let best: { a: Maintenance; b: Maintenance; score: number } | null = null;
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      const a = rows[i]!;
      const b = rows[j]!;
      if (typeKey(a) === typeKey(b)) continue;
      const dateGap = a.dueDate && b.dueDate ? Math.abs(daysUntil(a.dueDate, b.dueDate)) : null;
      const kmGap = a.dueKm != null && b.dueKm != null ? Math.abs(a.dueKm - b.dueKm) : null;
      const close =
        (dateGap != null && dateGap <= PAIR_DAYS) || (kmGap != null && kmGap <= PAIR_KM);
      if (!close) continue;
      const score = dateGap != null && dateGap <= PAIR_DAYS ? dateGap : kmGap!;
      if (!best || score < best.score) best = { a, b, score };
    }
  }
  if (!best) return null;
  const [a, b] = sooner(best.a, best.b);
  return { id: 'maintPair', a: bag.labelMaint(a), b: bag.labelMaint(b) };
}

function upcomingFact(bag: PageLineBag): PageLineFact | null {
  const urgent = bag.upcoming.filter((d) => d.status === 'overdue' || d.status === 'dueSoon');
  const name = urgent.find((d) => d.label.trim())?.label.trim();
  if (!name) return null;
  if (urgent.length === 1) return { id: 'upcomingOne', name };
  if (urgent.length === 2) return { id: 'upcomingTwo', name };
  return { id: 'upcoming', count: urgent.length, name };
}

function pretripFact(bag: PageLineBag): PageLineFact | null {
  const days = bag.licenseExpiry != null ? daysUntilExpiry(bag.licenseExpiry, bag.today) : null;
  const license = days != null && days <= LICENSE_WINDOW_DAYS;
  const overdue = license && days != null && days < 0;
  const stale = !bag.tireCheckedOn || -daysUntil(bag.tireCheckedOn, bag.today) > TIRE_STALE_DAYS;
  if (overdue && stale) return { id: 'pretripOver' };
  if (overdue) return { id: 'pretripLicenseOver' };
  if (license && stale && days != null) return { id: 'pretrip', days };
  if (license && days != null) return { id: 'pretripLicense', days };
  if (stale) return { id: 'pretripTires' };
  return null;
}

function vaultFact(bag: PageLineBag): PageLineFact | null {
  if (!bag.insuranceExpiry || !bag.licenseExpiry) return null;
  return daysUntilExpiry(bag.insuranceExpiry, bag.today) <
    daysUntilExpiry(bag.licenseExpiry, bag.today)
    ? { id: 'vault' }
    : null;
}

function breakdownFact(bag: PageLineBag): PageLineFact | null {
  const groups = new Map<string, Breakdown[]>();
  for (const row of bag.breakdowns) {
    const key = row.symptom.trim().replace(/\s+/g, ' ').toLowerCase();
    if (!key) continue;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  let best: Breakdown[] | null = null;
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    if (!best || latestDate(list) > latestDate(best)) best = list;
  }
  if (!best) return null;
  const shop = [...best]
    .sort((a, b) => b.date.localeCompare(a.date))
    .find((r) => r.shopName?.trim())
    ?.shopName?.trim();
  return shop ? { id: 'breakdown', shop } : { id: 'breakdownRepeat' };
}

function budgetFact(bag: PageLineBag): PageLineFact | null {
  if (bag.budgetRemaining == null || bag.budgetRemaining <= 0) return null;
  const oil = bag.dues.some(
    (d) =>
      d.labelKey === 'maintenance.type.oil' && (d.status === 'overdue' || d.status === 'dueSoon'),
  );
  return oil ? { id: 'budget' } : null;
}

function healthFact(bag: PageLineBag): PageLineFact | null {
  const fromUpcoming = upcomingHealth(bag);
  if (fromUpcoming) return fromUpcoming;
  const healthOver = bag.health.filter((row) => row.urgency === 'overdue' && row.label.trim());
  const healthSoon = bag.health.filter((row) => row.urgency === 'dueSoon' && row.label.trim());
  if (healthOver.length > 1) {
    return { id: 'healthOverCount', count: healthOver.length, name: healthOver[0]!.label.trim() };
  }
  if (healthOver.length === 1) return { id: 'healthOver', name: healthOver[0]!.label.trim() };
  if (healthSoon.length === 1) return { id: 'healthSoon', name: healthSoon[0]!.label.trim() };
  if (healthSoon.length > 1) {
    return { id: 'healthSoonCount', count: healthSoon.length, name: healthSoon[0]!.label.trim() };
  }
  return calmHealth(bag);
}

function upcomingHealth(bag: PageLineBag): PageLineFact | null {
  const urgent = bag.upcoming.filter(
    (row) => (row.status === 'overdue' || row.status === 'dueSoon') && row.label.trim(),
  );
  const overdue = urgent.filter((row) => row.status === 'overdue');
  const name = (overdue[0] ?? urgent[0])?.label.trim();
  if (!name) return null;
  if (overdue.length > 1) return { id: 'healthOverCount', count: overdue.length, name };
  if (overdue.length === 1) return { id: 'healthOver', name };
  if (urgent.length === 1) return { id: 'healthSoon', name };
  return { id: 'healthSoonCount', count: urgent.length, name };
}

/** Next part when nothing is overdue or due soon. Numbers come only from the bag. */
function calmHealth(bag: PageLineBag): PageLineFact | null {
  const candidates = [
    ...bag.health
      .filter((row) => row.urgency === 'later' && row.label.trim())
      .map((row) => ({
        label: row.label.trim(),
        remainingKm: row.remainingKm,
        dueDate: row.dueDate,
      })),
    ...bag.upcoming
      .filter((row) => row.status === 'future' && row.label.trim())
      .map((row) => ({
        label: row.label.trim(),
        remainingKm: row.remainingKm,
        dueDate: row.dueDate,
      })),
  ];
  if (!candidates.length) return null;
  const withKm = candidates.flatMap((row) => {
    const km = nonNegativeKm(row.remainingKm);
    return km == null ? [] : [{ row, km }];
  });
  if (withKm.length) {
    const best = withKm.reduce((a, b) => (a.km <= b.km ? a : b));
    return { id: 'healthNextKm', name: best.row.label, km: best.km };
  }
  const withDate = candidates.filter((row) => row.dueDate);
  if (withDate.length) {
    const best = [...withDate].sort((a, b) => a.dueDate!.localeCompare(b.dueDate!))[0]!;
    return { id: 'healthNextDate', name: best.label, date: best.dueDate! };
  }
  return { id: 'healthNext', name: candidates[0]!.label };
}

function nonNegativeKm(value: number | undefined): number | null {
  if (value == null || !Number.isFinite(value) || value < 0) return null;
  return Math.round(value);
}

function passportFact(bag: PageLineBag): PageLineFact | null {
  const dates = bag.maintenance.map((m) => m.date).sort();
  const last = dates[dates.length - 1];
  if (!last) return null;
  const [y1, m1, d1] = last.split('-').map(Number) as [number, number, number];
  const [y2, m2, d2] = bag.today.split('-').map(Number) as [number, number, number];
  let months = (y2 - y1) * 12 + (m2 - m1);
  if (d2 < d1) months -= 1;
  if (months === 1) return { id: 'passportOne' };
  return months > 1 ? { id: 'passport', months } : null;
}

function urgentDue(bag: PageLineBag): string | null {
  const urgent = bag.dues.filter((d) => d.status === 'overdue' || d.status === 'dueSoon');
  const next = nextDueItem(urgent);
  if (!next) return null;
  const label = bag.labelDue(next).trim();
  return label || null;
}

function urgentPair(bag: PageLineBag): [Maintenance, Maintenance] | null {
  const rows = bag.maintenance.filter(
    (row) => (row.dueDate || row.dueKm != null) && isUrgent(row, bag),
  );
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      const a = rows[i]!;
      const b = rows[j]!;
      if (typeKey(a) !== typeKey(b)) return sooner(a, b);
    }
  }
  return null;
}

function isUrgent(row: Maintenance, bag: PageLineBag): boolean {
  if (row.dueKm != null && bag.odometer + DUE_SOON_KM >= row.dueKm) return true;
  return !!row.dueDate && daysUntil(row.dueDate, bag.today) <= DUE_SOON_DAYS;
}

function typeKey(row: Maintenance): string {
  return row.type === 'other' ? `other:${row.otherLabel ?? row.id}` : row.type;
}

function sooner(a: Maintenance, b: Maintenance): [Maintenance, Maintenance] {
  if (a.dueDate && b.dueDate) {
    return compareDateOnly(a.dueDate, b.dueDate) <= 0 ? [a, b] : [b, a];
  }
  if (a.dueKm != null && b.dueKm != null) return a.dueKm <= b.dueKm ? [a, b] : [b, a];
  return [a, b];
}

function latestDate(rows: readonly Breakdown[]): string {
  return rows.reduce((max, row) => (row.date > max ? row.date : max), '');
}

function median(nums: number[]): number {
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function addMonth(map: Map<string, number>, date: string, cost: number): void {
  const month = date.slice(0, 7);
  map.set(month, (map.get(month) ?? 0) + cost);
}

/** Same start month as the charts preset `3months`. */
function threeMonthStart(today: DateOnly): DateOnly {
  const [y, mo] = today.split('-').map(Number) as [number, number];
  const from = new Date(y, mo - 1 - 2, 1);
  const mm = String(from.getMonth() + 1).padStart(2, '0');
  const dd = String(from.getDate()).padStart(2, '0');
  return `${from.getFullYear()}-${mm}-${dd}`;
}

function monthName(ym: string, lang: 'en' | 'ar'): string {
  const [y, m] = ym.split('-').map(Number) as [number, number];
  return new Intl.DateTimeFormat(lang === 'ar' ? 'ar-EG' : 'en', { month: 'long' }).format(
    new Date(y, m - 1, 1),
  );
}

export function pageLinePeriod(
  preset: HistoryRangePreset,
  from: string,
  to: string,
  t: (key: MsgKey, params?: Record<string, string | number>) => string,
): string {
  switch (preset) {
    case 'thisMonth':
      return t('pageLine.period.month');
    case '3months':
      return t('pageLine.period.months');
    case 'year':
      return t('pageLine.period.year');
    case 'custom':
      if (from && to) return t('pageLine.period.span', { from, to });
      if (from) return t('pageLine.period.since', { from });
      if (to) return t('pageLine.period.until', { to });
      return t('pageLine.period.all');
    default: {
      const _never: never = preset;
      return _never;
    }
  }
}

function chartsUseSentence(
  dir: 'worse' | 'better' | 'flat',
  period: string,
): { key: MsgKey; params?: Record<string, string | number> } {
  switch (dir) {
    case 'worse':
      return period
        ? { key: 'pageLine.chartsWorsePeriod', params: { period } }
        : { key: 'pageLine.chartsWorse' };
    case 'better':
      return period
        ? { key: 'pageLine.chartsBetterPeriod', params: { period } }
        : { key: 'pageLine.chartsBetter' };
    case 'flat':
      return period
        ? { key: 'pageLine.chartsFlatPeriod', params: { period } }
        : { key: 'pageLine.chartsFlat' };
    default: {
      const _never: never = dir;
      return _never;
    }
  }
}

function gradeFills(bag: PageLineBag): readonly FillUp[] {
  const grade = bag.lens?.grade;
  return grade ? bag.fills.filter((row) => row.fuelGrade === grade) : bag.fills;
}

function fuelLogFact(bag: PageLineBag): PageLineFact | null {
  const lens = bag.lens;
  if (!lens?.period) return null;
  const from = lens.from;
  const to = lens.to;
  const energy = lens.energy ?? 'all';
  const period = lens.period;
  const charges = (bag.charges ?? []).filter((row) => inRange(row.date, from, to));
  if (energy === 'charge') {
    if (!charges.length) return null;
    return {
      id: 'fuelLogCharge',
      period,
      count: charges.length,
      kwh: round1(charges.reduce((sum, row) => sum + row.kWh, 0)),
    };
  }
  const windowFills = bag.fills.filter((row) => inRange(row.date, from, to));
  if (lens.grade && lens.gradeLabel) {
    const compared = gradeCompare(windowFills, lens.grade, lens.gradeLabel, bag.labelGrade);
    if (compared) return compared;
  }
  const fills = lens.grade
    ? windowFills.filter((row) => row.fuelGrade === lens.grade)
    : windowFills;
  if (!fills.length && energy === 'all' && charges.length) {
    return {
      id: 'fuelLogCharge',
      period,
      count: charges.length,
      kwh: round1(charges.reduce((sum, row) => sum + row.kWh, 0)),
    };
  }
  if (!fills.length) return null;
  const prev = previousSpan(from, to);
  if (prev) {
    const prevFills = bag.fills.filter(
      (row) =>
        inRange(row.date, prev.from, prev.to) && (!lens.grade || row.fuelGrade === lens.grade),
    );
    const prevCharges = (bag.charges ?? []).filter((row) => inRange(row.date, prev.from, prev.to));
    const current = sliceMoney(fills, charges, energy, !!lens.grade);
    const before = sliceMoney(prevFills, prevCharges, energy, !!lens.grade);
    if (before > 0 && current > 0 && current !== before) {
      return { id: 'fuelLogCost', period, dir: current > before ? 'up' : 'down' };
    }
  }
  return {
    id: 'fuelLogCount',
    period,
    count: fills.length,
    liters: round1(fills.reduce((sum, row) => sum + row.liters, 0)),
  };
}

/** ponytail: names the other grade with the most liters, not every grade in the window. */
function gradeCompare(
  fills: readonly FillUp[],
  grade: FuelGrade,
  gradeLabel: string,
  labelGrade?: (grade: FuelGrade) => string,
): PageLineFact | null {
  const mine = unitPrice(fills.filter((row) => row.fuelGrade === grade));
  if (mine == null || !labelGrade || !gradeLabel.trim()) return null;
  let best: { grade: FuelGrade; liters: number; price: number } | null = null;
  const others = new Map<FuelGrade, FillUp[]>();
  for (const row of fills) {
    if (!row.fuelGrade || row.fuelGrade === grade) continue;
    others.set(row.fuelGrade, [...(others.get(row.fuelGrade) ?? []), row]);
  }
  for (const [id, rows] of others) {
    const price = unitPrice(rows);
    const liters = rows.reduce((sum, row) => sum + row.liters, 0);
    if (price == null || liters <= 0) continue;
    if (!best || liters > best.liters) best = { grade: id, liters, price };
  }
  if (!best) return null;
  const other = labelGrade(best.grade).trim();
  if (!other) return null;
  const delta = (mine - best.price) / best.price;
  if (Math.abs(delta) < 0.01) return null;
  return {
    id: 'fuelLogGrade',
    grade: gradeLabel.trim(),
    other,
    dir: mine > best.price ? 'up' : 'down',
  };
}

function maintLogFact(bag: PageLineBag): PageLineFact | null {
  const lens = bag.lens;
  if (!lens?.period) return null;
  const rows = bag.maintenance.filter((row) => inRange(row.date, lens.from, lens.to));
  const scoped = lens.service ? rows.filter((row) => historyTypeId(row) === lens.service) : rows;
  if (!scoped.length) return null;
  if (lens.service) {
    const name = bag.labelMaint(scoped[0]!).trim();
    if (!name) return null;
    const prev = previousSpan(lens.from, lens.to);
    if (prev) {
      const beforeRows = bag.maintenance.filter(
        (row) => inRange(row.date, prev.from, prev.to) && historyTypeId(row) === lens.service,
      );
      const current = maintMoney(scoped);
      const before = maintMoney(beforeRows);
      if (before > 0 && current !== before) {
        return { id: 'maintLogCost', name, dir: current > before ? 'up' : 'down' };
      }
    }
    return { id: 'maintLogCount', period: lens.period, count: scoped.length, name };
  }
  const name = dominantMaint(scoped, bag);
  return name ? { id: 'maintLogTop', period: lens.period, name } : null;
}

function dominantMaint(rows: readonly Maintenance[], bag: PageLineBag): string | null {
  const groups = new Map<string, Maintenance[]>();
  for (const row of rows) {
    groups.set(historyTypeId(row), [...(groups.get(historyTypeId(row)) ?? []), row]);
  }
  let best: { rows: Maintenance[]; cost: number; count: number } | null = null;
  for (const list of groups.values()) {
    const cost = maintMoney(list);
    if (!best || cost > best.cost || (cost === best.cost && list.length > best.count)) {
      best = { rows: list, cost, count: list.length };
    }
  }
  return best ? bag.labelMaint(best.rows[0]!).trim() || null : null;
}

function windowEconomy(bag: PageLineBag): 'worse' | 'better' | 'flat' | null {
  const from = bag.chartsFrom ?? '';
  const to = bag.chartsTo ?? '';
  const perFill = computePerFillSegments(bag.fills);
  const segments = perFill.length ? perFill : computeEconomySegments(bag.fills);
  const byId = new Map(bag.fills.map((row) => [row.id, row]));
  let inLiters = 0;
  let inDistance = 0;
  let outLiters = 0;
  let outDistance = 0;
  for (const segment of segments) {
    const date = byId.get(segment.endId)?.date;
    if (!date || segment.distanceKm <= 0) continue;
    const inside = inRange(date, from, to);
    const liters = (segment.litersPer100Km * segment.distanceKm) / 100;
    if (inside) {
      inLiters += liters;
      inDistance += segment.distanceKm;
    } else {
      outLiters += liters;
      outDistance += segment.distanceKm;
    }
  }
  if (inDistance <= 0 || outDistance <= 0) return null;
  const base = (outLiters / outDistance) * 100;
  if (base <= 0) return null;
  const delta = (((inLiters / inDistance) * 100 - base) / base) * 100;
  if (delta <= -TANK_ECONOMY_FLAT_PCT) return 'better';
  if (delta >= TANK_ECONOMY_FLAT_PCT) return 'worse';
  return 'flat';
}

function historyTypeId(row: Maintenance): string {
  return row.otherLabel ? `custom:${row.otherLabel}` : row.type;
}

function sliceMoney(
  fills: readonly FillUp[],
  charges: readonly ChargeSession[],
  energy: PageLineEnergy,
  graded: boolean,
): number {
  const fuel = roundMoney(fills.reduce((sum, row) => sum + row.cost, 0));
  if (graded || energy === 'fuel') return fuel;
  return roundMoney(fuel + charges.reduce((sum, row) => sum + row.cost, 0));
}

function maintMoney(rows: readonly Maintenance[]): number {
  return roundMoney(rows.reduce((sum, row) => sum + (row.cost ?? 0), 0));
}

function unitPrice(fills: readonly FillUp[]): number | null {
  let cost = 0;
  let liters = 0;
  for (const row of fills) {
    if (row.liters <= 0) continue;
    cost += row.cost;
    liters += row.liters;
  }
  return liters > 0 ? cost / liters : null;
}

function inRange(date: string, from?: string, to?: string): boolean {
  if (from && date < from) return false;
  if (to && date > to) return false;
  return true;
}

function previousSpan(from?: string, to?: string): { from: string; to: string } | null {
  if (!from || !to || to < from) return null;
  const length = daysUntil(to, from) + 1;
  if (length < 1) return null;
  const prevTo = addDays(from, -1);
  return { from: addDays(prevTo, -(length - 1)), to: prevTo };
}

function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function contentWords(text: string): string[] {
  return (text.match(/\p{L}{3,}/gu) ?? []).map((word) => word.toLowerCase());
}

function numericTokens(text: string): string[] {
  const folded = text
    .replace(/[٠-٩]/g, (ch) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(ch)))
    .replace(/[۰-۹]/g, (ch) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(ch)));
  return folded.match(/\d+/g) ?? [];
}
