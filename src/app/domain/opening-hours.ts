/**
 * Tiny OSM opening_hours evaluator — 24/7 + simple Mo-Su HH:MM-HH:MM only.
 * Unknown / complex rules → null (hide badge).
 */
const DAY_IDX: Record<string, number> = {
  su: 0,
  mo: 1,
  tu: 2,
  we: 3,
  th: 4,
  fr: 5,
  sa: 6,
};

function parseHm(s: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) {
    return null;
  }
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min) || h > 23 || min > 59) {
    return null;
  }
  return h * 60 + min;
}

function dayInRange(day: number, from: number, to: number): boolean {
  if (from <= to) {
    return day >= from && day <= to;
  }
  // wrap (rare for OSM day ranges)
  return day >= from || day <= to;
}

function minutesOpen(
  startMin: number,
  endMin: number,
  nowMin: number,
): boolean {
  if (startMin === endMin) {
    return true; // treat as 24h window for that day
  }
  if (startMin < endMin) {
    return nowMin >= startMin && nowMin < endMin;
  }
  // overnight e.g. 22:00-06:00
  return nowMin >= startMin || nowMin < endMin;
}

/** Returns true/false when rule is understood; null when unknown. */
export function isOpenNow(
  openingHours: string | undefined | null,
  now: Date = new Date(),
): boolean | null {
  if (openingHours == null) {
    return null;
  }
  const raw = openingHours.trim();
  if (!raw) {
    return null;
  }
  const lower = raw.toLowerCase().replace(/;+\s*$/, '');
  if (lower === '24/7' || lower === 'open 24/7') {
    return true;
  }

  // Single simple rule: Mo-Su 08:00-22:00 (optional spaces)
  const m =
    /^(mo|tu|we|th|fr|sa|su)\s*-\s*(mo|tu|we|th|fr|sa|su)\s+(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})$/i.exec(
      lower,
    );
  if (!m) {
    return null;
  }
  const from = DAY_IDX[m[1]!.toLowerCase()];
  const to = DAY_IDX[m[2]!.toLowerCase()];
  const startMin = parseHm(m[3]!);
  const endMin = parseHm(m[4]!);
  if (from == null || to == null || startMin == null || endMin == null) {
    return null;
  }
  const jsDay = now.getDay(); // 0=Sun … 6=Sat — matches DAY_IDX
  if (!dayInRange(jsDay, from, to)) {
    return false;
  }
  const nowMin = now.getHours() * 60 + now.getMinutes();
  return minutesOpen(startMin, endMin, nowMin);
}
