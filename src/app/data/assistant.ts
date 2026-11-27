import {
  ASSISTANT_HISTORY_LIMIT,
  ASSISTANT_THINKING_MAX_TOKENS,
  clearCooldown,
  cooldownLeftSec,
  FREE_LLM_GATEWAYS,
  OUTAGE_COOLDOWN_SEC,
  QUOTA_HTTP_STATUSES,
  readCachedEntry,
  replyCacheKey,
  setCooldown,
  writeAssistantRemoteDown,
  writeCachedReply,
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

/** Mobile networks answer in 6-9s; 8s cut real replies off. */
const GATEWAY_TIMEOUT_MS = 15_000;
/** Total budget for one question's chain, including its quota waits. */
const CHAIN_BUDGET_MS = 140_000;
/** Wait out the free tier's 45s cooldown instead of dropping to a local answer. */
const RETRY_WAIT_CAP_S = 50;
/** The header rounds down and counts from the refused attempt, not the last reply. */
const WAIT_BUFFER_S = 6;
/** Two cooldowns, so a question queued behind one other lands without losing the answer. */
const MAX_QUOTA_WAITS = 2;
/** One clean answer or none: a garbled reply gets a single second chance. */
const MAX_BAD_REPLIES = 1;

/** Told how long the wait will be, so the screen can say it instead of going quiet. */
export type WaitNotice = (seconds: number) => void;

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
  // \p{Cc} is newlines and tabs: a multi-line answer is still Arabic. Without it
  // every line-broken reply was thrown away and the app fell back to local.
  if (/[^\p{Script=Arabic}\p{Script=Latin}\p{N}\p{P}\p{Z}\p{S}\p{M}\p{Cf}\p{Cc}]/u.test(text)) {
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
  if (
    read.intent === 'SERVICE_LIST' ||
    read.intent === 'PART_COST' ||
    read.intent === 'SPEND_COMPARE' ||
    read.intent === 'CAR_SUMMARY'
  ) {
    return true;
  }
  return read.intent === 'SPENDING_TREND' && read.window === 'range';
}

type ChainResult = {
  reply: string | null;
  /** Gateway id that wrote the reply. */
  provider: string | null;
  /** A gateway answered with a real failure (5xx, garbage, timeout) and none was merely busy. */
  sawDown: boolean;
  /** Shortest wait until a busy provider is free again, when every attempt was refused as busy. */
  retryAfterSec: number | null;
};

const downKey = (id: string) => `${id}:down`;

async function tryChain(
  gateways: readonly FreeLlmGateway[],
  messages: readonly OpenAiChatMessage[],
  lang: 'en' | 'ar',
  storage: Storage | null,
  signal?: AbortSignal,
  onWait?: WaitNotice,
): Promise<ChainResult> {
  const startedAt = Date.now();
  let quotaWaits = 0;
  let outage = false;
  let busyLeft: number | null = null;

  for (;;) {
    busyLeft = null;
    outage = false;
    for (const gw of gateways) {
      if (signal?.aborted) return { reply: null, provider: null, sawDown: false, retryAfterSec: null };
      if (Date.now() - startedAt >= CHAIN_BUDGET_MS) break;
      const busy = cooldownLeftSec(storage, gw.id);
      if (busy > 0) {
        busyLeft = Math.min(busyLeft ?? busy, busy);
        continue;
      }
      if (cooldownLeftSec(storage, downKey(gw.id)) > 0) {
        outage = true;
        continue;
      }
      let badReplies = 0;
      for (;;) {
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
            reasoningEffort: gw.reasoningHint ? 'low' : undefined,
            signal: controller.signal,
          });
          const text = usableCoachText(raw, lang);
          if (text) {
            clearCooldown(storage, gw.id);
            clearCooldown(storage, downKey(gw.id));
            return { reply: text, provider: gw.id, sawDown: false, retryAfterSec: null };
          }
          // A garbled or empty answer is not an outage: ask once more, then next provider.
          if (badReplies < MAX_BAD_REPLIES) {
            badReplies++;
            continue;
          }
        } catch (err) {
          if (signal?.aborted) {
            return { reply: null, provider: null, sawDown: false, retryAfterSec: null };
          }
          if (
            err instanceof OpenAiChatError &&
            err.status != null &&
            QUOTA_HTTP_STATUSES.includes(err.status)
          ) {
            // Free tiers answer a quota refusal with 402/429 plus Retry-After. The header
            // undershoots the real window, so pad it, and move on to the next provider now.
            const wait = Math.ceil(err.retryAfter ?? gw.defaultCooldownSec) + WAIT_BUFFER_S;
            setCooldown(storage, gw.id, wait);
            busyLeft = Math.min(busyLeft ?? wait, wait);
          } else {
            setCooldown(storage, downKey(gw.id), OUTAGE_COOLDOWN_SEC);
            outage = true;
          }
        } finally {
          clearTimeout(timer);
          signal?.removeEventListener('abort', onAbort);
        }
        break;
      }
    }
    // Every provider refused. Pollinations frees up in under a minute: wait that out
    // once or twice rather than hand the user a local answer.
    if (
      busyLeft != null &&
      busyLeft <= RETRY_WAIT_CAP_S + WAIT_BUFFER_S &&
      quotaWaits < MAX_QUOTA_WAITS &&
      Date.now() - startedAt + busyLeft * 1000 < CHAIN_BUDGET_MS
    ) {
      quotaWaits++;
      onWait?.(busyLeft);
      await waitSeconds(busyLeft, signal);
      continue;
    }
    break;
  }
  return {
    reply: null,
    provider: null,
    sawDown: outage && busyLeft == null,
    retryAfterSec: busyLeft,
  };
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
  /** Gateway id that answered (also on a cache hit), for the "answered by" line. */
  readonly provider?: string | null;
  /** Set when every gateway refused as busy (HTTP 402 quota or 429). */
  readonly retryAfterSec: number | null;
};

/** Walk the keyless gateway list. A device slot is spent only by a real reply. */
export async function fetchFreeChain(
  lang: 'en' | 'ar',
  messages: readonly OpenAiChatMessage[],
  signal?: AbortSignal,
  onWait?: WaitNotice,
): Promise<FreeChainReply> {
  const storage = typeof localStorage !== 'undefined' ? localStorage : null;
  const cacheKey = replyCacheKey(lang, messages);
  const cached = readCachedEntry(storage, cacheKey);
  if (cached) return { text: cached.text, provider: cached.provider ?? null, retryAfterSec: null };
  const chain = await tryChain(FREE_LLM_GATEWAYS, messages, lang, storage, signal, onWait);

  if (chain.reply) {
    recordRemoteAssistantCall();
    writeAssistantRemoteDown(storage, false);
    writeCachedReply(storage, cacheKey, chain.reply, Date.now(), chain.provider ?? undefined);
  } else if (chain.sawDown) {
    writeAssistantRemoteDown(storage, true);
  }
  return { text: chain.reply, provider: chain.provider, retryAfterSec: chain.retryAfterSec };
}

async function tryRemoteChat(
  snapshot: CoachSnapshot,
  question: string,
  lang: 'en' | 'ar',
  history: readonly ChatMessage[],
  onWait?: WaitNotice,
): Promise<FreeChainReply> {
  return fetchFreeChain(lang, coachMessages(snapshot, question, lang, history), undefined, onWait);
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
  onWait?: WaitNotice,
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
      onWait,
    );
    if (remote.text) {
      return { text: remote.text, source: 'remote', provider: remote.provider ?? undefined };
    }
    if (remote.retryAfterSec != null) {
      return { text: asMsg('assistant.busy' as MsgKey, { n: remote.retryAfterSec }), source: 'local' };
    }
    return { ...localReply, remoteFailed: true };
  }

  return localReply;
}
