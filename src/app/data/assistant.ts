import {
  ASSISTANT_HISTORY_LIMIT,
  ASSISTANT_THINKING_MAX_TOKENS,
  FREE_LLM_API_KEY,
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

const GATEWAY_TIMEOUT_MS = 15_000;
/** Wait out a short 429. A longer Retry-After moves on so the question does not stall. */
const RETRY_WAIT_CAP_S = 15;

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
  if (/[^\p{Script=Arabic}\p{Script=Latin}\p{N}\p{P}\p{Z}\p{S}\p{M}\p{Cf}]/u.test(text)) {
    return false;
  }
  const arabic = text.match(/\p{Script=Arabic}/gu)?.length ?? 0;
  const latin = text.match(/\p{Script=Latin}/gu)?.length ?? 0;
  if (arabic === 0) return false;
  const longLatin = text.match(/\p{Script=Latin}{4,}/gu)?.length ?? 0;
  return longLatin < 3 && arabic / (arabic + latin) >= 0.75;
}

function waitSeconds(seconds: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, seconds * 1000);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
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
  signal?: AbortSignal,
): Promise<ChainResult> {
  const skipBaseUrls = new Set<string>();
  let sawHttp = false;
  let reply: string | null = null;

  for (const gw of gateways) {
    if (signal?.aborted || skipBaseUrls.has(gw.baseUrl)) continue;
    const controller = new AbortController();
    const onAbort = () => controller.abort();
    signal?.addEventListener('abort', onAbort);
    const timer = setTimeout(() => controller.abort(), GATEWAY_TIMEOUT_MS);
    try {
      const raw = await fetchOpenAiChat({
        baseUrl: gw.baseUrl,
        model: gw.model,
        messages,
        apiKey: FREE_LLM_API_KEY,
        maxTokens: ASSISTANT_THINKING_MAX_TOKENS,
        reasoningEffort: 'low',
        signal: controller.signal,
      });
      sawHttp = true;
      const text = usableCoachText(raw, lang);
      if (text) {
        reply = text;
        break;
      }
    } catch (err) {
      if (signal?.aborted) break;
      if (err instanceof OpenAiChatError && err.code === 'network') {
        skipBaseUrls.add(gw.baseUrl);
      } else if (err instanceof OpenAiChatError && err.status != null) {
        sawHttp = true;
        const wait = err.retryAfter;
        if (err.status === 429 && wait != null && wait <= RETRY_WAIT_CAP_S) {
          await waitSeconds(wait, signal);
        }
      }
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
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

/** Walk the free-model list. One device slot after a reply or any HTTP status. */
export async function fetchFreeChain(
  lang: 'en' | 'ar',
  messages: readonly OpenAiChatMessage[],
  signal?: AbortSignal,
): Promise<string | null> {
  const storage = typeof localStorage !== 'undefined' ? localStorage : null;
  const chain = await tryChain(
    freeGatewaysFrom(readFreeLlmCursor(storage)),
    messages,
    lang,
    signal,
  );
  bumpFreeLlmCursor(storage);

  if (chain.reply || chain.sawHttp) {
    recordRemoteAssistantCall();
  }
  return chain.reply;
}

async function tryRemoteChat(
  snapshot: CoachSnapshot,
  question: string,
  lang: 'en' | 'ar',
  history: readonly ChatMessage[],
): Promise<string | null> {
  return fetchFreeChain(lang, coachMessages(snapshot, question, lang, history));
}

/**
 * Same free gateway chain as Ask DriveLog, without the local intent card.
 * Health lines name parts (زيت، فلتر) that fetchChatReply would answer on-device.
 */
export async function fetchFreeCoachText(
  lang: 'en' | 'ar',
  system: string,
  user: string,
): Promise<string | null> {
  const text = user.trim();
  if (!system.trim() || !text) return null;
  if (!canRemoteAssistantCall() || !browserMayReachGateway()) return null;
  return fetchFreeChain(lang, [
    { role: 'system', content: system },
    { role: 'user', content: text },
  ]);
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
