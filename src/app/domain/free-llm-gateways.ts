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

export const ASSISTANT_MAX_TOKENS = 220;
export const ASSISTANT_HISTORY_LIMIT = 6;
