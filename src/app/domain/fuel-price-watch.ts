import type { CountryFuelPrices } from '../data/remote';
import {
  WATCHED_GRADES,
  type DateOnly,
  type FillUp,
  type FuelPriceSnapshot,
  type WatchedGrade,
} from './models';

export interface PriceChange {
  grade: WatchedGrade;
  from: number;
  to: number;
  delta: number;
  pct: number;
  /** Day the new level was first observed. */
  day: DateOnly;
  previousDay: DateOnly;
}

export interface LastFillImpact {
  grade: WatchedGrade;
  liters: number;
  amount: number;
  fillDate: DateOnly;
}

/** Change points kept per country — years of quarterly revisions. */
const HISTORY_CAP = 60;
/** Older alerts are stale news; the card stays silent. */
const ALERT_MAX_AGE_DAYS = 45;

/** Boards occasionally carry 0 or negative placeholders; those are not prices. */
function sanePrice(v: number | null): number | null {
  return v != null && Number.isFinite(v) && v > 0 ? v : null;
}

export function boardHasPrices(board: CountryFuelPrices): boolean {
  return WATCHED_GRADES.some((g) => sanePrice(board[g]) != null);
}

export function snapshotFromBoard(
  board: CountryFuelPrices,
  day: DateOnly,
): FuelPriceSnapshot {
  const cc = board.countryCode.toUpperCase();
  return {
    id: `${cc}:${day}`,
    countryCode: cc,
    day,
    currency: board.currency,
    gasoline92: sanePrice(board.gasoline92),
    gasoline95: sanePrice(board.gasoline95),
    diesel: sanePrice(board.diesel),
    solar: sanePrice(board.solar),
  };
}

export function samePrices(a: FuelPriceSnapshot, b: FuelPriceSnapshot): boolean {
  return WATCHED_GRADES.every((g) => a[g] === b[g]);
}

function countryRows(
  history: readonly FuelPriceSnapshot[],
  cc: string,
): FuelPriceSnapshot[] {
  return history
    .filter((h) => h.countryCode === cc)
    .sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
}

/** Upsert today's board; only price changes (and the first level) are kept. */
export function mergeSnapshot(
  history: readonly FuelPriceSnapshot[],
  snap: FuelPriceSnapshot,
  cap = HISTORY_CAP,
): { history: FuelPriceSnapshot[]; changed: boolean } {
  const rows = countryRows(history, snap.countryCode);
  const latest = rows[rows.length - 1];
  if (latest && samePrices(latest, snap)) {
    return { history: [...history], changed: false };
  }
  const others = history.filter((h) => h.countryCode !== snap.countryCode);
  const kept = [...rows.filter((h) => h.id !== snap.id), snap]
    .sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0))
    .slice(-cap);
  return { history: [...others, ...kept], changed: true };
}

function dayAgeDays(day: DateOnly, today: DateOnly): number {
  const a = new Date(`${day}T12:00:00`).getTime();
  const b = new Date(`${today}T12:00:00`).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) {
    return Infinity;
  }
  return Math.round((b - a) / 86_400_000);
}

/** Diff the two latest observed levels; empty until a second level exists. */
export function latestChanges(
  history: readonly FuelPriceSnapshot[],
  countryCode: string,
  today: DateOnly,
  maxAgeDays = ALERT_MAX_AGE_DAYS,
): PriceChange[] {
  const rows = countryRows(history, countryCode.toUpperCase());
  if (rows.length < 2) {
    return [];
  }
  const current = rows[rows.length - 1]!;
  const previous = rows[rows.length - 2]!;
  if (dayAgeDays(current.day, today) > maxAgeDays) {
    return [];
  }
  const changes: PriceChange[] = [];
  for (const grade of WATCHED_GRADES) {
    const from = previous[grade];
    const to = current[grade];
    if (from == null || to == null || from <= 0 || from === to) {
      continue;
    }
    changes.push({
      grade,
      from,
      to,
      delta: Math.round((to - from) * 100) / 100,
      pct: ((to - from) / from) * 100,
      day: current.day,
      previousDay: previous.day,
    });
  }
  return changes;
}

/** Stable dismissal key — a new change event re-shows the card. */
export function changeEventKey(
  countryCode: string,
  changes: readonly PriceChange[],
): string {
  const day = changes[0]?.day ?? '';
  const parts = changes.map((c) => `${c.grade}=${c.to}`).join('|');
  return `${countryCode.toUpperCase()}:${day}:${parts}`;
}

/** Savings story: last fill of a hiked grade, bought before the change. */
export function lastFillImpact(
  changes: readonly PriceChange[],
  fills: readonly FillUp[],
  currency: string,
): LastFillImpact | null {
  const hikes = changes.filter((c) => c.delta > 0);
  if (!hikes.length) {
    return null;
  }
  const byGrade = new Map(hikes.map((c) => [c.grade, c]));
  // Legacy diesel fills match the solar board and vice versa — same fuel grade.
  const alias = (g: WatchedGrade): WatchedGrade =>
    g === 'diesel' ? 'solar' : g === 'solar' ? 'diesel' : g;
  let best: FillUp | null = null;
  let bestChange: PriceChange | null = null;
  for (const f of fills) {
    const change =
      f.fuelGrade && f.fuelGrade !== 'custom'
        ? byGrade.get(f.fuelGrade) ?? byGrade.get(alias(f.fuelGrade))
        : undefined;
    if (!change || (f.currency ?? currency) !== currency || f.date >= change.day) {
      continue;
    }
    if (
      !best ||
      f.date > best.date ||
      (f.date === best.date && f.createdAt > best.createdAt)
    ) {
      best = f;
      bestChange = change;
    }
  }
  if (!best || !bestChange) {
    return null;
  }
  const change = bestChange;
  const amount = Math.round(best.liters * change.delta * 100) / 100;
  if (amount <= 0) {
    return null;
  }
  return { grade: change.grade, liters: best.liters, amount, fillDate: best.date };
}

/** Ordered non-null prices for one grade — feeds the trend sparkline. */
export function gradeTrend(
  history: readonly FuelPriceSnapshot[],
  countryCode: string,
  grade: WatchedGrade,
): number[] {
  return countryRows(history, countryCode.toUpperCase())
    .map((s) => s[grade])
    .filter((v): v is number => v != null && Number.isFinite(v) && v > 0);
}