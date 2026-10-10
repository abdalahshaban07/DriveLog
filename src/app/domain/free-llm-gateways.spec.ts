import { describe, expect, it } from 'vitest';
import {
  ASSISTANT_MAX_TOKENS,
  ASSISTANT_THINKING_MAX_TOKENS,
  FREE_LLM_GATEWAYS,
  UNOROUTER_ATTEMPTS,
  UNOROUTER_BASE_URL,
  UNOROUTER_FREE_MODELS,
  bumpUnorouterCursor,
  readUnorouterCursor,
  unorouterGateways,
  unorouterModelsFrom,
} from './free-llm-gateways';

describe('free-llm-gateways', () => {
  it('tries LLM7 before Kilo and caps the reply length', () => {
    expect(FREE_LLM_GATEWAYS.map((g) => g.id)).toEqual(['llm7-glm', 'llm7-mistral', 'kilo-auto']);
    expect(FREE_LLM_GATEWAYS.map((g) => g.model)).toEqual([
      'GLM-5.3-Flash',
      'mistral-Nemo-Instruct-2407',
      'kilo-auto/free',
    ]);
    expect(FREE_LLM_GATEWAYS[0]!.baseUrl).toContain('llm7.io');
    expect(FREE_LLM_GATEWAYS[2]!.baseUrl).toContain('kilo.ai');
    expect(ASSISTANT_MAX_TOKENS).toBe(220);
    expect(ASSISTANT_THINKING_MAX_TOKENS).toBeGreaterThan(ASSISTANT_MAX_TOKENS);
  });

  it('rotates a ring of :free models and remembers the cursor', () => {
    expect(UNOROUTER_FREE_MODELS.every((m) => m.endsWith(':free'))).toBe(true);
    expect(unorouterModelsFrom(0)).toEqual(UNOROUTER_FREE_MODELS.slice(0, UNOROUTER_ATTEMPTS));
    const wrapped = unorouterModelsFrom(UNOROUTER_FREE_MODELS.length - 1);
    expect(wrapped[0]).toBe(UNOROUTER_FREE_MODELS.at(-1));
    expect(wrapped[1]).toBe(UNOROUTER_FREE_MODELS[0]);
    expect(unorouterGateways(0)[0]).toMatchObject({
      baseUrl: UNOROUTER_BASE_URL,
      model: UNOROUTER_FREE_MODELS[0],
    });

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
    expect(readUnorouterCursor(storage)).toBe(0);
    bumpUnorouterCursor(storage, 2);
    expect(readUnorouterCursor(storage)).toBe(2);
    expect(unorouterModelsFrom(readUnorouterCursor(storage))[0]).toBe(UNOROUTER_FREE_MODELS[2]);
  });
});
