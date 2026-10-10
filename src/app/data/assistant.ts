import {
  ASSISTANT_HISTORY_LIMIT,
  ASSISTANT_THINKING_MAX_TOKENS,
  bumpFreeLlmCursor,
  freeGatewaysFrom,
  readFreeLlmCursor,
  type FreeLlmGateway,
} from '../domain/free-llm-gateways';
import {
  forcedAdvisorRead,
  readAdvisor,
  type AdvisorIntent,
  type AdvisorRead,
} from '../domain/advisor-intent';
import type { CardFormat } from '../domain/advisor-card';
import {
  coachPrompt,
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
const THINKING_GATEWAY_TIMEOUT_MS = 15_000;

const REDACTED = 'redacted_' + 'thinking';
const THINK = 'th' + 'ink';
const THINK_BLOCK = new RegExp(
  `<(?:${REDACTED}|${THINK})>[\\s\\S]*?</(?:${REDACTED}|${THINK})>`,
  'gi',
);
const THINK_TAG = new RegExp(`</?(?:${REDACTED}|${THINK})>`, 'gi');

/**
 * Drop leaked thoughts. Arabic replies must be mostly Arabic — free models
 * otherwise return token salad and we would cache it for the day.
 * ponytail: letter ratio plus a cap of 2 long Latin words. A 4-word English
 * nickname can still fail the 75% bar; raise the cap if that shows up.
 */
export function usableCoachText(raw: string, lang: 'en' | 'ar'): string | null {
  const text = raw.replace(THINK_BLOCK, '').replace(THINK_TAG, '').trim();
  if (!text) return null;
  if (lang === 'ar' && !mostlyArabic(text)) return null;
  return text;
}

function mostlyArabic(text: string): boolean {
  const arabic = text.match(/\p{Script=Arabic}/gu)?.length ?? 0;
  const latin = text.match(/\p{Script=Latin}/gu)?.length ?? 0;
  if (arabic === 0) return false;
  const longLatin = text.match(/\p{Script=Latin}{4,}/gu)?.length ?? 0;
  return longLatin < 3 && arabic / (arabic + latin) >= 0.75;
}

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
  return coachPrompt(snapshot, lang);
}

function browserMayReachGateway(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine !== false;
}

type ChainResult = {
  reply: string | null;
  sawHttp: boolean;
};

async function tryChain(
  gateways: readonly FreeLlmGateway[],
  messages: readonly OpenAiChatMessage[],
  lang: 'en' | 'ar',
): Promise<ChainResult> {
  const skipBaseUrls = new Set<string>();
  let sawHttp = false;
  let reply: string | null = null;

  for (const gw of gateways) {
    if (skipBaseUrls.has(gw.baseUrl)) continue;
    const thinking = gw.id === 'llm7-glm';
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      thinking ? THINKING_GATEWAY_TIMEOUT_MS : GATEWAY_TIMEOUT_MS,
    );
    try {
      const raw = await fetchOpenAiChat({
        baseUrl: gw.baseUrl,
        model: gw.model,
        messages,
        maxTokens: thinking ? ASSISTANT_THINKING_MAX_TOKENS : undefined,
        reasoningEffort: thinking ? 'low' : undefined,
        signal: controller.signal,
      });
      sawHttp = true;
      const text = usableCoachText(raw, lang);
      if (text) {
        reply = text;
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

  return { reply, sawHttp };
}

function coachMessages(
  snapshot: CoachSnapshot,
  question: string,
  lang: 'en' | 'ar',
  history: readonly ChatMessage[],
): OpenAiChatMessage[] {
  return [
    { role: 'system', content: buildSystemPrompt(lang, snapshot) },
    ...trimHistory(history),
    { role: 'user', content: question },
  ];
}

async function tryRemoteChat(
  snapshot: CoachSnapshot,
  question: string,
  lang: 'en' | 'ar',
  history: readonly ChatMessage[],
): Promise<string | null> {
  const storage = typeof localStorage !== 'undefined' ? localStorage : null;
  const chain = await tryChain(
    freeGatewaysFrom(readFreeLlmCursor(storage)),
    coachMessages(snapshot, question, lang, history),
    lang,
  );
  bumpFreeLlmCursor(storage);

  // One slot for the whole chain, and only after a reply or an HTTP status.
  if (chain.reply || chain.sawHttp) {
    recordRemoteAssistantCall();
  }
  return chain.reply;
}

type Translate = (key: string, params?: Record<string, string | number>) => string;

export async function fetchChatReply(
  db: Db,
  question: string,
  lang: 'en' | 'ar',
  t: Translate,
  intentHint?: AdvisorIntent,
  history: readonly ChatMessage[] = [],
  carry: AdvisorRead | null = null,
  format?: CardFormat,
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
  const read = carry ?? (intentHint ? forcedAdvisorRead(q, intentHint) : readAdvisor(q));
  const local = (): CoachReply =>
    localCoachAnswer(q, loaded.facts, loaded.logs, asMsg, read, format);

  const localReply = local();
  if (intentHint || localReply.card) return localReply;

  if (isAssistantOnline(db) && canRemoteAssistantCall() && browserMayReachGateway()) {
    const remote = await tryRemoteChat(
      coachSnapshot(loaded.facts, loaded.logs, loaded.totals, loaded.car, asMsg),
      q,
      lang,
      history,
    );
    if (remote) return { text: remote, source: 'remote' };
    return { ...localReply, remoteFailed: true };
  }

  return localReply;
}
