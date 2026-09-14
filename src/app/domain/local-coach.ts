import { COACH_MODEL, resolveCoachProxyUrl } from '../core/config';
import { buildAssistantContext } from './assistant-context';
import { fuelDashboardMetrics } from './fuel-dashboard';
import { periodTotals, activePeriod } from './expense-period';
import type { Db } from '../data/db';
import type { MsgKey } from '../i18n/en';

export const FUEL_TIP_KEYS = [
  'fuel.tip.fullTank',
  'fuel.tip.tirePressure',
  'fuel.tip.noIdle',
  'fuel.tip.compareGrades',
] as const satisfies readonly MsgKey[];

export type CoachSource = 'ai' | 'local';

export type CoachReply = {
  text: string;
  source: CoachSource;
};

const COACH_TIMEOUT_MS = 12_000;
const COACH_RETRIES = 2;

export function pickFuelTipKey(seed = Date.now()): MsgKey {
  const i = Math.abs(seed) % FUEL_TIP_KEYS.length;
  return FUEL_TIP_KEYS[i]!;
}

/** Cycle tips excluding the current one so refresh always changes the message. */
export function nextFuelTipKey(currentKey: MsgKey, db: Db): MsgKey {
  const pool: MsgKey[] = [...FUEL_TIP_KEYS];
  const contextual = contextualFuelTipKey(db);
  if (!pool.includes(contextual)) {
    pool.push(contextual);
  }
  const candidates = pool.filter((k) => k !== currentKey);
  if (candidates.length === 0) {
    return currentKey;
  }
  const idx = Math.abs(Date.now()) % candidates.length;
  return candidates[idx]!;
}

export function contextualFuelTipKey(db: Db): MsgKey {
  const car = db.car();
  if (!car) {
    return FUEL_TIP_KEYS[0]!;
  }
  const fuel = fuelDashboardMetrics(db.fillUps());
  if (fuel.lastL100 != null && fuel.lastL100 > 10) {
    return 'fuel.tip.highConsumption';
  }
  if (db.fillUps().length < 2) {
    return 'fuel.tip.logMore';
  }
  return pickFuelTipKey(car.currentOdometer);
}

function coachPrompt(db: Db, question: string, lang: 'en' | 'ar'): string {
  const ctx = buildAssistantContext({
    car: db.car(),
    settings: db.settings(),
    fills: db.fillUps(),
    maintenance: db.maintenance(),
    breakdowns: db.breakdowns(),
    other: db.otherExpenses(),
    periods: db.expensePeriods(),
    milestones: db.milestones(),
  });
  const langLine =
    lang === 'ar'
      ? [
          'جاوب بالمصري العامية بس.',
          'لو السؤال طلب نصيحة واحدة: جملة أو جملتين، من غير قايمة.',
          'لو السؤال عن تحسين/إزاي: لحد ٤ نقط مرقّمة قصيرة، لازم تكمّل كل النقط (متسيبش رقم فاضي في الآخر).',
          'متكررش أرقام العربية أو المصروف إلا لو السؤال طلبها.',
          'بلاش إنجليزي وبلاش ماركدوان وبلاش تحية طويلة.',
          'الأرقام بالهندي الشرقي (٠١٢٣٤٥٦٧٨٩) لو ذكرت رقم.',
        ].join(' ')
      : [
          'Reply in clear English.',
          'If one tip: one or two short sentences, no list.',
          'If how-to/improve: up to 4 short numbered points; finish every point (never end on a bare number).',
          'No markdown, no long greeting.',
          'Do not dump odometer or spend totals unless the question asks.',
        ].join(' ');
  return [
    'You are a concise car expense coach for a personal fuel + maintenance app used in Egypt.',
    langLine,
    `Context (use silently; do not recite): ${JSON.stringify(ctx)}`,
    `Question: ${question}`,
  ].join('\n');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Clean model text: strip markdown, break lists, drop truncated tail, soft-cap. */
export function formatCoachText(raw: string, maxLen = 280): string | null {
  let s = raw
    .replace(/\r\n/g, '\n')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[*_`#]+/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  // "1. foo 2. bar" → one tip per line
  s = s.replace(/(?:^|\s)(\d+)[.)]\s+/g, (_m, n: string, offset: number) =>
    offset === 0 ? `${n}. ` : `\n${n}. `,
  );
  const lines = s
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .filter(Boolean)
    // drop dangling "4." / "4" with no body (token cutoff)
    .filter((line) => !/^\d+[.)]?$/.test(line));
  s = lines.join('\n');
  if (s.length < 8) {
    return null;
  }
  if (s.length <= maxLen) {
    return s;
  }
  // Prefer cutting after a full numbered line when over cap
  let kept = '';
  for (const line of lines) {
    const next = kept ? `${kept}\n${line}` : line;
    if (next.length > maxLen) {
      break;
    }
    kept = next;
  }
  if (kept.length >= 8) {
    return kept;
  }
  const cut = s.slice(0, maxLen);
  const stop = Math.max(
    cut.lastIndexOf('。'),
    cut.lastIndexOf('؟'),
    cut.lastIndexOf('?'),
    cut.lastIndexOf('!'),
  );
  if (stop >= 40) {
    return cut.slice(0, stop + 1).trim();
  }
  const sp = cut.lastIndexOf(' ');
  return (sp > 40 ? cut.slice(0, sp) : cut).trim();
}

/** Normalize OpenAI/Groq (or legacy) JSON into plain tip text. */
export function parseCoachApiText(payload: unknown, maxLen = 280): string | null {
  if (typeof payload === 'string') {
    return formatCoachText(payload, maxLen);
  }
  if (!payload || typeof payload !== 'object') {
    return null;
  }
  const o = payload as Record<string, unknown>;
  const candidates: unknown[] = [
    o['result'],
    o['text'],
    o['generated'],
    o['response'],
    o['output'],
    o['content'],
    o['message'],
    (o['data'] as Record<string, unknown> | undefined)?.['text'],
    (o['data'] as Record<string, unknown> | undefined)?.['result'],
    (o['choices'] as { message?: { content?: string } }[] | undefined)?.[0]?.message
      ?.content,
  ];
  for (const c of candidates) {
    if (typeof c === 'string') {
      const text = formatCoachText(c, maxLen);
      if (text) {
        return text;
      }
    }
  }
  return null;
}

type CoachFetchOpts = {
  maxTokens?: number;
  maxLen?: number;
};

/** ponytail: Groq via CF Worker; no key in client — local templates always backstop. */
export async function fetchFreeCoachText(
  prompt: string,
  opts: CoachFetchOpts = {},
): Promise<string | null> {
  const proxyUrl = resolveCoachProxyUrl();
  if (!proxyUrl) {
    return null;
  }
  const maxTokens = opts.maxTokens ?? 120;
  const maxLen = opts.maxLen ?? 280;
  for (let attempt = 0; attempt <= COACH_RETRIES; attempt++) {
    const ctrl = new AbortController();
    const timer = window.setTimeout(() => ctrl.abort(), COACH_TIMEOUT_MS);
    try {
      const res = await fetch(proxyUrl, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: [{ role: 'user', content: prompt }],
          max_tokens: maxTokens,
          ...(COACH_MODEL ? { model: COACH_MODEL } : {}),
        }),
        signal: ctrl.signal,
      });
      if (!res.ok) {
        continue;
      }
      const rawText = await res.text();
      let raw: unknown = rawText;
      try {
        raw = JSON.parse(rawText) as unknown;
      } catch {
        /* plain text body */
      }
      const text = parseCoachApiText(raw, maxLen);
      if (text) {
        return text;
      }
    } catch {
      /* retry */
    } finally {
      window.clearTimeout(timer);
    }
    if (attempt < COACH_RETRIES) {
      await sleep(400 * (attempt + 1));
    }
  }
  return null;
}

export async function fetchFuelTipText(
  db: Db,
  lang: 'en' | 'ar',
  t: (key: MsgKey) => string,
): Promise<CoachReply> {
  const key = contextualFuelTipKey(db);
  const fallback = t(key);
  const car = db.car();
  if (!car) {
    return { text: fallback, source: 'local' };
  }
  const prompt = coachPrompt(db, t('fuel.tip.prompt'), lang);
  const remote = await fetchFreeCoachText(prompt, { maxTokens: 100, maxLen: 220 });
  if (remote) {
    return { text: remote, source: 'ai' };
  }
  return { text: fallback, source: 'local' };
}

export async function fetchCoachReply(
  db: Db,
  question: string,
  lang: 'en' | 'ar',
  t: (key: MsgKey, params?: Record<string, string | number>) => string,
  intentHint?: CoachIntent,
): Promise<CoachReply> {
  const prompt = coachPrompt(db, question, lang);
  const remote = await fetchFreeCoachText(prompt, { maxTokens: 360, maxLen: 900 });
  if (remote) {
    return { text: remote, source: 'ai' };
  }
  return { text: localCoachReply(db, question, t, intentHint), source: 'local' };
}

export type CoachIntent = 'economy' | 'period' | 'maint' | 'breakdown' | 'generic';

/** Strip tashkeel/tatweel and normalize Alef/Ya/Ta so Egyptian stems match. */
export function normalizeCoachQuery(raw: string): string {
  return raw
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/\s+/g, ' ')
    .trim();
}

export function detectCoachIntent(question: string): CoachIntent {
  const q = normalizeCoachQuery(question);
  if (
    /economy|fuel|consumption|mpg|l\/100|بنزين|وقود|استهلاك|تستهلك|ستهلك|لتر|تنك|اقتصاد|توفير|اوفر|سواقه|كاوتش/.test(
      q,
    )
  ) {
    return 'economy';
  }
  if (
    /period|spend|cost|expense|budget|مصروف|مصاريف|فتره|صرفت|دفعت|دفع|فلوس|كلفن|كلف|حساب|ميزانيه/.test(
      q,
    )
  ) {
    return 'period';
  }
  if (/maint|service|oil|صيان|خدمه|زيت|فلتر|غيرت\s*الزيت|تغيير\s*زيت/.test(q)) {
    return 'maint';
  }
  if (/break|fault|repair|عطل|اعطال|عواطل|مشكل|صلحت|تصليح|خربان/.test(q)) {
    return 'breakdown';
  }
  return 'generic';
}

export function intentFromFaqKey(key: MsgKey): CoachIntent | undefined {
  switch (key) {
    case 'assistant.faq.economy':
      return 'economy';
    case 'assistant.faq.period':
      return 'period';
    case 'assistant.faq.maintenance':
      return 'maint';
    case 'assistant.faq.breakdown':
      return 'breakdown';
    default:
      return undefined;
  }
}

function localCoachReply(
  db: Db,
  question: string,
  t: (key: MsgKey, params?: Record<string, string | number>) => string,
  intentHint?: CoachIntent,
): string {
  const car = db.car();
  if (!car) {
    return t('assistant.local.noCar');
  }
  const intent = intentHint ?? detectCoachIntent(question);
  const period = activePeriod(db.expensePeriods(), car.id);
  const totals = periodTotals(
    period,
    db.fillUps(),
    db.maintenance(),
    db.breakdowns(),
    db.otherExpenses(),
  );
  const fuel = fuelDashboardMetrics(db.fillUps());
  switch (intent) {
    case 'economy':
      if (fuel.lastL100 != null) {
        return t('assistant.local.economy', { l100: fuel.lastL100 });
      }
      return t('assistant.local.economyEmpty');
    case 'period':
      return t('assistant.local.period', {
        total: Math.round(totals.total),
        currency: db.settings().currency,
      });
    case 'maint':
      return t('assistant.local.maint', { count: db.maintenance().length });
    case 'breakdown':
      return t('assistant.local.breakdown', { count: db.breakdowns().length });
    case 'generic':
      return t('assistant.local.generic');
    default: {
      const _exhaustive: never = intent;
      return _exhaustive;
    }
  }
}
