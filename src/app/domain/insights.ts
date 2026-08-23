import { computeEconomySegments } from './economy';
import type { FillUp } from './models';

function monthsBack(n: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return d.toISOString().slice(0, 7);
}

function periodStart(period: '3m' | '6m' | '12m' | 'all'): string | null {
  if (period === 'all') {
    return null;
  }
  const months = period === '3m' ? 3 : period === '6m' ? 6 : 12;
  return monthsBack(months);
}

function inPeriod(f: FillUp, start: string | null): boolean {
  if (!start) {
    return true;
  }
  return f.date.slice(0, 7) >= start.slice(0, 7);
}

/** Rolling cost/km per fill-up segment (tank-full pairs). */
export function costPerKmTrend(
  fills: readonly FillUp[],
  period: '3m' | '6m' | '12m' | 'all',
): number[] {
  const start = periodStart(period);
  const sorted = [...fills]
    .filter((f) => inPeriod(f, start))
    .sort((a, b) => a.odometer - b.odometer);
  const out: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]!;
    const cur = sorted[i]!;
    if (!cur.tankFull || !prev.tankFull) {
      continue;
    }
    const dist = cur.odometer - prev.odometer;
    if (dist <= 0) {
      continue;
    }
    out.push(Math.round((cur.cost / dist) * 100) / 100);
  }
  return out;
}

export function spendByMonth(
  fills: readonly FillUp[],
  period: '3m' | '6m' | '12m' | 'all',
): number[] {
  const start = periodStart(period);
  const map = new Map<string, number>();
  for (const f of fills) {
    if (!inPeriod(f, start)) {
      continue;
    }
    const key = f.date.slice(0, 7);
    map.set(key, (map.get(key) ?? 0) + f.cost);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, v]) => Math.round(v));
}

/** L/100 km per full-tank segment in period order. */
export function economyTrend(
  fills: readonly FillUp[],
  period: '3m' | '6m' | '12m' | 'all',
): number[] {
  const start = periodStart(period);
  const filtered = fills.filter((f) => inPeriod(f, start));
  return computeEconomySegments(filtered).map(
    (s) => Math.round(s.litersPer100Km * 10) / 10,
  );
}
