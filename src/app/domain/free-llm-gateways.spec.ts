import { describe, expect, it } from 'vitest';
import {
  ASSISTANT_MAX_TOKENS,
  ASSISTANT_THINKING_MAX_TOKENS,
  FREE_LLM_GATEWAYS,
  bumpFreeLlmCursor,
  freeGatewaysFrom,
  readAssistantRemoteDown,
  readFreeLlmCursor,
  writeAssistantRemoteDown,
} from './free-llm-gateways';

function fakeStorage(): Storage {
  const store = new Map<string, string>();
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      store.set(k, v);
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
    clear: () => store.clear(),
    key: () => null,
    length: 0,
  } as Storage;
}

describe('free-llm-gateways', () => {
  it('rotates every keyless gateway from the cursor', () => {
    expect(FREE_LLM_GATEWAYS.map((g) => g.id)).toEqual(['pollinations']);
    expect(FREE_LLM_GATEWAYS.map((g) => g.model)).toEqual(['openai-fast']);
    expect(freeGatewaysFrom(0).map((g) => g.id)).toEqual(['pollinations']);
    expect(freeGatewaysFrom(1).map((g) => g.id)).toEqual(['pollinations']);
    expect(FREE_LLM_GATEWAYS.every((g) => g.apiKey === undefined)).toBe(true);
    expect(ASSISTANT_MAX_TOKENS).toBe(220);
    expect(ASSISTANT_THINKING_MAX_TOKENS).toBeGreaterThan(ASSISTANT_MAX_TOKENS);

    const storage = fakeStorage();
    expect(readFreeLlmCursor(storage)).toBe(0);
    bumpFreeLlmCursor(storage);
    expect(readFreeLlmCursor(storage)).toBe(1);
    expect(freeGatewaysFrom(readFreeLlmCursor(storage))[0]!.id).toBe('pollinations');
  });

  it('keeps the remote-down flag sticky until a good reply clears it', () => {
    const storage = fakeStorage();
    expect(readAssistantRemoteDown(storage)).toBe(false);
    writeAssistantRemoteDown(storage, true);
    expect(readAssistantRemoteDown(storage)).toBe(true);
    writeAssistantRemoteDown(storage, true);
    expect(readAssistantRemoteDown(storage)).toBe(true);
    writeAssistantRemoteDown(storage, false);
    expect(readAssistantRemoteDown(storage)).toBe(false);
    expect(readAssistantRemoteDown(null)).toBe(false);
  });
});
