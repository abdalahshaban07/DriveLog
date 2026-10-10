import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ASSISTANT_THINKING_MAX_TOKENS,
  FREE_LLM_GATEWAYS,
  UNOROUTER_FREE_MODELS,
  readUnorouterCursor,
} from '../domain/free-llm-gateways';
import { ASSISTANT_RATE_DAY, ASSISTANT_RATE_HOUR } from './assistant-rate-limit';
import { fetchChatReply, usableCoachText, type ChatMessage } from './assistant';
import type { Db } from './db';

const RATE_KEY = 'drivelog.assistant.rate.v1';

function hourCount(): number {
  const raw = localStorage.getItem(RATE_KEY);
  if (!raw) return 0;
  const o = JSON.parse(raw) as { hourCount?: number };
  return o.hourCount ?? 0;
}

function mockDb(online = true, car: boolean = true, apiKey?: string): Db {
  return {
    settings: () => ({ assistantEnabled: online, currency: 'EGP', assistantApiKey: apiKey }),
    car: () =>
      car
        ? {
            id: 'c1',
            nickname: 'Test',
            initialOdometer: 0,
            currentOdometer: 12000,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          }
        : null,
    snapshotCurrency: () => 'EGP',
    fillUps: () => [],
    maintenance: () => [],
    breakdowns: () => [],
    otherExpenses: () => [],
    expensePeriods: () => [],
    parts: () => [],
    partOverrides: () => [],
  } as unknown as Db;
}

function okChat(content: string) {
  return {
    ok: true,
    json: async () => ({ choices: [{ message: { content } }] }),
  };
}

function httpStatus(status: number) {
  return {
    ok: false,
    status,
    json: async () => ({ error: { message: `HTTP ${status}` } }),
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

  it('answers الصرف from the local month card and does not call the model', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const reply = await fetchChatReply(mockDb(true), 'الصرف', 'ar', (k) => k);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(reply.source).toBe('local');
    expect(reply.card?.kicker).toBe('assistant.card.month');
    expect(reply.remoteFailed).toBeUndefined();
    expect(hourCount()).toBe(0);
  });

  it('sends a how-to question online instead of the fuel card', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okChat('ظبط ضغط الكاوتش ومتسيّبش العربية تدور.'));
    vi.stubGlobal('fetch', fetchMock);

    const reply = await fetchChatReply(mockDb(true), 'ازاي احسن الاستهلاك', 'ar', (k) => k);

    expect(fetchMock).toHaveBeenCalled();
    expect(reply).toEqual({
      text: 'ظبط ضغط الكاوتش ومتسيّبش العربية تدور.',
      source: 'remote',
    });
  });

  it('keeps a local tip and flags the call when the how-to request fails', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    vi.stubGlobal('fetch', fetchMock);

    const reply = await fetchChatReply(mockDb(true), 'ازاي احسن الاستهلاك', 'ar', (k) => k);

    expect(reply.source).toBe('local');
    expect(reply.card).toBeUndefined();
    expect(reply.remoteFailed).toBe(true);
    expect(reply.text).toContain('fuel.tip.tirePressure');
    expect(hourCount()).toBe(0);
  });

  it('uses remote when online and gateway succeeds', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okChat('remote-ok'));
    vi.stubGlobal('fetch', fetchMock);

    const reply = await fetchChatReply(mockDb(true), 'How is my fuel?', 'en', (k) => k);

    expect(reply).toEqual({ text: 'remote-ok', source: 'remote' });
    expect(fetchMock).toHaveBeenCalled();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain(FREE_LLM_GATEWAYS[0]!.baseUrl.replace(/\/+$/, ''));
    const body = JSON.parse((init as RequestInit).body as string) as {
      model: string;
      max_tokens: number;
      reasoning_effort?: string;
      chat_template_kwargs?: { reasoning_effort: string };
      messages: Array<{ role: string; content: string }>;
    };
    expect(body.model).toBe(FREE_LLM_GATEWAYS[0]!.model);
    expect(body.max_tokens).toBe(ASSISTANT_THINKING_MAX_TOKENS);
    expect(body.reasoning_effort).toBe('low');
    expect(body.chat_template_kwargs).toEqual({ reasoning_effort: 'low' });
    expect(init.signal).toBeInstanceOf(AbortSignal);
    const system = body.messages.find((m) => m.role === 'system');
    expect(system?.content).toContain('Car: Test');
    expect(system?.content).toContain('Fuel this month: 0 EGP');
    expect(system?.content).toContain('0 means zero');
    expect(system?.content).not.toContain('"nickname"');
    expect(system?.content).not.toContain('healthItems');
    expect(hourCount()).toBe(1);
  });

  it('falls through gateways then local when all remote fail', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    vi.stubGlobal('fetch', fetchMock);

    const reply = await fetchChatReply(mockDb(true), 'anything', 'en', (k) => `L:${k}`);

    expect(reply.source).toBe('local');
    const urls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(urls).toEqual([
      'https://api.llm7.io/v1/chat/completions',
      'https://api.kilo.ai/api/gateway/chat/completions',
    ]);
    expect(reply.text.startsWith('L:')).toBe(true);
    expect(hourCount()).toBe(0);
  });

  it('records one rate hit when HTTP 429 is followed by a reply', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(httpStatus(429))
      .mockResolvedValueOnce(okChat('remote-ok'));
    vi.stubGlobal('fetch', fetchMock);

    const reply = await fetchChatReply(mockDb(true), 'fuel', 'en', (k) => k);

    expect(reply).toEqual({ text: 'remote-ok', source: 'remote' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(hourCount()).toBe(1);
  });

  it('skips remote when online is off', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const reply = await fetchChatReply(mockDb(false), 'fuel', 'en', (k) => k);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(reply.source).toBe('local');
    expect(hourCount()).toBe(0);
  });

  it('skips remote when device rate limited', async () => {
    const now = new Date();
    const hourKey = `${now.getUTCFullYear()}-${now.getUTCMonth()}-${now.getUTCDate()}-${now.getUTCHours()}`;
    const dayKey = `${now.getUTCFullYear()}-${now.getUTCMonth()}-${now.getUTCDate()}`;
    localStorage.setItem(
      RATE_KEY,
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
    expect(hourCount()).toBe(ASSISTANT_RATE_HOUR);
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

    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string) as {
      messages: Array<{ role: string; content: string }>;
    };
    const nonSystem = body.messages.filter((m) => m.role !== 'system');
    // 6 history + 1 newest user
    expect(nonSystem).toHaveLength(7);
    expect(nonSystem.at(-1)).toEqual({ role: 'user', content: 'newest' });
    expect(nonSystem[0]!.content).toBe('m4');
  });

  it('skips the network for an empty question, an FAQ hint, and offline', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const empty = await fetchChatReply(mockDb(true), '   ', 'en', (k) => k);
    expect(empty).toEqual({ text: 'assistant.local.generic', source: 'local' });

    const hinted = await fetchChatReply(mockDb(true), 'fuel', 'en', (k) => k, 'BREAKDOWN');
    expect(hinted.source).toBe('local');
    expect(hinted.text).toContain('advisor.answer.breakdownBody');

    vi.stubGlobal('navigator', { onLine: false });
    const offline = await fetchChatReply(mockDb(true), 'fuel', 'en', (k) => k);
    expect(offline.source).toBe('local');

    expect(fetchMock).not.toHaveBeenCalled();
    expect(hourCount()).toBe(0);
  });

  it('does not call the network when there is no car', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const reply = await fetchChatReply(mockDb(true, false), 'fuel', 'en', (k) => k);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(reply).toEqual({ text: 'assistant.local.noCar', source: 'local' });
    expect(hourCount()).toBe(0);
  });

  it('drops a scrambled Arabic reply and keeps the next gateway', async () => {
    const salad =
      'يحتاج المحرك crk211 إلى تغيير الزيت الكامل في أقرب وقت ممكن. brú567737 حصلت على ترزياح عجلة مت Öz دوم Casting Collier 3001570 exploits restée larinda مباراة حي ميكانيكلاى. دسترسى. لا أدري.';
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(okChat(salad))
      .mockResolvedValueOnce(okChat('ظبط ضغط الكاوتش كل شهر عشان الاستهلاك ينزل.'));
    vi.stubGlobal('fetch', fetchMock);

    const reply = await fetchChatReply(mockDb(true), 'نصيحة', 'ar', (k) => k);

    expect(reply).toEqual({
      text: 'ظبط ضغط الكاوتش كل شهر عشان الاستهلاك ينزل.',
      source: 'remote',
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const second = JSON.parse((fetchMock.mock.calls[1]![1] as RequestInit).body as string) as {
      model: string;
      max_tokens: number;
      reasoning_effort?: string;
    };
    expect(second.model).toBe('mistral-Nemo-Instruct-2407');
    expect(second.max_tokens).toBe(220);
    expect(second.reasoning_effort).toBeUndefined();
  });

  it('strips a leaked thought and still accepts the Arabic answer', async () => {
    const open = '<' + 'think' + '>';
    const close = '</' + 'think' + '>';
    const fetchMock = vi
      .fn()
      .mockResolvedValue(okChat(`${open}plan in English${close} ظبط ضغط الكاوتش كل شهر.`));
    vi.stubGlobal('fetch', fetchMock);

    const reply = await fetchChatReply(mockDb(true), 'نصيحة', 'ar', (k) => k);

    expect(reply).toEqual({ text: 'ظبط ضغط الكاوتش كل شهر.', source: 'remote' });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('rotates UnoRouter :free models and skips the device cap', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(httpStatus(429))
      .mockResolvedValueOnce(okChat('remote-ok'));
    vi.stubGlobal('fetch', fetchMock);
    const now = new Date();
    const hourKey = `${now.getUTCFullYear()}-${now.getUTCMonth()}-${now.getUTCDate()}-${now.getUTCHours()}`;
    const dayKey = `${now.getUTCFullYear()}-${now.getUTCMonth()}-${now.getUTCDate()}`;
    localStorage.setItem(
      RATE_KEY,
      JSON.stringify({
        hourKey,
        hourCount: ASSISTANT_RATE_HOUR,
        dayKey,
        dayCount: ASSISTANT_RATE_DAY,
      }),
    );

    const reply = await fetchChatReply(
      mockDb(true, true, 'sk-test-key-1234'),
      'fuel',
      'en',
      (k) => k,
    );

    expect(reply).toEqual({ text: 'remote-ok', source: 'remote' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const models = fetchMock.mock.calls.map((call) => {
      const init = call[1] as RequestInit;
      expect(init.headers).toMatchObject({ Authorization: 'Bearer sk-test-key-1234' });
      expect(String(call[0])).toBe('https://api.unorouter.com/v1/chat/completions');
      return (JSON.parse(init.body as string) as { model: string }).model;
    });
    expect(models).toEqual([UNOROUTER_FREE_MODELS[0], UNOROUTER_FREE_MODELS[1]]);
    expect(readUnorouterCursor(localStorage)).toBe(2);
    expect(hourCount()).toBe(ASSISTANT_RATE_HOUR);
  });

  it('drops a bad UnoRouter key and uses the keyless gateway', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(httpStatus(401))
      .mockResolvedValueOnce(okChat('remote-ok'));
    vi.stubGlobal('fetch', fetchMock);

    const reply = await fetchChatReply(
      mockDb(true, true, 'sk-test-key-1234'),
      'fuel',
      'en',
      (k) => k,
    );

    expect(reply).toEqual({ text: 'remote-ok', source: 'remote' });
    expect(fetchMock.mock.calls.map((call) => String(call[0]))).toEqual([
      'https://api.unorouter.com/v1/chat/completions',
      'https://api.llm7.io/v1/chat/completions',
    ]);
    const secondHeaders = (fetchMock.mock.calls[1]![1] as RequestInit).headers as Record<
      string,
      string
    >;
    expect(secondHeaders['Authorization']).toBeUndefined();
  });

  it('tries the next model on the same host after a timeout', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error('aborted'), { name: 'AbortError' }))
      .mockResolvedValueOnce(okChat('remote-ok'));
    vi.stubGlobal('fetch', fetchMock);

    const reply = await fetchChatReply(mockDb(true), 'fuel', 'en', (k) => k);

    expect(reply).toEqual({ text: 'remote-ok', source: 'remote' });
    expect(fetchMock.mock.calls.map((call) => String(call[0]))).toEqual([
      'https://api.llm7.io/v1/chat/completions',
      'https://api.llm7.io/v1/chat/completions',
    ]);
  });
});

describe('usableCoachText', () => {
  it('rejects the scrambled health insight and keeps a normal Arabic tip', () => {
    const salad =
      'يحتاج المحرك crk211 إلى تغيير الزيت Casting Collier exploits restée larinda لا أدري';
    expect(usableCoachText(salad, 'ar')).toBeNull();
    expect(usableCoachText('خلي التنك مليان لما تعبّي عشان الحساب يطلع مظبوط.', 'ar')).toContain(
      'التنك',
    );
    expect(usableCoachText('Check tire pressure.', 'en')).toBe('Check tire pressure.');
  });
});
