import { describe, expect, it } from 'vitest';
import {
  ASSISTANT_MAX_TOKENS,
  ASSISTANT_THINKING_MAX_TOKENS,
  FREE_LLM_GATEWAYS,
  bumpFreeLlmCursor,
  freeGatewaysFrom,
  readFreeLlmCursor,
} from './free-llm-gateways';

describe('free-llm-gateways', () => {
  it('rotates keyless LLM7 models and keeps Kilo last', () => {
    expect(FREE_LLM_GATEWAYS.map((g) => g.id)).toEqual([
      'llm7-glm',
      'llm7-mistral',
      'llm7-gpt-oss',
      'llm7-nemotron',
      'kilo-auto',
    ]);
    expect(FREE_LLM_GATEWAYS.map((g) => g.model)).toEqual([
      'GLM-5.3-Flash',
      'mistral-Nemo-Instruct-2407',
      'gpt-oss:20b',
      'nemotron-3-nano:30b',
      'kilo-auto/free',
    ]);
    expect(freeGatewaysFrom(0).map((g) => g.id)).toEqual([
      'llm7-glm',
      'llm7-mistral',
      'kilo-auto',
    ]);
    expect(freeGatewaysFrom(3).map((g) => g.id)).toEqual([
      'llm7-nemotron',
      'llm7-glm',
      'kilo-auto',
    ]);
    expect(FREE_LLM_GATEWAYS[0]!.baseUrl).toContain('llm7.io');
    expect(FREE_LLM_GATEWAYS.at(-1)!.baseUrl).toContain('kilo.ai');
    expect(ASSISTANT_MAX_TOKENS).toBe(220);
    expect(ASSISTANT_THINKING_MAX_TOKENS).toBeGreaterThan(ASSISTANT_MAX_TOKENS);

    const store = new Map<string, string>();
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
      removeItem: () => undefined,
      clear: () => store.clear(),
      key: () => null,
      length: 0,
    } as Storage;
    expect(readFreeLlmCursor(storage)).toBe(0);
    bumpFreeLlmCursor(storage);
    expect(readFreeLlmCursor(storage)).toBe(1);
    expect(freeGatewaysFrom(readFreeLlmCursor(storage))[0]!.id).toBe('llm7-mistral');
  });
});
