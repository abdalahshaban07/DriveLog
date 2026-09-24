import { fuelDashboardMetrics } from './fuel-dashboard';
import { periodTotals, activePeriod } from './expense-period';
import { createLocalAdvisor } from './smart-advisor';
import { buildVehicleFacts } from './vehicle-facts';
import type { Db } from '../data/db';
import type { MsgKey } from '../i18n/en';

export const FUEL_TIP_KEYS = [
  'fuel.tip.fullTank',
  'fuel.tip.tirePressure',
  'fuel.tip.noIdle',
  'fuel.tip.compareGrades',
] as const satisfies readonly MsgKey[];

export type CoachSource = 'local' | 'remote';

export type CoachReply = {
  text: string;
  source: CoachSource;
};

export function pickFuelTipKey(seed = Date.now()): MsgKey {
  const i = Math.abs(seed) % FUEL_TIP_KEYS.length;
  return FUEL_TIP_KEYS[i]!;
}

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

export async function fetchFuelTipText(
  db: Db,
  _lang: 'en' | 'ar',
  t: (key: MsgKey) => string,
): Promise<CoachReply> {
  const key = contextualFuelTipKey(db);
  return { text: t(key), source: 'local' };
}

export type CoachIntent = 'economy' | 'period' | 'maint' | 'breakdown' | 'generic';

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

export async function fetchCoachReply(
  db: Db,
  question: string,
  _lang: 'en' | 'ar',
  t: (key: MsgKey, params?: Record<string, string | number>) => string,
  intentHint?: CoachIntent,
): Promise<CoachReply> {
  const facts = buildVehicleFacts(db);
  if (facts) {
    const advisor = createLocalAdvisor();
    const res = advisor.ask(question, facts);
    const text = `${t(res.titleKey as MsgKey)} ${t(res.bodyKey as MsgKey)}`.trim();
    return { text, source: 'local' };
  }
  return { text: localCoachReply(db, question, t, intentHint), source: 'local' };
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
