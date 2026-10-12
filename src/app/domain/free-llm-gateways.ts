/**
 * UnoRouter free chat models behind one app key. Each model allows about one
 * request per minute, so a question walks the list from the saved cursor and
 * stops at the first usable reply.
 *
 * ponytail: static list picked 2026-10-12 from the free text catalog (success
 * at least 85%, uptime at least 95%). Swap an id when a model leaves the catalog.
 */

export type FreeLlmGateway = {
  readonly id: string;
  readonly baseUrl: string;
  readonly model: string;
};

const UNOROUTER = 'https://api.unorouter.com/v1';

/** Shared app key. Shipped in the client; every install uses the same minute cap. */
export const FREE_LLM_API_KEY =
  'sk-r4RRw1RTFukrlPHKFieeVgMGbhDezTzMyXmYMqSt5MDbcS9E';

export const FREE_LLM_GATEWAYS: readonly FreeLlmGateway[] = [
  { id: 'k2-horizon', baseUrl: UNOROUTER, model: 'k2-horizon:free' },
  { id: 'typhoon', baseUrl: UNOROUTER, model: 'typhoon-v2.5-30b-a3b-instruct:free' },
  { id: 'nemotron-super', baseUrl: UNOROUTER, model: 'nemotron-3-super-120b-a12b:free' },
  { id: 'gpt-oss-20b', baseUrl: UNOROUTER, model: 'gpt-oss-20b:free' },
  { id: 'nemotron-lightning', baseUrl: UNOROUTER, model: 'nemotron-3.5-lightning-30b-a3b:free' },
  { id: 'apertus', baseUrl: UNOROUTER, model: 'apertus-v1.5-70b:free' },
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

export const ASSISTANT_MAX_TOKENS = 220;
/** These models think before answering; 220 tokens dies inside the thought. */
export const ASSISTANT_THINKING_MAX_TOKENS = 640;
export const ASSISTANT_HISTORY_LIMIT = 6;
