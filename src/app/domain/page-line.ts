import { DUE_SOON_DAYS, DUE_SOON_KM } from '../core/config';
import { daysUntilExpiry } from './vehicle-docs';
import { compareDateOnly, nextDueItem } from './dues';
import { daysUntil } from './expense-period';
import { tankEconomyVsAvg } from './economy';
import type { MsgKey } from '../i18n/en';
import type { Breakdown, DateOnly, DueItem, DueStatus, FillUp, Maintenance } from './models';

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
] as const;

export type PageLineId = (typeof PAGE_LINE_IDS)[number];

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
  /** Same rows the Coming up page lists. */
  upcoming: readonly { label: string; status: DueStatus }[];
  odometer: number;
  reportFuel: number;
  reportMaint: number;
  reportTotal: number;
  /** Null when the car has no monthly cap. */
  budgetRemaining: number | null;
  labelDue: (item: DueItem) => string;
  labelMaint: (row: Maintenance) => string;
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
  | { id: 'passportOne' };

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
  if (tankEconomyVsAvg(bag.fills)?.direction === 'worse') return { id: 'fuelUse' };
  const dates = [...new Set(bag.fills.map((f) => f.date))].filter((d) => d <= bag.today).sort();
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
  const from = threeMonthStart(bag.today);
  const fuel = new Map<string, number>();
  const maint = new Map<string, number>();
  for (const row of bag.fills) addMonth(fuel, row.date, row.cost);
  for (const row of bag.maintenance) addMonth(maint, row.date, row.cost ?? 0);
  const months = [...new Set([...fuel.keys(), ...maint.keys()])].sort();
  let best: { month: string; total: number } | null = null;
  for (let i = 1; i < months.length; i++) {
    const month = months[i]!;
    if (month < from.slice(0, 7)) continue;
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
  return best ? { id: 'charts', month: best.month } : null;
}

function reportsFact(bag: PageLineBag): PageLineFact | null {
  const { reportFuel: fuel, reportMaint: maint } = bag;
  if (fuel <= 0 && maint <= 0) return null;
  if (fuel > 0 && maint > 0 && fuel < maint * 1.25 && maint < fuel * 1.25) {
    return { id: 'reportsEven' };
  }
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
      const dateGap =
        a.dueDate && b.dueDate ? Math.abs(daysUntil(a.dueDate, b.dueDate)) : null;
      const kmGap = a.dueKm != null && b.dueKm != null ? Math.abs(a.dueKm - b.dueKm) : null;
      const close = (dateGap != null && dateGap <= PAIR_DAYS) || (kmGap != null && kmGap <= PAIR_KM);
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
  const days =
    bag.licenseExpiry != null ? daysUntilExpiry(bag.licenseExpiry, bag.today) : null;
  const license = days != null && days <= LICENSE_WINDOW_DAYS;
  const overdue = license && days != null && days < 0;
  const stale =
    !bag.tireCheckedOn || -daysUntil(bag.tireCheckedOn, bag.today) > TIRE_STALE_DAYS;
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

function contentWords(text: string): string[] {
  return (text.match(/\p{L}{3,}/gu) ?? []).map((word) => word.toLowerCase());
}

function numericTokens(text: string): string[] {
  const folded = text
    .replace(/[٠-٩]/g, (ch) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(ch)))
    .replace(/[۰-۹]/g, (ch) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(ch)));
  return folded.match(/\d+/g) ?? [];
}
