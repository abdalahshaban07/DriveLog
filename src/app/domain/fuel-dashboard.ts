import {
  computeEconomySegments,
  computePerFillSegments,
  fuelMonthCompare,
  latestEconomy,
  monthFuelSpend,
  overallLitersPer100Km,
} from './economy';
import type { EconomySegment, FillUp, FuelGrade } from './models';

export interface FuelDashboardMetrics {
  costPerKm: number | null;
  monthSpend: number;
  overallL100: number | null;
  lastL100: number | null;
  overallKmPerL: number | null;
  lastKmPerL: number | null;
}

function filterByGrade(fills: readonly FillUp[], grade: FuelGrade | 'all'): FillUp[] {
  if (grade === 'all') {
    return [...fills];
  }
  return fills.filter((f) => f.fuelGrade === grade);
}

function kmPerL(litersPer100: number | null): number | null {
  if (litersPer100 == null || litersPer100 <= 0) {
    return null;
  }
  return 100 / litersPer100;
}

export function fuelDashboardMetrics(
  fills: readonly FillUp[],
  grade: FuelGrade | 'all' = 'all',
): FuelDashboardMetrics {
  const filtered = filterByGrade(fills, grade);
  const eco = latestEconomy(filtered);
  const overall = overallLitersPer100Km(filtered);
  const last = eco?.litersPer100Km ?? null;
  return {
    costPerKm: eco?.costPerKm ?? null,
    monthSpend: monthFuelSpend(filtered),
    overallL100: overall ?? last,
    lastL100: last,
    overallKmPerL: kmPerL(overall ?? last),
    lastKmPerL: kmPerL(last),
  };
}

export interface FuelBoard {
  monthSpend: number;
  previousSpend: number;
  /** Positive = spent more than last month. Null when both months are empty. */
  deltaPct: number | null;
  monthLiters: number;
  monthCount: number;
  costPerKm: number | null;
  lastL100: number | null;
  /** Distance-weighted average. Null until two segments exist — not a copy of last. */
  overallL100: number | null;
  lastKmPerL: number | null;
  overallKmPerL: number | null;
  /** (last − overall) / overall × 100. Positive = thirstier than usual. */
  economyDeltaPct: number | null;
  /** ponytail: last 8 segments — raise the slice for a longer sparkline. */
  series: number[];
  l100ByFillId: ReadonlyMap<string, number>;
}

export const SPARK_W = 320;
export const SPARK_H = 76;

export interface SparklineGeometry {
  line: string;
  area: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

function segmentsFor(fills: readonly FillUp[]): EconomySegment[] {
  const perFill = computePerFillSegments(fills);
  return perFill.length > 0 ? perFill : computeEconomySegments(fills);
}

function weightedL100(segments: readonly EconomySegment[]): number | null {
  if (segments.length < 2) {
    return null;
  }
  let liters = 0;
  let distance = 0;
  for (const s of segments) {
    liters += (s.litersPer100Km * s.distanceKm) / 100;
    distance += s.distanceKm;
  }
  if (distance <= 0) {
    return null;
  }
  return (liters / distance) * 100;
}

export function fuelBoard(
  fills: readonly FillUp[],
  grade: FuelGrade | 'all' = 'all',
  now: Date = new Date(),
): FuelBoard {
  const filtered = filterByGrade(fills, grade);
  const metrics = fuelDashboardMetrics(filtered);
  const compare = fuelMonthCompare(filtered, now);
  const segments = segmentsFor(filtered);
  const overall = weightedL100(segments);
  const last = metrics.lastL100;
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const prefix = `${y}-${m}`;
  let monthLiters = 0;
  let monthCount = 0;
  for (const f of filtered) {
    if (!f.date.startsWith(prefix)) {
      continue;
    }
    monthLiters += f.liters;
    monthCount += 1;
  }
  return {
    monthSpend: metrics.monthSpend,
    previousSpend: compare?.previous ?? 0,
    deltaPct: compare?.deltaPct ?? null,
    monthLiters,
    monthCount,
    costPerKm: metrics.costPerKm,
    lastL100: last,
    overallL100: overall,
    lastKmPerL: metrics.lastKmPerL,
    overallKmPerL: kmPerL(overall),
    economyDeltaPct:
      last != null && overall != null && overall > 0 ? ((last - overall) / overall) * 100 : null,
    series: segments.slice(-8).map((s) => s.litersPer100Km),
    l100ByFillId: new Map(segments.map((s) => [s.endId, s.litersPer100Km])),
  };
}

/** SVG polyline in a SPARK_W × SPARK_H box. Null until two points exist. */
export function sparklineGeometry(
  values: readonly number[],
  width = SPARK_W,
  height = SPARK_H,
): SparklineGeometry | null {
  if (values.length < 2) {
    return null;
  }
  const padX = 2;
  const padY = 8;
  let min = Infinity;
  let max = -Infinity;
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const span = max - min;
  const plotH = height - padY * 2;
  const coords = values.map((v, i) => {
    const x = padX + (i / (values.length - 1)) * (width - padX * 2);
    const y = span === 0 ? padY + plotH / 2 : padY + (1 - (v - min) / span) * plotH;
    return [x, y] as const;
  });
  const line = coords
    .map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`)
    .join(' ');
  const first = coords[0]!;
  const last = coords[coords.length - 1]!;
  const area = `${line} L${last[0].toFixed(1)} ${height} L${first[0].toFixed(1)} ${height} Z`;
  return { line, area, x: last[0], y: last[1], width, height };
}
