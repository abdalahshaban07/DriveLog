export type PublicHoliday = { date: string; localName: string };

/** Parse Nager.Date API response. */
export function parsePublicHolidays(raw: unknown): PublicHoliday[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const out: PublicHoliday[] = [];
  for (const row of raw) {
    if (!row || typeof row !== 'object') {
      continue;
    }
    const o = row as Record<string, unknown>;
    const date = o['date'];
    const name = o['localName'] ?? o['name'];
    if (typeof date === 'string' && typeof name === 'string') {
      out.push({ date, localName: name });
    }
  }
  return out;
}

function daysBetween(a: string, b: string): number {
  const ms = new Date(b).getTime() - new Date(a).getTime();
  return Math.round(ms / 86_400_000);
}

/** True when a public holiday falls within [today, today+withinDays]. */
export function holidayWithinDays(
  holidays: readonly PublicHoliday[],
  today: string,
  withinDays: number,
): PublicHoliday | null {
  for (const h of holidays) {
    const d = daysBetween(today, h.date);
    if (d >= 0 && d <= withinDays) {
      return h;
    }
  }
  return null;
}

/**
 * Banner when a calendar due is soon and a holiday falls in the lookahead window.
 * ponytail: calendar dates only; no timezone edge cases.
 */
export function dueHolidayNudge(
  dueDate: string | undefined,
  holidays: readonly PublicHoliday[],
  today: string,
  dueSoonDays = 14,
  holidayLookahead = 7,
): PublicHoliday | null {
  if (!dueDate) {
    return null;
  }
  const untilDue = daysBetween(today, dueDate);
  if (untilDue < 0 || untilDue > dueSoonDays) {
    return null;
  }
  return holidayWithinDays(holidays, today, holidayLookahead);
}
