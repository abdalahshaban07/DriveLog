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
): Promise<CoachReply> {
  const prompt = coachPrompt(db, question, lang);
  const remote = await fetchFreeCoachText(prompt);
  if (remote) {
    return { text: remote, source: 'ai' };
  }
  return { text: localCoachReply(db, question, t), source: 'local' };
}

function localCoachReply(
  db: Db,
  question: string,
  t: (key: MsgKey, params?: Record<string, string | number>) => string,
): string {
  const q = question.toLowerCase();
  const car = db.car();
  if (!car) {
    return t('assistant.local.noCar');
  }
  const period = activePeriod(db.expensePeriods(), car.id);
  const totals = periodTotals(
    period,
    db.fillUps(),
    db.maintenance(),
    db.breakdowns(),
    db.otherExpenses(),
  );
  const fuel = fuelDashboardMetrics(db.fillUps());
  // EN + Egyptian AR colloquial triggers
  if (
    /economy|fuel|consumption|بنزين|وقود|استهلاك|لتر|تنك|اقتصاد|توفير/.test(q)
  ) {
    if (fuel.lastL100 != null) {
      return t('assistant.local.economy', { l100: fuel.lastL100 });
    }
    return t('assistant.local.economyEmpty');
  }
  if (/period|spend|cost|مصروف|مصاريف|فترة|صرفت|فلوس/.test(q)) {
    return t('assistant.local.period', {
      total: Math.round(totals.total),
      currency: db.settings().currency,
    });
  }
  if (/maint|service|صيان|خدمة|زيت|فلتر/.test(q)) {
    return t('assistant.local.maint', { count: db.maintenance().length });
  }
  if (/break|fault|عطل|أعطال|عواطل|مشكلة/.test(q)) {
    return t('assistant.local.breakdown', { count: db.breakdowns().length });
  }
  return t('assistant.local.generic');
}
