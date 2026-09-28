/** One local intent table for Ask DriveLog. Most specific rule wins. */

import type { MsgKey } from '../i18n/en';

export type AdvisorIntent =
  | 'RECOMMENDED_RESERVE'
  | 'AFFORDABILITY'
  | 'BREAKDOWN'
  | 'PART_HISTORY'
  | 'MAINT_LOG'
  | 'MAINTENANCE_PRIORITY'
  | 'UPCOMING_MAINTENANCE'
  | 'BUDGET_HEALTH'
  | 'FUEL_SPENDING'
  | 'SPENDING_TREND'
  | 'PART_STATUS'
  | 'UNSUPPORTED';

const RULES: { intent: AdvisorIntent; patterns: RegExp[] }[] = [
  {
    intent: 'RECOMMENDED_RESERVE',
    patterns: [/reserve/i, /احتياط/],
  },
  {
    intent: 'AFFORDABILITY',
    patterns: [/afford/i, /اقدر/],
  },
  {
    intent: 'BREAKDOWN',
    patterns: [
      /break/i,
      /fault/i,
      /repair/i,
      /عطل/,
      /اعطال/,
      /عواطل/,
      /مشكل/,
      /صلحت/,
      /تصليح/,
      /خربان/,
    ],
  },
  {
    intent: 'PART_HISTORY',
    patterns: [/history/i, /تاريخ/],
  },
  {
    intent: 'MAINT_LOG',
    patterns: [
      /how much maintenance/i,
      /maintenance have i logged/i,
      /logged/i,
      /كام سجل/,
      /سجل\s*صيان/,
    ],
  },
  {
    intent: 'MAINTENANCE_PRIORITY',
    patterns: [
      /priorit/i,
      /what.*(due|first)/i,
      /اولوي/,
      /اغير\s*الزيت/,
      /غير\s*الزيت/,
      /تغيير\s*زيت/,
      /oil change/i,
    ],
  },
  {
    intent: 'UPCOMING_MAINTENANCE',
    patterns: [/upcoming/i, /coming\s*up/i, /قادم/, /جاي/],
  },
  {
    intent: 'BUDGET_HEALTH',
    patterns: [/budget/i, /ميزاني/],
  },
  {
    intent: 'FUEL_SPENDING',
    patterns: [
      /economy/i,
      /fuel/i,
      /consumption/i,
      /mpg/i,
      /l\/100/i,
      /بنزين/,
      /وقود/,
      /استهلاك/,
      /تستهلك/,
      /ستهلك/,
      /(?<!ف)لتر/,
      /تنك/,
      /اقتصاد/,
      /توفير/,
      /اوفر/,
      /سواقه/,
    ],
  },
  {
    intent: 'SPENDING_TREND',
    patterns: [
      /trend/i,
      /spending/i,
      /expense/i,
      /\bcost\b/i,
      /period/i,
      /مصروف/,
      /صرفت/,
      /دفعت/,
      /دفع/,
      /فلوس/,
      /كلفن/,
      /كلف/,
      /فتره/,
      /حساب/,
    ],
  },
  {
    intent: 'PART_STATUS',
    patterns: [
      /status/i,
      /health/i,
      /oil/i,
      /tire/i,
      /brake/i,
      /كاوتش/,
      /اطار/,
      /فرامل/,
      /حاله/,
      /صيان/,
      /زيت/,
      /فلتر/,
      /خدمه/,
    ],
  },
];

const FAQ_INTENT: Partial<Record<MsgKey, AdvisorIntent>> = {
  'assistant.faq.economy': 'FUEL_SPENDING',
  'assistant.faq.period': 'SPENDING_TREND',
  'assistant.faq.maintenance': 'MAINT_LOG',
  'assistant.faq.breakdown': 'BREAKDOWN',
};

export function normalizeAdvisorText(raw: string): string {
  return raw
    .normalize('NFKD')
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function detectAdvisorIntent(raw: string): AdvisorIntent {
  const text = normalizeAdvisorText(raw);
  if (!text) return 'UNSUPPORTED';
  for (const rule of RULES) {
    if (rule.patterns.some((p) => p.test(text))) return rule.intent;
  }
  return 'UNSUPPORTED';
}

/** FAQ chips already name the intent; that hint wins over the regex. */
export function intentFromFaqKey(key: MsgKey): AdvisorIntent | undefined {
  return FAQ_INTENT[key];
}
