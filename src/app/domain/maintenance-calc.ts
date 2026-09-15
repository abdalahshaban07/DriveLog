import { DEFAULT_SOON_THRESHOLD } from '../core/config';
import type { Confidence, DateOnly, HealthStatus, HealthSource } from './models';

export type IntervalDimension = {
  remaining: number;
  interval: number;
  dueAt: number;
  source: HealthSource;
};

export type IntervalStatusResult = {
  status: HealthStatus;
  remainingKm?: number;
  remainingMonths?: number;
  dueKm?: number;
  dueDate?: DateOnly;
  sources: HealthSource[];
  primarySource: HealthSource;
};

function remainingRatio(remaining: number, interval: number): number {
  if (!(interval > 0)) return 1;
  return Math.max(0, remaining) / interval;
}

function statusForDimension(
  remaining: number,
  interval: number,
  soonRatio: number,
): HealthStatus {
  if (!(interval > 0)) return 'unknown';
  if (remaining < 0) return 'overdue';
  if (remaining === 0) return 'due';
  if (remainingRatio(remaining, interval) <= soonRatio) return 'soon';
  return 'good';
}

const RANK: Record<HealthStatus, number> = {
  critical: 0,
  overdue: 1,
  due: 2,
  inspect: 3,
  soon: 4,
  good: 5,
  unknown: 6,
};

export function worseStatus(a: HealthStatus, b: HealthStatus): HealthStatus {
  return RANK[a] <= RANK[b] ? a : b;
}

/** Add calendar months to YYYY-MM-DD (79A). */
export function addMonths(date: DateOnly, months: number): DateOnly {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const dt = new Date(Date.UTC(y, m - 1 + months, d));
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

export function monthsBetween(from: DateOnly, to: DateOnly): number {
  const [y1, m1] = from.split('-').map(Number);
  const [y2, m2] = to.split('-').map(Number);
  return (y2! - y1!) * 12 + (m2! - m1!);
}

/**
 * Dual-dimension SOON if either ≤ soon threshold (89A).
 * DUE at exact limit; OVERDUE beyond (80A).
 */
export function calcIntervalStatus(input: {
  currentOdometer: number;
  today: DateOnly;
  km?: { lastKm: number; intervalKm: number; source: HealthSource };
  months?: { lastDate: DateOnly; intervalMonths: number; source: HealthSource };
  soonRatio?: number;
}): IntervalStatusResult {
  const soon = input.soonRatio ?? DEFAULT_SOON_THRESHOLD;
  const sources: HealthSource[] = [];
  let status: HealthStatus = 'unknown';
  let remainingKm: number | undefined;
  let remainingMonths: number | undefined;
  let dueKm: number | undefined;
  let dueDate: DateOnly | undefined;
  let primarySource: HealthSource = 'UNKNOWN';

  if (input.km && input.km.intervalKm > 0) {
    dueKm = input.km.lastKm + input.km.intervalKm;
    remainingKm = dueKm - input.currentOdometer;
    const s = statusForDimension(remainingKm, input.km.intervalKm, soon);
    status = worseStatus(status === 'unknown' ? s : status, s);
    if (status === s || RANK[s] < RANK[status]) {
      primarySource = input.km.source;
    }
    sources.push(input.km.source);
    // Fix primary when first dimension
    if (sources.length === 1) primarySource = input.km.source;
  }

  if (input.months && input.months.intervalMonths > 0) {
    dueDate = addMonths(input.months.lastDate, input.months.intervalMonths);
    remainingMonths =
      monthsBetween(input.today, dueDate) -
      (input.today > dueDate ? monthsBetween(dueDate, input.today) * 2 : 0);
    // clearer: days-ish via month count from last+interval vs today
    const elapsed = monthsBetween(input.months.lastDate, input.today);
    remainingMonths = input.months.intervalMonths - elapsed;
    const s = statusForDimension(remainingMonths, input.months.intervalMonths, soon);
    if (status === 'unknown') {
      status = s;
      primarySource = input.months.source;
    } else {
      // SOON if either (89A): if either is soon/due/overdue, promote
      status = worseStatus(status, s);
      if (RANK[s] <= RANK[status]) primarySource = input.months.source;
    }
    sources.push(input.months.source);
  }

  // When both good and one soon — worseStatus handles it.
  return {
    status,
    remainingKm,
    remainingMonths,
    dueKm,
    dueDate,
    sources: [...new Set(sources)],
    primarySource,
  };
}

export function confidenceFromGaps(
  gaps: readonly number[],
  consistencyRatio: number,
): { confidence: Confidence; gapsUsed: number[]; excluded: number[] } {
  const positive = gaps.filter((g) => g > 0 && Number.isFinite(g));
  if (positive.length === 0) {
    return { confidence: 'low', gapsUsed: [], excluded: [] };
  }
  let used = [...positive];
  const excluded: number[] = [];
  if (used.length >= 4) {
    const med = median(used);
    const deviations = used.map((g) => Math.abs(g - med));
    const mad = median(deviations);
    if (mad > 0) {
      const next: number[] = [];
      for (const g of used) {
        const mz = (0.6745 * (g - med)) / mad;
        if (Math.abs(mz) > 3.5) {
          excluded.push(g);
        } else {
          next.push(g);
        }
      }
      if (next.length >= 1) used = next;
    }
  }
  if (used.length === 1) return { confidence: 'low', gapsUsed: used, excluded };
  if (used.length === 2) return { confidence: 'medium', gapsUsed: used, excluded };
  const med = median(used);
  if (!(med > 0) || !Number.isFinite(med)) {
    return { confidence: 'medium', gapsUsed: used, excluded };
  }
  const consistency = (Math.max(...used) - Math.min(...used)) / med;
  if (consistency <= consistencyRatio) {
    return { confidence: 'high', gapsUsed: used, excluded };
  }
  return { confidence: 'medium', gapsUsed: used, excluded };
}

export function median(values: readonly number[]): number {
  if (!values.length) return NaN;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1]! + s[mid]!) / 2 : s[mid]!;
}

/** Half-up to 2 significant digits (63A). */
export function round2Sig(n: number): number {
  if (!(n > 0) || !Number.isFinite(n)) return n;
  const exp = Math.floor(Math.log10(n));
  const factor = Math.pow(10, exp - 1);
  return Math.round(n / factor + Number.EPSILON) * factor;
}

/** Round upward to reserve ladder (54A). */
export function roundReserveLadder(n: number): number {
  if (!(n > 0) || !Number.isFinite(n)) return n;
  const exp = Math.floor(Math.log10(n));
  const base = Math.pow(10, exp);
  const ladder = [1, 1.5, 2, 2.5, 3, 3.5, 4, 5, 7.5, 10];
  for (const step of ladder) {
    const candidate = step * base;
    if (candidate >= n - 1e-9) return candidate;
  }
  return 10 * base;
}

export function roundKm500(n: number): number {
  return Math.round(n / 500) * 500;
}
