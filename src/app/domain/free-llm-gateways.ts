/**
 * Keyless OpenAI-compatible free gateways (ordered: try first → last).
 * Kilo may lack browser CORS; LLM7 allows `*`. Chain falls through on
 * CORS / 429 / model unavailable — no Cloudflare Worker proxy.
 */

export type FreeLlmGateway = {
  readonly id: string;
  readonly baseUrl: string;
  readonly model: string;
};

export const FREE_LLM_GATEWAYS: readonly FreeLlmGateway[] = [
  {
    id: 'kilo-auto',
    baseUrl: 'https://api.kilo.ai/api/gateway',
    model: 'kilo-auto/free',
  },
  {
    id: 'kilo-lfm',
    baseUrl: 'https://api.kilo.ai/api/gateway',
    model: 'liquid/lfm-2.5-2.6b:free',
  },
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
] as const;

export const ASSISTANT_MAX_TOKENS = 512;
export const ASSISTANT_HISTORY_LIMIT = 6;
