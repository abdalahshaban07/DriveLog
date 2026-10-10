/**
 * Keyless OpenAI-compatible free gateways. No API key.
 * LLM7 allows browser CORS (`*`). Kilo may not. Chain falls through on
 * CORS / 429 / model unavailable — no Cloudflare Worker proxy.
 *
 * ponytail: static list of models that answered with no Authorization on
 * 2026-10-10. One question starts at the next LLM7 model so a shared
 * per-model cap does not stall the coach. Kilo stays last as the other host.
 */

export type FreeLlmGateway = {
  readonly id: string;
  readonly baseUrl: string;
  readonly model: string;
};

const LLM7 = 'https://api.llm7.io/v1';

export const FREE_LLM_GATEWAYS: readonly FreeLlmGateway[] = [
  {
    id: 'llm7-glm',
    baseUrl: LLM7,
    model: 'GLM-5.3-Flash',
  },
  {
    id: 'llm7-mistral',
    baseUrl: LLM7,
    model: 'mistral-Nemo-Instruct-2407',
  },
  {
    id: 'llm7-gpt-oss',
    baseUrl: LLM7,
    model: 'gpt-oss:20b',
  },
  {
    id: 'llm7-nemotron',
    baseUrl: LLM7,
    model: 'nemotron-3-nano:30b',
  },
  {
    id: 'kilo-auto',
    baseUrl: 'https://api.kilo.ai/api/gateway',
    model: 'kilo-auto/free',
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

/** Two LLM7 models from `start`, then Kilo. A dead host is skipped by the caller. */
export function freeGatewaysFrom(start: number): readonly FreeLlmGateway[] {
  const llm7 = FREE_LLM_GATEWAYS.filter((g) => g.baseUrl === LLM7);
  const kilo = FREE_LLM_GATEWAYS.find((g) => g.id === 'kilo-auto');
  const n = llm7.length;
  const i = ((Math.floor(start) % n) + n) % n;
  const picked = [llm7[i]!, llm7[(i + 1) % n]!];
  return kilo ? [...picked, kilo] : picked;
}

export const ASSISTANT_MAX_TOKENS = 220;
/** GLM-5.3 thinks before answering; 220 tokens dies inside the thought. */
export const ASSISTANT_THINKING_MAX_TOKENS = 640;
export const ASSISTANT_HISTORY_LIMIT = 6;
