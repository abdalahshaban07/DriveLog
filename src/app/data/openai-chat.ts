import { ASSISTANT_MAX_TOKENS } from '../domain/free-llm-gateways';

export type OpenAiChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export class OpenAiChatError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'OpenAiChatError';
  }
}

type ChatCompletionsBody = {
  choices?: Array<{ message?: { content?: string | null; reasoning_content?: string | null } }>;
  error?: { message?: string; code?: string };
};

/** POST {baseUrl}/chat/completions — no Authorization (keyless free gateways). */
export async function fetchOpenAiChat(input: {
  baseUrl: string;
  model: string;
  messages: readonly OpenAiChatMessage[];
  maxTokens?: number;
  /** GLM-5.3 only. Thinking stays on; this keeps it short. */
  reasoningEffort?: 'low' | 'high';
  signal?: AbortSignal;
}): Promise<string> {
  const base = input.baseUrl.replace(/\/+$/, '');
  const url = `${base}/chat/completions`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: input.model,
        messages: input.messages,
        max_tokens: input.maxTokens ?? ASSISTANT_MAX_TOKENS,
        ...(input.reasoningEffort
          ? {
              reasoning_effort: input.reasoningEffort,
              chat_template_kwargs: { reasoning_effort: input.reasoningEffort },
            }
          : {}),
      }),
      signal: input.signal,
    });
  } catch (err) {
    // Abort is one model being slow. CORS / offline is the whole host.
    const aborted = err instanceof Error && err.name === 'AbortError';
    const msg = err instanceof Error ? err.message : 'network';
    throw new OpenAiChatError(msg, undefined, aborted ? 'timeout' : 'network');
  }

  let body: ChatCompletionsBody = {};
  try {
    body = (await res.json()) as ChatCompletionsBody;
  } catch {
    body = {};
  }

  if (!res.ok) {
    throw new OpenAiChatError(
      body.error?.message ?? `HTTP ${res.status}`,
      res.status,
      body.error?.code ?? 'http_error',
    );
  }

  // Answer only. reasoning_content is the scratchpad and must not be shown.
  const content = body.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new OpenAiChatError('empty', res.status, 'empty');
  }
  return content;
}
