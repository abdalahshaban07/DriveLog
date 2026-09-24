import {
  ASSISTANT_HISTORY_LIMIT,
  FREE_LLM_GATEWAYS,
} from '../domain/free-llm-gateways';
import { buildAssistantContext } from '../domain/assistant-context';
import {
  fetchCoachReply,
  type CoachIntent,
  type CoachReply,
} from '../domain/local-coach';
import type { MsgKey } from '../i18n/en';
import {
  canRemoteAssistantCall,
  recordRemoteAssistantCall,
} from './assistant-rate-limit';
import type { Db } from './db';
import { fetchOpenAiChat, type OpenAiChatMessage } from './openai-chat';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** Online assistant when settings.assistantEnabled !== false (default on). */
export function isAssistantOnline(db: Db): boolean {
  return db.settings().assistantEnabled !== false;
}

function trimHistory(
  history: readonly ChatMessage[],
): OpenAiChatMessage[] {
  const usable = history.filter(
    (m): m is OpenAiChatMessage =>
      (m.role === 'user' || m.role === 'assistant') && Boolean(m.content.trim()),
  );
  return usable.slice(-ASSISTANT_HISTORY_LIMIT);
}

function buildSystemPrompt(
  lang: 'en' | 'ar',
  context: Record<string, unknown>,
): string {
  const langLine =
    lang === 'ar'
      ? 'Reply in Arabic (Egyptian-friendly clear Arabic is fine).'
      : 'Reply in English.';
  return [
    'You are DriveLog, a concise fuel and maintenance coach for one personal car.',
    'Use only the JSON vehicle context below. Do not invent VIN, GPS, or API keys.',
    'Keep answers short (a few sentences). Prefer actionable tips.',
    langLine,
    'Vehicle context JSON:',
    JSON.stringify(context),
  ].join('\n');
}

async function tryRemoteChat(
  db: Db,
  question: string,
  lang: 'en' | 'ar',
  history: readonly ChatMessage[],
): Promise<string | null> {
  if (!canRemoteAssistantCall()) {
    return null;
  }

  const context = buildAssistantContext({
    car: db.car(),
    settings: db.settings(),
    fills: db.fillUps(),
    maintenance: db.maintenance(),
    breakdowns: db.breakdowns(),
    other: db.otherExpenses(),
    periods: db.expensePeriods(),
    milestones: db.milestones(),
  });

  const messages: OpenAiChatMessage[] = [
    { role: 'system', content: buildSystemPrompt(lang, context) },
    ...trimHistory(history),
    { role: 'user', content: question.trim() },
  ];

  // Count one attempt for the whole chain (device throttle).
  recordRemoteAssistantCall();

  for (const gw of FREE_LLM_GATEWAYS) {
    try {
      return await fetchOpenAiChat({
        baseUrl: gw.baseUrl,
        model: gw.model,
        messages,
      });
    } catch {
      // try next gateway (CORS, 429, model unavailable, …)
    }
  }
  return null;
}

export async function fetchChatReply(
  db: Db,
  question: string,
  lang: 'en' | 'ar',
  t: (key: string, params?: Record<string, string | number>) => string,
  intentHint?: CoachIntent,
  history: readonly ChatMessage[] = [],
): Promise<CoachReply> {
  const q = question.trim();
  if (!q) {
    return { text: t('assistant.local.generic' as MsgKey), source: 'local' };
  }

  if (isAssistantOnline(db)) {
    const remote = await tryRemoteChat(db, q, lang, history);
    if (remote) {
      return { text: remote, source: 'remote' };
    }
  }

  const local = await fetchCoachReply(
    db,
    q,
    lang,
    t as (key: MsgKey, params?: Record<string, string | number>) => string,
    intentHint,
  );
  return local;
}
