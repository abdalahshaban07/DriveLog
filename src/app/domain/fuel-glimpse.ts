import {
  computeEconomySegments,
  computePerFillSegments,
  TANK_ECONOMY_FLAT_PCT,
} from './economy';
import { daysUntil } from './expense-period';
import type { EconomySegment, FillUp } from './models';

/** Window the fuel page lists. */
export const FUEL_GLIMPSE_COUNT = 5;
/** A 1-day wobble is not a new habit. */
const RHYTHM_DAYS = 2;
/** One fill has to take at least this share of the window. */
const SPEND_SHARE = 0.35;
/** Official price moves; station rounding under this stays quiet. */
const PRICE_STEP = 0.25;
/** Liters per 100 km before "higher than usual" is worth a sentence. */
const USE_DELTA = 0.3;

export type FuelGlimpse =
  | { kind: 'rhythm'; recentDays: number; usualDays: number }
  | { kind: 'spend'; date: string; sharePct: number; count: number }
  | { kind: 'consumption'; direction: 'higher' | 'lower'; deltaL100: number; count: number }
  | { kind: 'price'; now: number; then: number }
  | { kind: 'steady'; l100: number; count: number };

function byRecent(a: FillUp, b: FillUp): number {
  return b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt);
}

function segmentsFor(fills: readonly FillUp[]): EconomySegment[] {
  const perFill = computePerFillSegments(fills);
  return perFill.length > 0 ? perFill : computeEconomySegments(fills);
}

function weightedL100(segments: readonly EconomySegment[]): number | null {
  let liters = 0;
  let distance = 0;
  for (const segment of segments) {
    liters += (segment.litersPer100Km * segment.distanceKm) / 100;
    distance += segment.distanceKm;
  }
  if (distance <= 0) {
    return null;
  }
  return (liters / distance) * 100;
}

function median(nums: readonly number[]): number {
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function unitPrice(fill: FillUp): number | null {
  if (fill.unitPrice != null && Number.isFinite(fill.unitPrice) && fill.unitPrice > 0) {
    return Math.round(fill.unitPrice * 100) / 100;
  }
  if (fill.liters > 0 && Number.isFinite(fill.cost) && fill.cost > 0) {
    return Math.round((fill.cost / fill.liters) * 100) / 100;
  }
  return null;
}

function rhythm(fills: readonly FillUp[]): FuelGlimpse | null {
  const dates = [...new Set(fills.map((fill) => fill.date))].sort();
  const gaps: number[] = [];
  for (let i = 1; i < dates.length; i++) {
    const gap = daysUntil(dates[i]!, dates[i - 1]!);
    if (gap > 0) {
      gaps.push(gap);
    }
  }
  if (gaps.length < 3) {
    return null;
  }
  const recentDays = gaps[gaps.length - 1]!;
  const usualDays = Math.round(median(gaps.slice(0, -1)));
  if (usualDays < 1 || Math.abs(recentDays - usualDays) < RHYTHM_DAYS) {
    return null;
  }
  return { kind: 'rhythm', recentDays, usualDays };
}

function spend(recent: readonly FillUp[]): FuelGlimpse | null {
  if (recent.length < 3) {
    return null;
  }
  const total = recent.reduce((sum, fill) => sum + fill.cost, 0);
  if (total <= 0) {
    return null;
  }
  const top = recent.reduce((best, fill) => (fill.cost > best.cost ? fill : best));
  const share = top.cost / total;
  if (share < SPEND_SHARE) {
    return null;
  }
  return {
    kind: 'spend',
    date: top.date,
    sharePct: Math.round(share * 100),
    count: recent.length,
  };
}

function consumption(
  fills: readonly FillUp[],
  recent: readonly FillUp[],
): FuelGlimpse | null {
  const ids = new Set(recent.map((fill) => fill.id));
  const segments = segmentsFor(fills);
  const prior = segments.filter((segment) => !ids.has(segment.endId));
  if (prior.length < 2) {
    return null;
  }
  const recentSegments = segments.filter((segment) => ids.has(segment.endId));
  const usual = weightedL100(prior);
  const now = weightedL100(recentSegments);
  if (usual == null || now == null || usual <= 0) {
    return null;
  }
  const delta = now - usual;
  const shown = Math.round(Math.abs(delta) * 10) / 10;
  if (shown < USE_DELTA || (Math.abs(delta) / usual) * 100 < TANK_ECONOMY_FLAT_PCT) {
    return null;
  }
  return {
    kind: 'consumption',
    direction: delta > 0 ? 'higher' : 'lower',
    deltaL100: shown,
    count: recent.length,
  };
}

function price(recent: readonly FillUp[]): FuelGlimpse | null {
  const latest = recent[0];
  if (!latest) {
    return null;
  }
  const grade = latest.fuelGrade;
  const sameGrade = recent.filter((fill) => fill.fuelGrade === grade);
  const prices = [...sameGrade]
    .reverse()
    .map(unitPrice)
    .filter((value): value is number => value != null);
  const now = prices[prices.length - 1];
  if (now == null) {
    return null;
  }
  for (let i = prices.length - 2; i >= 0; i--) {
    const then = prices[i]!;
    if (Math.abs(now - then) >= PRICE_STEP) {
      return { kind: 'price', now, then };
    }
  }
  return null;
}

function steady(fills: readonly FillUp[], recent: readonly FillUp[]): FuelGlimpse | null {
  const ids = new Set(recent.map((fill) => fill.id));
  const segments = segmentsFor(fills);
  const l100 =
    weightedL100(segments.filter((segment) => ids.has(segment.endId))) ??
    weightedL100(segments);
  if (l100 == null) {
    return null;
  }
  return { kind: 'steady', l100, count: recent.length };
}

/**
 * One sentence for the last few fill-ups.
 * Order: rhythm, a fill that dominates the spend, consumption drift, a real
 * liter-price change, then a calm reading.
 * ponytail: first match wins — a second fact stays hidden until the first goes quiet.
 */
export function fuelGlimpse(fills: readonly FillUp[]): FuelGlimpse | null {
  if (fills.length < 2) {
    return null;
  }
  const recent = [...fills].sort(byRecent).slice(0, FUEL_GLIMPSE_COUNT);
  return rhythm(fills) ?? spend(recent) ?? consumption(fills, recent) ?? price(recent) ?? steady(fills, recent);
}
