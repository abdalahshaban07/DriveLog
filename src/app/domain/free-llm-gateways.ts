/**
 * Keyless chat gateways for the online assistant. No shared app key: each
 * provider rate-limits per visitor IP, so one install cannot burn a global
 * cap and there is no key to leak or get revoked. A question walks the list
 * from the saved cursor and stops at the first usable reply.
 *
 * ponytail: providers picked 2026-11-27 from live probes (stillworks hourly
 * checks plus direct Arabic calls): Pollinations 168/168, CORS-open, fluent
 * Arabic. Kilo (api.kilo.ai) answers curl with fluent Arabic but sends no
 * CORS headers, so browser fetches always fail; OVH gpt-oss-20b returns
 * garbled Arabic. Both dropped the same day. Pollinations is the only
 * keyless CORS-open provider found - the 45s per-IP anonymous cooldown is
 * surfaced to the user as a busy message instead of a silent fallback.
 * Swap an entry when a provider dies or starts asking for a key.
 *
 * Pollinations' anonymous tier refuses a second question within 45s with
 * HTTP 402 (not 429) plus a Retry-After header, so a quota answer is handled
 * as "busy, wait N seconds" - never as an outage.
 */

export type FreeLlmGateway = {
  readonly id: string;
  /** Shown under the answer so the user knows who replied. */
  readonly label: string;
  readonly baseUrl: string;
  readonly model: string;
  /** Keyless today; kept for a future keyed provider. Sent only to its own host. */
  readonly apiKey?: string;
  /** Only Pollinations understands the low-effort reasoning hint; others get a plain request. */
  readonly reasoningHint: boolean;
  /** Quota refusal without a Retry-After header: how long to leave this provider alone. */
  readonly defaultCooldownSec: number;
};

/**
 * Fallback order: Pollinations (best Arabic), then ch.at, then flm. A quota
 * refusal moves straight to the next provider instead of making the user wait.
 * ch.at and flm are community services with no SLA; flm allows 60 requests a
 * minute and 20k a day per IP and may add a reasoning field, which we never read.
 */
export const FREE_LLM_GATEWAYS: readonly FreeLlmGateway[] = [
  {
    id: 'pollinations',
    label: 'Pollinations',
    baseUrl: 'https://text.pollinations.ai/openai',
    model: 'openai-fast',
    reasoningHint: true,
    defaultCooldownSec: 45,
  },
  {
    id: 'chat',
    label: 'ch.at',
    baseUrl: 'https://ch.at/v1',
    model: 'gpt-4o',
    reasoningHint: false,
    defaultCooldownSec: 60,
  },
  {
    id: 'flm',
    label: 'flm',
    baseUrl: 'https://flm.stonech.at/v1',
    model: 'gpt-4o',
    reasoningHint: false,
    defaultCooldownSec: 60,
  },
] as const;

const COOLDOWN_KEY = 'drivelog.free-llm.cooldowns.v1';
/** A provider that errored or timed out rests briefly before we try it again. */
export const OUTAGE_COOLDOWN_SEC = 120;

type Cooldowns = Record<string, number>;

function readCooldowns(storage: Storage | null): Cooldowns {
  if (!storage) return {};
  try {
    const parsed = JSON.parse(storage.getItem(COOLDOWN_KEY) ?? '{}') as unknown;
    return parsed && typeof parsed === 'object' ? (parsed as Cooldowns) : {};
  } catch {
    return {};
  }
}

/** Seconds left on a provider's cooldown, 0 when it is free to ask. */
export function cooldownLeftSec(storage: Storage | null, id: string, now = Date.now()): number {
  const until = Number(readCooldowns(storage)[id]);
  if (!Number.isFinite(until)) return 0;
  return Math.max(0, Math.ceil((until - now) / 1000));
}

export function setCooldown(
  storage: Storage | null,
  id: string,
  seconds: number,
  now = Date.now(),
): void {
  if (!storage) return;
  try {
    const next: Cooldowns = {};
    for (const [key, until] of Object.entries(readCooldowns(storage))) {
      if (Number(until) > now) next[key] = Number(until);
    }
    next[id] = now + Math.max(1, seconds) * 1000;
    storage.setItem(COOLDOWN_KEY, JSON.stringify(next));
  } catch {
    // private mode / quota
  }
}

export function clearCooldown(storage: Storage | null, id: string): void {
  if (!storage) return;
  try {
    const next = readCooldowns(storage);
    delete next[id];
    storage.setItem(COOLDOWN_KEY, JSON.stringify(next));
  } catch {
    // private mode / quota
  }
}

const REMOTE_DOWN_KEY = 'drivelog.assistant.remote-down';
/** A stored down flag expires: a stale outage must not banner forever. */
const REMOTE_DOWN_TTL_MS = 15 * 60 * 1000;

/**
 * Sticky "online is down" flag: set (with a timestamp) on a failed HTTP
 * attempt, cleared on the next good reply, expired after REMOTE_DOWN_TTL_MS.
 */
export function readAssistantRemoteDown(storage: Storage | null, now = Date.now()): boolean {
  if (!storage) return false;
  try {
    const raw = storage.getItem(REMOTE_DOWN_KEY);
    if (raw === null) return false;
    const at = Number(raw);
    if (!Number.isFinite(at) || now - at > REMOTE_DOWN_TTL_MS) {
      storage.removeItem(REMOTE_DOWN_KEY);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function writeAssistantRemoteDown(
  storage: Storage | null,
  down: boolean,
  now = Date.now(),
): void {
  if (!storage) return;
  try {
    if (down) {
      storage.setItem(REMOTE_DOWN_KEY, String(now));
    } else {
      storage.removeItem(REMOTE_DOWN_KEY);
    }
  } catch {
    // private mode / quota
  }
}

/** 402 = payment/quota required (Pollinations free tier), 429 = rate limited. */
export const QUOTA_HTTP_STATUSES: readonly number[] = [402, 429];

const REPLY_CACHE_KEY = 'drivelog.assistant.replies.v1';
/** A repeated question with unchanged car data gets the same answer, free. */
export const REPLY_CACHE_TTL_MS = 60 * 60 * 1000;
const REPLY_CACHE_MAX = 8;

type CachedReply = {
  readonly k: string;
  readonly t: number;
  readonly text: string;
  /** Gateway id that wrote the answer, shown under it on a cache hit too. */
  readonly p?: string;
};

/** Stable key for one exact prompt, so changed car data never reuses an answer. */
export function replyCacheKey(
  lang: string,
  messages: readonly { readonly role: string; readonly content: string }[],
): string {
  const joined = messages.map((m) => `${m.role}:${m.content}`).join('\n');
  let hash = 5381;
  for (let i = 0; i < joined.length; i++) {
    hash = ((hash << 5) + hash + joined.charCodeAt(i)) | 0;
  }
  return `${lang}:${(hash >>> 0).toString(36)}:${joined.length}`;
}

export function readCachedReply(
  storage: Storage | null,
  key: string,
  now = Date.now(),
): string | null {
  return readCachedEntry(storage, key, now)?.text ?? null;
}

export function readCachedEntry(
  storage: Storage | null,
  key: string,
  now = Date.now(),
): { text: string; provider?: string } | null {
  if (!storage) return null;
  try {
    const list = JSON.parse(storage.getItem(REPLY_CACHE_KEY) ?? '[]') as CachedReply[];
    if (!Array.isArray(list)) return null;
    const hit = list.find(
      (entry) =>
        entry &&
        entry.k === key &&
        typeof entry.text === 'string' &&
        now - entry.t <= REPLY_CACHE_TTL_MS,
    );
    return hit ? { text: hit.text, provider: hit.p } : null;
  } catch {
    return null;
  }
}

export function writeCachedReply(
  storage: Storage | null,
  key: string,
  text: string,
  now = Date.now(),
  provider?: string,
): void {
  if (!storage) return;
  try {
    const raw = storage.getItem(REPLY_CACHE_KEY);
    const parsed = raw ? (JSON.parse(raw) as CachedReply[]) : [];
    const list = Array.isArray(parsed) ? parsed : [];
    const next = [{ k: key, t: now, text, p: provider }, ...list.filter((entry) => entry && entry.k !== key)];
    storage.setItem(REPLY_CACHE_KEY, JSON.stringify(next.slice(0, REPLY_CACHE_MAX)));
  } catch {
    // private mode / quota
  }
}

export const ASSISTANT_MAX_TOKENS = 220;
/** These models think before answering; 220 tokens dies inside the thought. */
export const ASSISTANT_THINKING_MAX_TOKENS = 640;
export const ASSISTANT_HISTORY_LIMIT = 6;
