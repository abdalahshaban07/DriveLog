import { describe, expect, it } from 'vitest';
import {
  ASSISTANT_MAX_TOKENS,
  ASSISTANT_THINKING_MAX_TOKENS,
  FREE_LLM_API_KEY,
  FREE_LLM_GATEWAYS,
  bumpFreeLlmCursor,
  freeGatewaysFrom,
  readFreeLlmCursor,
} from './free-llm-gateways';

describe('free-llm-gateways', () => {
  it('rotates every UnoRouter model from the cursor', () => {
    expect(FREE_LLM_GATEWAYS.map((g) => g.id)).toEqual([
      'k2-horizon',
      'typhoon',
      'nemotron-super',
      'gpt-oss-20b',
      'nemotron-lightning',
      'apertus',
    ]);
    expect(FREE_LLM_GATEWAYS.map((g) => g.model)).toEqual([
      'k2-horizon:free',
      'typhoon-v2.5-30b-a3b-instruct:free',
      'nemotron-3-super-120b-a12b:free',
      'gpt-oss-20b:free',
      'nemotron-3.5-lightning-30b-a3b:free',
      'apertus-v1.5-70b:free',
    ]);
    expect(freeGatewaysFrom(0).map((g) => g.id)).toEqual([
      'k2-horizon',
      'typhoon',
      'nemotron-super',
      'gpt-oss-20b',
      'nemotron-lightning',
      'apertus',
    ]);
    expect(freeGatewaysFrom(4).map((g) => g.id)).toEqual([
      'nemotron-lightning',
      'apertus',
      'k2-horizon',
      'typhoon',
      'nemotron-super',
      'gpt-oss-20b',
    ]);
    expect(FREE_LLM_GATEWAYS.every((g) => g.baseUrl.includes('unorouter.com'))).toBe(true);
    expect(FREE_LLM_API_KEY.startsWith('sk-')).toBe(true);
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
    expect(freeGatewaysFrom(readFreeLlmCursor(storage))[0]!.id).toBe('typhoon');
  });
});
