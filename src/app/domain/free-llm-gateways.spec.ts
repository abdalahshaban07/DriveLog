import { describe, expect, it } from 'vitest';
import {
  ASSISTANT_MAX_TOKENS,
  ASSISTANT_THINKING_MAX_TOKENS,
  FREE_LLM_GATEWAYS,
  REPLY_CACHE_TTL_MS,
  clearCooldown,
  cooldownLeftSec,
  readAssistantRemoteDown,
  readCachedEntry,
  readCachedReply,
  setCooldown,
  writeAssistantRemoteDown,
  writeCachedReply,
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
  it('lists Pollinations, then ch.at, then flm, all keyless', () => {
    expect(FREE_LLM_GATEWAYS.map((g) => g.id)).toEqual(['pollinations', 'chat', 'flm']);
    expect(FREE_LLM_GATEWAYS.map((g) => g.baseUrl)).toEqual([
      'https://text.pollinations.ai/openai',
      'https://ch.at/v1',
      'https://flm.stonech.at/v1',
    ]);
    expect(FREE_LLM_GATEWAYS.every((g) => g.apiKey === undefined)).toBe(true);
    expect(FREE_LLM_GATEWAYS.filter((g) => g.reasoningHint).map((g) => g.id)).toEqual([
      'pollinations',
    ]);
    expect(ASSISTANT_MAX_TOKENS).toBe(220);
    expect(ASSISTANT_THINKING_MAX_TOKENS).toBeGreaterThan(ASSISTANT_MAX_TOKENS);
  });

  it('tracks a per-provider cooldown that expires and clears', () => {
    const storage = fakeStorage();
    expect(cooldownLeftSec(storage, 'chat', 1000)).toBe(0);
    setCooldown(storage, 'chat', 45, 1000);
    expect(cooldownLeftSec(storage, 'chat', 1000)).toBe(45);
    expect(cooldownLeftSec(storage, 'chat', 31_000)).toBe(15);
    expect(cooldownLeftSec(storage, 'chat', 46_000)).toBe(0);
    expect(cooldownLeftSec(storage, 'flm', 1000)).toBe(0);
    clearCooldown(storage, 'chat');
    expect(cooldownLeftSec(storage, 'chat', 1000)).toBe(0);
    expect(cooldownLeftSec(null, 'chat')).toBe(0);
  });

  it('remembers which provider wrote a cached answer', () => {
    const storage = fakeStorage();
    writeCachedReply(storage, 'k', 'hello', 1000, 'flm');
    expect(readCachedEntry(storage, 'k', 2000)).toEqual({ text: 'hello', provider: 'flm' });
    expect(readCachedReply(storage, 'k', 2000)).toBe('hello');
    expect(readCachedEntry(storage, 'k', 1000 + REPLY_CACHE_TTL_MS + 1)).toBeNull();
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
