/**
 * Background-reminder schedule, shared by the app (builds it) and the GitHub Actions
 * sender (reads it). No imports on purpose: Node runs this file directly.
 */
export interface PushDue {
  /** Stable item id, e.g. "license" or a maintenance id. */
  id: string;
  /** Calendar date YYYY-MM-DD. */
  dueDate: string;
  /** Text shown for the item, already localized by the app. */
  label: string;
}

export interface PushReminder {
  /** Unique per item, stage and due date: sending is recorded by this id. */
  id: string;
  /** First local day it may be sent (YYYY-MM-DD). */
  fireOn: string;
  /** Last local day it is still worth sending. */
  expireOn: string;
  title: string;
  body: string;
}

export const PUSH_SOON_DAYS = 14;
/** A missed overdue reminder is still sent this many days late, then dropped. */
export const PUSH_OVERDUE_GRACE_DAYS = 7;
/** Never flood a phone in one run. */
export const PUSH_MAX_PER_RUN = 3;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function addDaysIso(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const t = Date.UTC(y, m - 1, d) + days * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

/** Today's calendar date in an IANA timezone (falls back to UTC for a bad name). */
export function todayInTimeZone(timeZone: string, now: Date): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

/** Two reminders per dated item: once when it becomes due soon, once when it is overdue. */
export function buildPushReminders(
  dues: readonly PushDue[],
  titles: { soon: string; overdue: string },
): PushReminder[] {
  const out: PushReminder[] = [];
  for (const due of dues) {
    if (!DATE_RE.test(due.dueDate)) {
      continue;
    }
    out.push({
      id: `${due.id}.soon.${due.dueDate}`,
      fireOn: addDaysIso(due.dueDate, -PUSH_SOON_DAYS),
      expireOn: addDaysIso(due.dueDate, -1),
      title: titles.soon,
      body: due.label,
    });
    out.push({
      id: `${due.id}.overdue.${due.dueDate}`,
      fireOn: due.dueDate,
      expireOn: addDaysIso(due.dueDate, PUSH_OVERDUE_GRACE_DAYS),
      title: titles.overdue,
      body: due.label,
    });
  }
  return out;
}

/** Reminders that are inside their window today and were not sent before. */
export function selectToSend(
  reminders: readonly PushReminder[],
  sentIds: ReadonlySet<string>,
  today: string,
): PushReminder[] {
  return reminders
    .filter((r) => r.fireOn <= today && today <= r.expireOn && !sentIds.has(r.id))
    .sort((a, b) => a.fireOn.localeCompare(b.fireOn) || a.id.localeCompare(b.id))
    .slice(0, PUSH_MAX_PER_RUN);
}

/** Keep sent marks only for reminders that still exist, so the list never grows. */
export function pruneSent(sentIds: Iterable<string>, reminders: readonly PushReminder[]): string[] {
  const live = new Set(reminders.map((r) => r.id));
  return [...new Set(sentIds)].filter((id) => live.has(id));
}

export interface PushDevice {
  tz: string;
  reminders: PushReminder[];
  sent: string[];
}

/** Parse the JSON strings a device stored. Anything malformed becomes "nothing to send". */
export function parseDevice(fields: { tz?: string; reminders?: string; sent?: string }): PushDevice {
  const list = (raw: string | undefined): unknown[] => {
    try {
      const v: unknown = JSON.parse(raw ?? '[]');
      return Array.isArray(v) ? v : [];
    } catch {
      return [];
    }
  };
  const reminders = list(fields.reminders).filter(
    (r): r is PushReminder =>
      typeof r === 'object' &&
      r !== null &&
      typeof (r as PushReminder).id === 'string' &&
      DATE_RE.test((r as PushReminder).fireOn) &&
      DATE_RE.test((r as PushReminder).expireOn) &&
      typeof (r as PushReminder).title === 'string' &&
      typeof (r as PushReminder).body === 'string',
  );
  const sent = list(fields.sent).filter((s): s is string => typeof s === 'string');
  return { tz: fields.tz || 'UTC', reminders, sent };
}

/**
 * What to send to one device now. `sentAfter` is the new sent list. A reminder is
 * added to it only when `delivered` says the push really went out, so a failed
 * send is tried again on the next run.
 */
export function planDevice(
  device: PushDevice,
  now: Date,
): { toSend: PushReminder[]; sentAfter: (deliveredIds: ReadonlySet<string>) => string[] } {
  const today = todayInTimeZone(device.tz, now);
  const toSend = selectToSend(device.reminders, new Set(device.sent), today);
  return {
    toSend,
    sentAfter: (deliveredIds) => pruneSent([...device.sent, ...deliveredIds], device.reminders),
  };
}
