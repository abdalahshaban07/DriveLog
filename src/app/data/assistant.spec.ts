import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FREE_LLM_GATEWAYS } from '../domain/free-llm-gateways';
import {
  ASSISTANT_RATE_DAY,
  ASSISTANT_RATE_HOUR,
} from './assistant-rate-limit';
import { fetchChatReply, type ChatMessage } from './assistant';
import type { Db } from './db';

function mockDb(online = true): Db {
  return {
    settings: () => ({ assistantEnabled: online }),
    car: () => null,
    fillUps: () => [],
    maintenance: () => [],
    breakdowns: () => [],
    otherExpenses: () => [],
    expensePeriods: () => [],
    milestones: () => [],
  } as unknown as Db;
}

function okChat(content: string) {
  return {
    ok: true,
    json: async () => ({ choices: [{ message: { content } }] }),
  };
}

describe('fetchChatReply', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('uses remote when online and gateway succeeds', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okChat('remote-ok'));
    vi.stubGlobal('fetch', fetchMock);

    const reply = await fetchChatReply(
      mockDb(true),
      'How is my fuel?',
      'en',
      (k) => k,
    );

    expect(reply).toEqual({ text: 'remote-ok', source: 'remote' });
    expect(fetchMock).toHaveBeenCalled();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain(FREE_LLM_GATEWAYS[0]!.baseUrl.replace(/\/+$/, ''));
    expect(JSON.parse((init as RequestInit).body as string).model).toBe(
      FREE_LLM_GATEWAYS[0]!.model,
    );
  });

  it('falls through gateways then local when all remote fail', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    vi.stubGlobal('fetch', fetchMock);

    const reply = await fetchChatReply(
      mockDb(true),
      'anything',
      'en',
      (k) => `L:${k}`,
    );

    expect(reply.source).toBe('local');
    expect(fetchMock).toHaveBeenCalledTimes(FREE_LLM_GATEWAYS.length);
    expect(reply.text.startsWith('L:')).toBe(true);
  });

  it('skips remote when online is off', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const reply = await fetchChatReply(
      mockDb(false),
      'fuel',
      'en',
      (k) => k,
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(reply.source).toBe('local');
  });

  it('skips remote when device rate limited', async () => {
    const now = new Date();
    const hourKey = `${now.getUTCFullYear()}-${now.getUTCMonth()}-${now.getUTCDate()}-${now.getUTCHours()}`;
    const dayKey = `${now.getUTCFullYear()}-${now.getUTCMonth()}-${now.getUTCDate()}`;
    localStorage.setItem(
      'drivelog.assistant.rate.v1',
      JSON.stringify({
        hourKey,
        hourCount: ASSISTANT_RATE_HOUR,
        dayKey,
        dayCount: ASSISTANT_RATE_DAY,
      }),
    );
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const reply = await fetchChatReply(mockDb(true), 'fuel', 'en', (k) => k);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(reply.source).toBe('local');
  });

  it('sends at most 6 prior turns plus the new user message', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okChat('ok'));
    vi.stubGlobal('fetch', fetchMock);

    const history: ChatMessage[] = [];
    for (let i = 0; i < 10; i++) {
      history.push({
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `m${i}`,
      });
    }

    await fetchChatReply(mockDb(true), 'newest', 'en', (k) => k, undefined, history);

    const body = JSON.parse(
      (fetchMock.mock.calls[0]![1] as RequestInit).body as string,
    ) as { messages: Array<{ role: string; content: string }> };
    const nonSystem = body.messages.filter((m) => m.role !== 'system');
    // 6 history + 1 newest user
    expect(nonSystem).toHaveLength(7);
    expect(nonSystem.at(-1)).toEqual({ role: 'user', content: 'newest' });
    expect(nonSystem[0]!.content).toBe('m4');
  });
});
