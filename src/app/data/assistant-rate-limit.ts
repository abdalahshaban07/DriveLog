/** Device-side throttle for keyless remote LLM (protects shared free IP quotas). */

export const ASSISTANT_RATE_HOUR = 8;
export const ASSISTANT_RATE_DAY = 40;

const STORAGE_KEY = 'drivelog.assistant.rate.v1';

type RateBucket = {
  hourKey: string;
  hourCount: number;
  dayKey: string;
  dayCount: number;
};

function hourKey(d = new Date()): string {
  return `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}-${d.getUTCHours()}`;
}

function dayKey(d = new Date()): string {
  return `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`;
}

function readBucket(storage: Storage): RateBucket {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) {
      return { hourKey: hourKey(), hourCount: 0, dayKey: dayKey(), dayCount: 0 };
    }
    const o = JSON.parse(raw) as Partial<RateBucket>;
    return {
      hourKey: typeof o.hourKey === 'string' ? o.hourKey : hourKey(),
      hourCount: Number.isFinite(o.hourCount) ? Number(o.hourCount) : 0,
      dayKey: typeof o.dayKey === 'string' ? o.dayKey : dayKey(),
      dayCount: Number.isFinite(o.dayCount) ? Number(o.dayCount) : 0,
    };
  } catch {
    return { hourKey: hourKey(), hourCount: 0, dayKey: dayKey(), dayCount: 0 };
  }
}

function writeBucket(storage: Storage, b: RateBucket): void {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(b));
  } catch {
    // private mode / quota — ignore
  }
}

function normalize(b: RateBucket, now = new Date()): RateBucket {
  const h = hourKey(now);
  const d = dayKey(now);
  return {
    hourKey: h,
    hourCount: b.hourKey === h ? b.hourCount : 0,
    dayKey: d,
    dayCount: b.dayKey === d ? b.dayCount : 0,
  };
}

/** True if another remote call is allowed under device caps. */
export function canRemoteAssistantCall(
  storage: Storage | null = typeof localStorage !== 'undefined' ? localStorage : null,
  now = new Date(),
): boolean {
  if (!storage) return true;
  const b = normalize(readBucket(storage), now);
  return b.hourCount < ASSISTANT_RATE_HOUR && b.dayCount < ASSISTANT_RATE_DAY;
}

/** Record one remote attempt (success or network hit that counted toward quota). */
export function recordRemoteAssistantCall(
  storage: Storage | null = typeof localStorage !== 'undefined' ? localStorage : null,
  now = new Date(),
): void {
  if (!storage) return;
  const b = normalize(readBucket(storage), now);
  b.hourCount += 1;
  b.dayCount += 1;
  writeBucket(storage, b);
}
