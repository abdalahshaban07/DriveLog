import { compareDateOnly } from './dues';
import type { EconomySegment, FillUp, FuelGrade } from './models';

export interface DateWindow {
  from?: string;
  to?: string;
}

function inWindow(date: string, window: DateWindow): boolean {
  if (window.from && compareDateOnly(date, window.from) < 0) {
    return false;
  }
  if (window.to && compareDateOnly(date, window.to) > 0) {
    return false;
  }
  return true;
}

export interface TrendPoint {
  value: number;
  /** End-fill date (YYYY-MM-DD). */
  date: string;
}

function byOdometer(a: FillUp, b: FillUp): number {
  if (a.odometer !== b.odometer) {
    return a.odometer - b.odometer;
  }
  return a.createdAt.localeCompare(b.createdAt);
}

/** Logged trip distance, otherwise the odometer gap from the previous fill. */
function fillDistance(end: FillUp, prev: FillUp | undefined): number {
  const stored = end.distanceKm;
  if (stored != null && Number.isFinite(stored) && stored > 0) {
    return stored;
  }
  if (prev && end.odometer > prev.odometer) {
    return end.odometer - prev.odometer;
  }
  return 0;
}

/** One point per fill. A full tank is not required. */
function trendSegments(
  fills: readonly FillUp[],
  window: DateWindow,
): { segments: EconomySegment[]; byId: Map<string, FillUp> } {
  const sorted = [...fills].sort(byOdometer);
  const segments: EconomySegment[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const end = sorted[i]!;
    const prev = i > 0 ? sorted[i - 1] : undefined;
    const distance = fillDistance(end, prev);
    if (distance <= 0 || !inWindow(end.date, window)) {
      continue;
    }
    segments.push({
      startId: prev?.id ?? end.id,
      endId: end.id,
      distanceKm: distance,
      litersPer100Km: (end.liters / distance) * 100,
      costPerKm: end.cost / distance,
      totalCost: end.cost,
    });
  }
  return { segments, byId: new Map(fills.map((f) => [f.id, f])) };
}

function toTrendPoints(
  fills: readonly FillUp[],
  window: DateWindow,
  pick: (segment: EconomySegment) => number,
  digits: number,
): TrendPoint[] {
  const { segments, byId } = trendSegments(fills, window);
  const factor = 10 ** digits;
  return segments.map((segment) => ({
    value: Math.round(pick(segment) * factor) / factor,
    date: byId.get(segment.endId)?.date ?? '',
  }));
}

/** Cost/km per fill. Distance or odometer gap; a full tank is not required. */
export function costPerKmTrend(
  fills: readonly FillUp[],
  window: DateWindow,
): TrendPoint[] {
  return toTrendPoints(fills, window, (segment) => segment.costPerKm, 2);
}

export interface MonthSpend {
  month: string;
  value: number;
}

export function spendByMonthEntries(
  fills: readonly FillUp[],
  window: DateWindow,
): MonthSpend[] {
  const map = new Map<string, number>();
  for (const f of fills) {
    if (!inWindow(f.date, window)) {
      continue;
    }
    const key = f.date.slice(0, 7);
    map.set(key, (map.get(key) ?? 0) + f.cost);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, value]) => ({ month, value: Math.round(value) }));
}

export function spendByMonth(
  fills: readonly FillUp[],
  window: DateWindow,
): number[] {
  return spendByMonthEntries(fills, window).map((e) => e.value);
}

/** L/100 km per fill. Distance or odometer gap; a full tank is not required. */
export function economyTrend(
  fills: readonly FillUp[],
  window: DateWindow,
): TrendPoint[] {
  return toTrendPoints(fills, window, (segment) => segment.litersPer100Km, 1);
}

export type FuelGradeShareGrade = FuelGrade | 'unknown';

export interface FuelGradeShare {
  grade: FuelGradeShareGrade;
  cost: number;
}

/** Sum fill cost grouped by fuel grade inside the date window. */
export function fuelGradeCostShare(
  fills: readonly FillUp[],
  window: DateWindow,
): FuelGradeShare[] {
  const map = new Map<FuelGradeShareGrade, number>();
  for (const f of fills) {
    if (!inWindow(f.date, window)) {
      continue;
    }
    const grade: FuelGradeShareGrade = f.fuelGrade ?? 'unknown';
    map.set(grade, (map.get(grade) ?? 0) + f.cost);
  }
  return [...map.entries()]
    .map(([grade, cost]) => ({ grade, cost: Math.round(cost) }))
    .sort((a, b) => b.cost - a.cost);
}

/** Kilometres driven per month. A full tank is not required. */
export function distanceByMonth(
  fills: readonly FillUp[],
  window: DateWindow,
): MonthSpend[] {
  const { segments, byId } = trendSegments(fills, window);
  const map = new Map<string, number>();
  for (const segment of segments) {
    const date = byId.get(segment.endId)?.date ?? '';
    if (date.length < 7) {
      continue;
    }
    const key = date.slice(0, 7);
    map.set(key, (map.get(key) ?? 0) + segment.distanceKm);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, value]) => ({ month, value: Math.round(value) }));
}

/** Price per litre. Uses the logged unit price, otherwise cost ÷ litres. */
export function unitPriceTrend(
  fills: readonly FillUp[],
  window: DateWindow,
): TrendPoint[] {
  return [...fills]
    .filter((f) => inWindow(f.date, window) && f.liters > 0)
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt))
    .flatMap((f) => {
      const raw =
        f.unitPrice != null && Number.isFinite(f.unitPrice) && f.unitPrice > 0
          ? f.unitPrice
          : f.cost / f.liters;
      if (!Number.isFinite(raw) || raw <= 0) {
        return [];
      }
      return [{ value: Math.round(raw * 100) / 100, date: f.date }];
    });
}

export interface NamedShare {
  label: string;
  cost: number;
}

/** Fuel spend by station name. Unlabeled fills are skipped. Extra names fold into an empty label. */
export function placeSpendShare(
  fills: readonly FillUp[],
  window: DateWindow,
  limit = 4,
): NamedShare[] {
  const map = new Map<string, number>();
  for (const f of fills) {
    if (!inWindow(f.date, window)) {
      continue;
    }
    const label = f.placeLabel?.trim() ?? '';
    if (!label) {
      continue;
    }
    map.set(label, (map.get(label) ?? 0) + f.cost);
  }
  const ranked = [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const top = ranked.slice(0, Math.max(1, limit));
  const rest = ranked.slice(top.length).reduce((sum, [, cost]) => sum + cost, 0);
  const out = top.map(([label, cost]) => ({ label, cost: Math.round(cost) }));
  if (rest > 0) {
    out.push({ label: '', cost: Math.round(rest) });
  }
  return out;
}
