import {
  ASSISTANT_HISTORY_LIMIT,
  ASSISTANT_THINKING_MAX_TOKENS,
  bumpFreeLlmCursor,
  freeGatewaysFrom,
  readFreeLlmCursor,
  writeAssistantRemoteDown,
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
/** Total budget for one question's chain, so stacked timeouts cannot stall the reply. */
const CHAIN_BUDGET_MS = 40_000;
/** Wait out a short 429. A longer Retry-After moves on so the question does not stall. */
const RETRY_WAIT_CAP_S = 10;

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
 * ponytail: the bar is a 60% Arabic-letter ratio plus a cap of 4 long Latin
 * words, tuned 2026-11-27 so valid replies that name the model in Latin
 * ("أنا LFM من Liquid AI") pass while gibberish salads still fail.
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
  return longLatin < 5 && arabic / (arabic + latin) >= 0.6;
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

/**
 * Answers computed from the records stay on-device: the model could only
 * rephrase a number it does not have, and the wait is not worth it.
 */
function isComputedLocal(read: AdvisorRead): boolean {
  if (read.intent === 'SERVICE_LIST' || read.intent === 'PART_COST' || read.intent === 'SPEND_COMPARE') {
    return true;
  }
  return read.intent === 'SPENDING_TREND' && read.window === 'range';
}

type ChainResult = {
  reply: string | null;
  /** A gateway answered with a real failure (5xx, garbage). 429 busy is not down. */
  sawDown: boolean;
  /** Longest 429 cooldown seen, when every attempt was refused as busy. */
  retryAfterSec: number | null;
};

async function tryChain(
  gateways: readonly FreeLlmGateway[],
  messages: readonly OpenAiChatMessage[],
  lang: 'en' | 'ar',
  signal?: AbortSignal,
): Promise<ChainResult> {
  const skipBaseUrls = new Set<string>();
  const retriedBusy = new Set<string>();
  const startedAt = Date.now();
  let sawDown = false;
  let retryAfterSec: number | null = null;
  let reply: string | null = null;

  for (let i = 0; i < gateways.length; i++) {
    const gw = gateways[i]!;
    if (signal?.aborted || skipBaseUrls.has(gw.baseUrl)) continue;
    if (Date.now() - startedAt >= CHAIN_BUDGET_MS) break;
    const controller = new AbortController();
    const onAbort = () => controller.abort();
    signal?.addEventListener('abort', onAbort);
    const timer = setTimeout(() => controller.abort(), GATEWAY_TIMEOUT_MS);
    try {
      const raw = await fetchOpenAiChat({
        baseUrl: gw.baseUrl,
        model: gw.model,
        messages,
        apiKey: gw.apiKey,
        maxTokens: ASSISTANT_THINKING_MAX_TOKENS,
        reasoningEffort: 'low',
        signal: controller.signal,
      });
      const text = usableCoachText(raw, lang);
      if (text) {
        reply = text;
        break;
      }
      sawDown = true;
    } catch (err) {
      if (signal?.aborted) break;
      if (err instanceof OpenAiChatError && err.code === 'network') {
        skipBaseUrls.add(gw.baseUrl);
      } else if (err instanceof OpenAiChatError && err.status != null) {
        if (err.status === 429) {
          const wait = err.retryAfter ?? 45;
          retryAfterSec = Math.max(retryAfterSec ?? 0, wait);
          if (wait <= RETRY_WAIT_CAP_S && !retriedBusy.has(gw.baseUrl)) {
            retriedBusy.add(gw.baseUrl);
            await waitSeconds(wait, signal);
            i--; // same gateway, one retry after its short cooldown
            continue;
          }
        } else {
          sawDown = true;
        }
      }
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    }
  }

  return { reply, sawDown, retryAfterSec };
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

export type FreeChainReply = {
  readonly text: string | null;
  /** Set when every gateway refused as busy (HTTP 429). */
  readonly retryAfterSec: number | null;
};

/** Walk the keyless gateway list. A device slot is spent only by a real reply. */
export async function fetchFreeChain(
  lang: 'en' | 'ar',
  messages: readonly OpenAiChatMessage[],
  signal?: AbortSignal,
): Promise<FreeChainReply> {
  const storage = typeof localStorage !== 'undefined' ? localStorage : null;
  const chain = await tryChain(
    freeGatewaysFrom(readFreeLlmCursor(storage)),
    messages,
    lang,
    signal,
  );
  bumpFreeLlmCursor(storage);

  if (chain.reply) {
    recordRemoteAssistantCall();
    writeAssistantRemoteDown(storage, false);
  } else if (chain.sawDown) {
    writeAssistantRemoteDown(storage, true);
  }
  return { text: chain.reply, retryAfterSec: chain.retryAfterSec };
}

async function tryRemoteChat(
  snapshot: CoachSnapshot,
  question: string,
  lang: 'en' | 'ar',
  history: readonly ChatMessage[],
): Promise<FreeChainReply> {
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
  const chain = await fetchFreeChain(lang, [
    { role: 'system', content: system },
    { role: 'user', content: text },
  ]);
  return chain.text;
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
  if (intentHint || localReply.card || isComputedLocal(read)) return localReply;

  if (isAssistantOnline(db) && !canRemoteAssistantCall()) {
    return { ...localReply, rateLimited: true };
  }
  if (isAssistantOnline(db) && canRemoteAssistantCall() && browserMayReachGateway()) {
    const remote = await tryRemoteChat(
      coachSnapshot(loaded.facts, loaded.logs, loaded.totals, loaded.car, asMsg),
      q,
      lang,
      history,
    );
    if (remote.text) return { text: remote.text, source: 'remote' };
    if (remote.retryAfterSec != null) {
      return { text: asMsg('assistant.busy' as MsgKey, { n: remote.retryAfterSec }), source: 'local' };
    }
    return { ...localReply, remoteFailed: true };
  }

  return localReply;
}
