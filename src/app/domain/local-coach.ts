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

export function pickFuelTipKey(seed = Date.now()): MsgKey {
  const i = Math.abs(seed) % FUEL_TIP_KEYS.length;
  return FUEL_TIP_KEYS[i]!;
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
  const langLine = lang === 'ar' ? 'Reply in Arabic.' : 'Reply in English.';
  return [
    'You are a concise car expense coach for a personal fuel app.',
    langLine,
    'One short paragraph max. No markdown.',
    `Context: ${JSON.stringify(ctx)}`,
    `Question: ${question}`,
  ].join('\n');
}

/** ponytail: free no-key text API; falls back to local templates offline. */
export async function fetchFreeCoachText(prompt: string): Promise<string | null> {
  try {
    const res = await fetch(`https://text.pollinations.ai/${encodeURIComponent(prompt)}`, {
      headers: { Accept: 'text/plain' },
    });
    if (!res.ok) {
      return null;
    }
    const text = (await res.text()).trim().replace(/\s+/g, ' ').slice(0, 480);
    return text.length >= 8 ? text : null;
  } catch {
    return null;
  }
}

export async function fetchFuelTipText(
  db: Db,
  lang: 'en' | 'ar',
  t: (key: MsgKey) => string,
): Promise<string> {
  const key = contextualFuelTipKey(db);
  const fallback = t(key);
  const car = db.car();
  if (!car) {
    return fallback;
  }
  const prompt = coachPrompt(db, t('fuel.tip.prompt'), lang);
  return (await fetchFreeCoachText(prompt)) ?? fallback;
}

export async function fetchCoachReply(
  db: Db,
  question: string,
  lang: 'en' | 'ar',
  t: (key: MsgKey, params?: Record<string, string | number>) => string,
): Promise<string> {
  const prompt = coachPrompt(db, question, lang);
  const remote = await fetchFreeCoachText(prompt);
  if (remote) {
    return remote;
  }
  return localCoachReply(db, question, t);
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
  if (q.includes('economy') || q.includes('fuel') || q.includes('وقود') || q.includes('اقتصاد')) {
    if (fuel.lastL100 != null) {
      return t('assistant.local.economy', { l100: Number(fuel.lastL100.toFixed(1)) });
    }
    return t('assistant.local.economyEmpty');
  }
  if (q.includes('period') || q.includes('spend') || q.includes('مصروف') || q.includes('فترة')) {
    return t('assistant.local.period', {
      total: Math.round(totals.total),
      currency: db.settings().currency,
    });
  }
  if (q.includes('maint') || q.includes('service') || q.includes('صيان')) {
    return t('assistant.local.maint', { count: db.maintenance().length });
  }
  if (q.includes('break') || q.includes('fault') || q.includes('عطل')) {
    return t('assistant.local.breakdown', { count: db.breakdowns().length });
  }
  return t('assistant.local.generic');
}
