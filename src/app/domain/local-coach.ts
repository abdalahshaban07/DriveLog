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
/** ponytail: shared free Worker AI; daily neuron cap — local templates always backstop. */
const DEVTOOLBOX_GENERATE_URL =
  'https://devtoolbox-api.devtoolbox-api.workers.dev/ai/generate';

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
          'جاوب بالمصري العامية (لهجة مصر)، مش فصحى تقيلة.',
          'كلمات طبيعية زي: بنزين، تنك، كاوتش، عربية، عشان، دلوقتي، أوفر.',
          'الأرقام بالهندي الشرقي (٠١٢٣٤٥٦٧٨٩) لما تذكر أرقام.',
          'جملة أو جملتين قصّار. بلاش إنجليزي وبلاش ماركدوان.',
        ].join(' ')
      : 'Reply in clear English. One or two short sentences. No markdown.';
  return [
    'You are a concise car expense coach for a personal fuel + maintenance app used in Egypt.',
    langLine,
    `Context: ${JSON.stringify(ctx)}`,
    `Question: ${question}`,
  ].join('\n');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Normalize DevToolBox / Workers AI JSON into plain tip text. */
export function parseCoachApiText(payload: unknown): string | null {
  if (typeof payload === 'string') {
    const s = payload.trim().replace(/\s+/g, ' ');
    return s.length >= 8 ? s.slice(0, 480) : null;
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
      const s = c.trim().replace(/\s+/g, ' ');
      if (s.length >= 8) {
        return s.slice(0, 480);
      }
    }
  }
  return null;
}

/** ponytail: DevToolBox Workers AI (no key); falls back to local templates. */
export async function fetchFreeCoachText(prompt: string): Promise<string | null> {
  for (let attempt = 0; attempt <= COACH_RETRIES; attempt++) {
    const ctrl = new AbortController();
    const timer = window.setTimeout(() => ctrl.abort(), COACH_TIMEOUT_MS);
    try {
      const res = await fetch(DEVTOOLBOX_GENERATE_URL, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ prompt, max_tokens: 180 }),
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
      const text = parseCoachApiText(raw);
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
  const remote = await fetchFreeCoachText(prompt);
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
  const remote = await fetchFreeCoachText(prompt);
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
