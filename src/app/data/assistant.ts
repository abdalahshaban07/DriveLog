import { ASSISTANT_HISTORY_LIMIT, FREE_LLM_GATEWAYS } from '../domain/free-llm-gateways';
import type { AdvisorIntent } from '../domain/advisor-intent';
import {
  coachSnapshot,
  loadCoachInputs,
  localCoachAnswer,
  type CoachReply,
  type CoachSnapshot,
} from '../domain/local-coach';
import type { MsgKey } from '../i18n/en';
import { canRemoteAssistantCall, recordRemoteAssistantCall } from './assistant-rate-limit';
import type { Db } from './db';
import { fetchOpenAiChat, OpenAiChatError, type OpenAiChatMessage } from './openai-chat';

const GATEWAY_TIMEOUT_MS = 8_000;

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** Online assistant when settings.assistantEnabled !== false (default on). */
export function isAssistantOnline(db: Db): boolean {
  return db.settings().assistantEnabled !== false;
}

function trimHistory(history: readonly ChatMessage[]): OpenAiChatMessage[] {
  const usable = history.filter(
    (m): m is OpenAiChatMessage =>
      (m.role === 'user' || m.role === 'assistant') && Boolean(m.content.trim()),
  );
  return usable.slice(-ASSISTANT_HISTORY_LIMIT);
}

function buildSystemPrompt(lang: 'en' | 'ar', snapshot: CoachSnapshot): string {
  const langLine =
    lang === 'ar'
      ? 'Reply in Arabic (Egyptian-friendly clear Arabic is fine).'
      : 'Reply in English.';
  return [
    'You are DriveLog, a concise fuel and maintenance coach for one personal car.',
    'Use only the JSON below. If a value is null, say you do not know.',
    'Do not invent VIN, plate, GPS, or costs.',
    'Keep answers to a few sentences.',
    langLine,
    JSON.stringify(snapshot),
  ].join('\n');
}

function browserMayReachGateway(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine !== false;
}

async function tryRemoteChat(
  snapshot: CoachSnapshot,
  question: string,
  lang: 'en' | 'ar',
  history: readonly ChatMessage[],
): Promise<string | null> {
  const messages: OpenAiChatMessage[] = [
    { role: 'system', content: buildSystemPrompt(lang, snapshot) },
    ...trimHistory(history),
    { role: 'user', content: question },
  ];

  const skipBaseUrls = new Set<string>();
  let sawHttp = false;
  let reply: string | null = null;

  for (const gw of FREE_LLM_GATEWAYS) {
    if (skipBaseUrls.has(gw.baseUrl)) continue;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), GATEWAY_TIMEOUT_MS);
    try {
      const text = await fetchOpenAiChat({
        baseUrl: gw.baseUrl,
        model: gw.model,
        messages,
        signal: controller.signal,
      });
      if (text.trim()) {
        reply = text.trim();
        break;
      }
    } catch (err) {
      if (err instanceof OpenAiChatError && err.code === 'network') {
        skipBaseUrls.add(gw.baseUrl);
      } else if (err instanceof OpenAiChatError && err.status != null) {
        sawHttp = true;
      }
    } finally {
      clearTimeout(timer);
    }
  }

  // One slot for the whole chain, and only after a reply or an HTTP status.
  if (reply || sawHttp) {
    recordRemoteAssistantCall();
  }
  return reply;
}

type Translate = (key: string, params?: Record<string, string | number>) => string;

export async function fetchChatReply(
  db: Db,
  question: string,
  lang: 'en' | 'ar',
  t: Translate,
  intentHint?: AdvisorIntent,
  history: readonly ChatMessage[] = [],
): Promise<CoachReply> {
  const q = question.trim();
  if (!q) {
    return { text: t('assistant.local.generic' as MsgKey), source: 'local' };
  }

  const loaded = loadCoachInputs(db);
  if (!loaded) {
    return { text: t('assistant.local.noCar' as MsgKey), source: 'local' };
  }

  const asMsg = t as (key: MsgKey, params?: Record<string, string | number>) => string;
  const local = (): CoachReply => localCoachAnswer(q, loaded.facts, loaded.logs, asMsg, intentHint);

  if (intentHint) {
    return local();
  }

  if (isAssistantOnline(db) && canRemoteAssistantCall() && browserMayReachGateway()) {
    const remote = await tryRemoteChat(
      coachSnapshot(loaded.facts, loaded.logs, loaded.totals, loaded.car, asMsg),
      q,
      lang,
      history,
    );
    if (remote) {
      return { text: remote, source: 'remote' };
    }
  }

  return local();
}
