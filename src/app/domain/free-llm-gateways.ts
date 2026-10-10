/**
 * Keyless OpenAI-compatible free gateways (ordered: try first → last).
 * LLM7 allows browser CORS (`*`). Kilo may not. Chain falls through on
 * CORS / 429 / model unavailable — no Cloudflare Worker proxy.
 */

export type FreeLlmGateway = {
  readonly id: string;
  readonly baseUrl: string;
  readonly model: string;
};

export const FREE_LLM_GATEWAYS: readonly FreeLlmGateway[] = [
  {
    id: 'llm7-glm',
    baseUrl: 'https://api.llm7.io/v1',
    model: 'GLM-5.3-Flash',
  },
  {
    id: 'llm7-mistral',
    baseUrl: 'https://api.llm7.io/v1',
    model: 'mistral-Nemo-Instruct-2407',
  },
  {
    id: 'kilo-auto',
    baseUrl: 'https://api.kilo.ai/api/gateway',
    model: 'kilo-auto/free',
  },
] as const;

/** OpenAI-compatible. Free models are the names ending in `:free` and cost $0. */
export const UNOROUTER_BASE_URL = 'https://api.unorouter.com/v1';

/**
 * Text models with ~100% uptime and high success on 2026-10-10.
 * ponytail: static snapshot, 3 tries per question. Refresh from
 * https://api.unorouter.com/api/pricing/catalog when success rates rot.
 * UnoRouter allows 1 success per minute per model; the cursor spreads calls.
 */
export const UNOROUTER_FREE_MODELS = [
  'nemotron-3-super-120b-a12b:free',
  'k2-horizon:free',
  'mistral-7b-instruct:free',
  'nemotron-3.5-lightning:free',
  'qwen3:free',
  'minimax-m2.7:free',
  'llama-3.2-11b-vision:free',
  'gpt-4o:free',
] as const;

export const UNOROUTER_ATTEMPTS = 3;

const UNOROUTER_CURSOR_KEY = 'drivelog.unorouter.cursor';

export function readUnorouterCursor(storage: Storage | null): number {
  if (!storage) return 0;
  const n = Number(storage.getItem(UNOROUTER_CURSOR_KEY));
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
}

export function bumpUnorouterCursor(storage: Storage | null, by: number): void {
  if (!storage || by <= 0) return;
  try {
    storage.setItem(UNOROUTER_CURSOR_KEY, String(readUnorouterCursor(storage) + by));
  } catch {
    // private mode / quota
  }
}

/** Next `UNOROUTER_ATTEMPTS` models, wrapping the ring from `start`. */
export function unorouterModelsFrom(start: number): readonly string[] {
  const n = UNOROUTER_FREE_MODELS.length;
  const i = ((Math.floor(start) % n) + n) % n;
  const out: string[] = [];
  for (let k = 0; k < UNOROUTER_ATTEMPTS; k++) {
    out.push(UNOROUTER_FREE_MODELS[(i + k) % n]!);
  }
  return out;
}

export function unorouterGateways(start: number): readonly FreeLlmGateway[] {
  return unorouterModelsFrom(start).map((model) => ({
    id: `unorouter-${model}`,
    baseUrl: UNOROUTER_BASE_URL,
    model,
  }));
}

export const ASSISTANT_MAX_TOKENS = 220;
/** GLM-5.3 thinks before answering; 220 tokens dies inside the thought. */
export const ASSISTANT_THINKING_MAX_TOKENS = 640;
export const ASSISTANT_HISTORY_LIMIT = 6;
