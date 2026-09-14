/**
 * DriveLog coach proxy — holds GROQ_API_KEY server-side.
 * Client POSTs { messages | prompt, max_tokens? } → Groq OpenAI-compatible chat.
 */

export interface Env {
  GROQ_API_KEY: string;
  GROQ_MODEL?: string;
  ALLOWED_ORIGINS?: string;
}

const GROQ_CHAT_URL = 'https://api.groq.com/openai/v1/chat/completions';
const DEFAULT_MODEL = 'allam-2-7b';

function allowedOrigins(env: Env): string[] {
  return (env.ALLOWED_ORIGINS ?? 'http://localhost:4200,https://abdalahshaban07.github.io')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function corsHeaders(origin: string | null, allowed: string[]): HeadersInit {
  const match = origin && allowed.includes(origin) ? origin : allowed[0] ?? '*';
  return {
    'Access-Control-Allow-Origin': match,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

type ChatBody = {
  prompt?: string;
  messages?: { role: string; content: string }[];
  model?: string;
  max_tokens?: number;
};

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const allowed = allowedOrigins(env);
    const cors = corsHeaders(req.headers.get('Origin'), allowed);

    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    if (req.method !== 'POST') {
      return new Response('Method not allowed', { status: 405, headers: cors });
    }

    if (!env.GROQ_API_KEY) {
      return Response.json({ error: 'GROQ_API_KEY not configured' }, { status: 500, headers: cors });
    }

    let body: ChatBody;
    try {
      body = (await req.json()) as ChatBody;
    } catch {
      return Response.json({ error: 'invalid JSON' }, { status: 400, headers: cors });
    }

    const messages =
      Array.isArray(body.messages) && body.messages.length > 0
        ? body.messages
        : [{ role: 'user', content: String(body.prompt ?? '').slice(0, 8_000) }];

    if (!messages[0]?.content?.trim()) {
      return Response.json({ error: 'empty prompt' }, { status: 400, headers: cors });
    }

    const upstream = await fetch(GROQ_CHAT_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: body.model || env.GROQ_MODEL || DEFAULT_MODEL,
        messages,
        max_tokens: Math.min(Math.max(Number(body.max_tokens) || 180, 32), 512),
        temperature: 0.4,
      }),
    });

    const text = await upstream.text();
    return new Response(text, {
      status: upstream.status,
      headers: {
        ...cors,
        'Content-Type': 'application/json',
      },
    });
  },
};
