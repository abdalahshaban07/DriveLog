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

  it('maps network/CORS failure to OpenAiChatError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new TypeError('Failed to fetch')),
    );
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
