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
  readonly baseUrl: string;
  readonly model: string;
  /** Keyless today; kept for a future keyed provider. Sent only to its own host. */
  readonly apiKey?: string;
};

export const FREE_LLM_GATEWAYS: readonly FreeLlmGateway[] = [
  {
    id: 'pollinations',
    baseUrl: 'https://text.pollinations.ai/openai',
    model: 'openai-fast',
  },
] as const;

const CURSOR_KEY = 'drivelog.free-llm.cursor';

export function readFreeLlmCursor(storage: Storage | null): number {
  if (!storage) return 0;
  const n = Number(storage.getItem(CURSOR_KEY));
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
}

export function bumpFreeLlmCursor(storage: Storage | null): void {
  if (!storage) return;
  try {
    storage.setItem(CURSOR_KEY, String(readFreeLlmCursor(storage) + 1));
  } catch {
    // private mode / quota
  }
}

/** Every model, starting at `start` and wrapping. A dead host is skipped by the caller. */
export function freeGatewaysFrom(start: number): readonly FreeLlmGateway[] {
  const n = FREE_LLM_GATEWAYS.length;
  if (n === 0) return [];
  const i = ((Math.floor(start) % n) + n) % n;
  return [...FREE_LLM_GATEWAYS.slice(i), ...FREE_LLM_GATEWAYS.slice(0, i)];
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

type CachedReply = { readonly k: string; readonly t: number; readonly text: string };

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
    return hit ? hit.text : null;
  } catch {
    return null;
  }
}

export function writeCachedReply(
  storage: Storage | null,
  key: string,
  text: string,
  now = Date.now(),
): void {
  if (!storage) return;
  try {
    const raw = storage.getItem(REPLY_CACHE_KEY);
    const parsed = raw ? (JSON.parse(raw) as CachedReply[]) : [];
    const list = Array.isArray(parsed) ? parsed : [];
    const next = [{ k: key, t: now, text }, ...list.filter((entry) => entry && entry.k !== key)];
    storage.setItem(REPLY_CACHE_KEY, JSON.stringify(next.slice(0, REPLY_CACHE_MAX)));
  } catch {
    // private mode / quota
  }
}

export const ASSISTANT_MAX_TOKENS = 220;
/** These models think before answering; 220 tokens dies inside the thought. */
export const ASSISTANT_THINKING_MAX_TOKENS = 640;
export const ASSISTANT_HISTORY_LIMIT = 6;
