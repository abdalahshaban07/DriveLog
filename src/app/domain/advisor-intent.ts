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

export type AdvisorPart = 'oil' | 'tires' | 'brakes';

export type AdvisorWindow = 'period' | 'all' | 'last';

export type AdvisorRead = {
  intent: AdvisorIntent;
  part?: AdvisorPart;
  window: AdvisorWindow;
};

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
      /زيت\s*خلص/,
      /خلص\s*الزيت/,
      /امتي\s*اغير/,
      /امتي\s*غير/,
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
      /بتاكل/,
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
      /صرف/,
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
      /كوتش/,
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

const PART_RULES: { part: AdvisorPart; re: RegExp }[] = [
  { part: 'oil', re: /oil|زيت/ },
  { part: 'tires', re: /tire|كاوتش|كوتش|اطار/ },
  { part: 'brakes', re: /brake|فرامل/ },
];

const PART_SCOPED = new Set<AdvisorIntent>(['PART_STATUS', 'PART_HISTORY', 'MAINTENANCE_PRIORITY']);

function bestIntent(text: string, skip?: ReadonlySet<AdvisorIntent>): AdvisorIntent {
  let best: { intent: AdvisorIntent; score: number; index: number } | null = null;
  for (let index = 0; index < RULES.length; index++) {
    const rule = RULES[index]!;
    if (skip?.has(rule.intent)) continue;
    let score = 0;
    for (const pattern of rule.patterns) {
      const match = text.match(pattern);
      if (match?.[0]) score = Math.max(score, match[0].length);
    }
    if (score === 0) continue;
    if (!best || score > best.score || (score === best.score && index < best.index)) {
      best = { intent: rule.intent, score, index };
    }
  }
  return best?.intent ?? 'UNSUPPORTED';
}

function detectPart(text: string): AdvisorPart | undefined {
  return PART_RULES.find((rule) => rule.re.test(text))?.part;
}

function detectWindow(text: string): AdvisorWindow | undefined {
  const hits: { window: AdvisorWindow; score: number }[] = [];
  const last = text.match(/اخر|اخير|\blast\b|\blatest\b/);
  if (last?.[0]) hits.push({ window: 'last', score: last[0].length });
  const all = text.match(/كل\s|\ball\b/);
  if (all?.[0]) hits.push({ window: 'all', score: all[0].length });
  const period = text.match(/فتره|الشهر|\bmonth\b|\bperiod\b/);
  if (period?.[0]) hits.push({ window: 'period', score: period[0].length });
  hits.sort((a, b) => b.score - a.score);
  return hits[0]?.window;
}

export function defaultWindow(intent: AdvisorIntent): AdvisorWindow {
  switch (intent) {
    case 'PART_HISTORY':
    case 'BREAKDOWN':
    case 'FUEL_SPENDING':
      return 'last';
    case 'RECOMMENDED_RESERVE':
    case 'AFFORDABILITY':
    case 'MAINT_LOG':
    case 'MAINTENANCE_PRIORITY':
    case 'UPCOMING_MAINTENANCE':
    case 'BUDGET_HEALTH':
    case 'SPENDING_TREND':
    case 'PART_STATUS':
    case 'UNSUPPORTED':
      return 'period';
    default: {
      const _e: never = intent;
      return _e;
    }
  }
}

/** Repair/history of a named part is that part's log, not the breakdown counter. */
function withPart(intent: AdvisorIntent, text: string, part?: AdvisorPart): AdvisorIntent {
  if (!part) return intent;
  if (
    /تاريخ|history|تصليح|repair|صلحت/.test(text) &&
    (intent === 'BREAKDOWN' || intent === 'PART_STATUS' || intent === 'PART_HISTORY')
  ) {
    return 'PART_HISTORY';
  }
  return intent;
}

function isFollowUp(text: string): boolean {
  return /^(و|طيب|كمان|برضو|and\b|also\b)/.test(text);
}

export function readAdvisor(raw: string, carry?: AdvisorRead | null): AdvisorRead {
  const text = normalizeAdvisorText(raw);
  if (!text) return { intent: 'UNSUPPORTED', window: 'period' };
  const part = detectPart(text);
  const window = detectWindow(text);
  if (carry && carry.intent !== 'UNSUPPORTED' && isFollowUp(text)) {
    const specific = bestIntent(text, part ? new Set(['PART_STATUS']) : undefined);
    if (specific !== 'UNSUPPORTED') {
      const intent = withPart(specific, text, part ?? carry.part);
      return { intent, part: part ?? carry.part, window: window ?? defaultWindow(intent) };
    }
    if (part) {
      const intent = PART_SCOPED.has(carry.intent) ? carry.intent : 'PART_STATUS';
      return { intent, part, window: window ?? defaultWindow(intent) };
    }
    return { intent: carry.intent, part: carry.part, window: window ?? carry.window };
  }
  const intent = withPart(bestIntent(text), text, part);
  return { intent, part, window: window ?? defaultWindow(intent) };
}

export function detectAdvisorIntent(raw: string): AdvisorIntent {
  return readAdvisor(raw).intent;
}

/** FAQ chips already chose the intent. Keep a part word from the chip text. */
export function forcedAdvisorRead(raw: string, intent: AdvisorIntent): AdvisorRead {
  const text = normalizeAdvisorText(raw);
  return {
    intent,
    part: detectPart(text),
    window: detectWindow(text) ?? defaultWindow(intent),
  };
}

/** FAQ chips already name the intent; that hint wins over the regex. */
export function intentFromFaqKey(key: MsgKey): AdvisorIntent | undefined {
  return FAQ_INTENT[key];
}
