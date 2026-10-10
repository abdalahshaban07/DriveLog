import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ASSISTANT_RATE_DAY,
  ASSISTANT_RATE_HOUR,
  canRemoteAssistantCall,
  recordRemoteAssistantCall,
} from './assistant-rate-limit';
import { fetchOpenAiChat, OpenAiChatError } from './openai-chat';
import { FREE_LLM_GATEWAYS } from '../domain/free-llm-gateways';

describe('assistant-rate-limit', () => {
  const store = new Map<string, string>();
  const storage = {
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

  afterEach(() => store.clear());

  it('allows calls under hour and day caps', () => {
    const now = new Date('2026-09-24T12:00:00Z');
    expect(canRemoteAssistantCall(storage, now)).toBe(true);
    for (let i = 0; i < ASSISTANT_RATE_HOUR; i++) {
      recordRemoteAssistantCall(storage, now);
    }
    expect(canRemoteAssistantCall(storage, now)).toBe(false);
  });

  it('resets hour bucket on next UTC hour', () => {
    const noon = new Date('2026-09-24T12:00:00Z');
    for (let i = 0; i < ASSISTANT_RATE_HOUR; i++) {
      recordRemoteAssistantCall(storage, noon);
    }
    expect(canRemoteAssistantCall(storage, noon)).toBe(false);
    const nextHour = new Date('2026-09-24T13:00:00Z');
    expect(canRemoteAssistantCall(storage, nextHour)).toBe(true);
  });

  it('enforces day cap', () => {
    // Stay on the same UTC day: 5 hours × 8/hour = 40.
    for (let h = 0; h < 5; h++) {
      const t = new Date(Date.UTC(2026, 8, 24, h, 0, 0));
      for (let i = 0; i < ASSISTANT_RATE_HOUR; i++) {
        expect(canRemoteAssistantCall(storage, t)).toBe(true);
        recordRemoteAssistantCall(storage, t);
      }
    }
    const late = new Date(Date.UTC(2026, 8, 24, 23, 0, 0));
    expect(canRemoteAssistantCall(storage, late)).toBe(false);
  });
});

describe('openai-chat', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('POSTs chat completions without Authorization', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: ' hello ' } }],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const text = await fetchOpenAiChat({
      baseUrl: 'https://api.llm7.io/v1',
      model: 'GLM-5.3-Flash',
      messages: [{ role: 'user', content: 'hi' }],
    });

    expect(text).toBe('hello');
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.llm7.io/v1/chat/completions');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(JSON.parse(init.body as string).model).toBe('GLM-5.3-Flash');
  });

  it('asks GLM for a short thought and returns the answer, not the scratchpad', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'answer', reasoning_content: 'scratchpad' } }],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const text = await fetchOpenAiChat({
      baseUrl: 'https://api.llm7.io/v1',
      model: 'GLM-5.3-Flash',
      messages: [{ role: 'user', content: 'hi' }],
      reasoningEffort: 'low',
      maxTokens: 640,
    });

    expect(text).toBe('answer');
    const body = JSON.parse(fetchMock.mock.calls[0]![1].body as string) as {
      max_tokens: number;
      reasoning_effort: string;
      chat_template_kwargs: { reasoning_effort: string };
    };
    expect(body.max_tokens).toBe(640);
    expect(body.reasoning_effort).toBe('low');
    expect(body.chat_template_kwargs).toEqual({ reasoning_effort: 'low' });
  });

  it('sends Authorization only when a key is set', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'ok' } }] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await fetchOpenAiChat({
      baseUrl: 'https://api.unorouter.com/v1',
      model: 'k2-horizon:free',
      apiKey: ' sk-test-key-1234 ',
      messages: [{ role: 'user', content: 'hi' }],
    });

    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect(init.headers).toEqual({
      'Content-Type': 'application/json',
      Authorization: 'Bearer sk-test-key-1234',
    });
    expect(JSON.parse(init.body as string).model).toBe('k2-horizon:free');
  });

  it('maps an abort to timeout, not a dead host', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(Object.assign(new Error('aborted'), { name: 'AbortError' })),
    );
    await expect(
      fetchOpenAiChat({
        baseUrl: 'https://api.llm7.io/v1',
        model: 'GLM-5.3-Flash',
        messages: [{ role: 'user', content: 'hi' }],
      }),
    ).rejects.toMatchObject({ code: 'timeout' } satisfies Partial<OpenAiChatError>);
  });

  it('maps network/CORS failure to OpenAiChatError', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(
      fetchOpenAiChat({
        baseUrl: FREE_LLM_GATEWAYS[0]!.baseUrl,
        model: FREE_LLM_GATEWAYS[0]!.model,
        messages: [{ role: 'user', content: 'hi' }],
      }),
    ).rejects.toMatchObject({
      name: 'OpenAiChatError',
      code: 'network',
    } satisfies Partial<OpenAiChatError>);
  });

  it('throws on HTTP error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        json: async () => ({ error: { message: 'rate', code: 'rate' } }),
      }),
    );
    await expect(
      fetchOpenAiChat({
        baseUrl: 'https://api.llm7.io/v1',
        model: 'x',
        messages: [{ role: 'user', content: 'hi' }],
      }),
    ).rejects.toMatchObject({ status: 429 });
  });
});
