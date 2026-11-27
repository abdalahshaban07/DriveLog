/**
 * Keyless chat gateways for the online assistant. No shared app key: each
 * provider rate-limits per visitor IP, so one install cannot burn a global
 * cap and there is no key to leak or get revoked. A question walks the list
 * from the saved cursor and stops at the first usable reply.
 *
 * ponytail: providers picked 2026-11-27 from live probes (stillworks hourly
 * checks plus direct calls): Pollinations answered 168/168, OVH ~44%. Swap an
 * entry when a provider dies or starts asking for a key.
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
  {
    id: 'ovh',
    baseUrl: 'https://oai.endpoints.kepler.ai.cloud.ovh.net/v1',
    model: 'gpt-oss-20b',
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

/** Sticky "online is down" flag: set on a failed HTTP attempt, cleared on the next good reply. */
export function readAssistantRemoteDown(storage: Storage | null): boolean {
  if (!storage) return false;
  try {
    return storage.getItem(REMOTE_DOWN_KEY) === '1';
  } catch {
    return false;
  }
}

export function writeAssistantRemoteDown(storage: Storage | null, down: boolean): void {
  if (!storage) return;
  try {
    if (down) {
      storage.setItem(REMOTE_DOWN_KEY, '1');
    } else {
      storage.removeItem(REMOTE_DOWN_KEY);
    }
  } catch {
    // private mode / quota
  }
}

export const ASSISTANT_MAX_TOKENS = 220;
/** These models think before answering; 220 tokens dies inside the thought. */
export const ASSISTANT_THINKING_MAX_TOKENS = 640;
export const ASSISTANT_HISTORY_LIMIT = 6;
