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
  | 'COACH_ADVICE'
  | 'UNSUPPORTED';

export type AdvisorPart = 'oil' | 'tires' | 'brakes';

export type AdvisorWindow = 'period' | 'all' | 'last' | 'prev';

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
    patterns: [/afford/i, /worth it/i, /اقدر/, /اقدر\s*اغير/],
  },
  {
    intent: 'BREAKDOWN',
    patterns: [
      /break/i,
      /broke\b/i,
      /fault/i,
      /repair/i,
      /stopped working/i,
      /won'?t start/i,
      /عطل/,
      /اعطال/,
      /عواطل/,
      /مشكل/,
      /صلحت/,
      /تصليح/,
      /خربان/,
      /خربت/,
      /بايظ/,
      /واقفه/,
      /(عربيه|سياره).{0,6}طالع/,
      /مش شغال/,
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
      /how many (services|maintenance|records)/i,
      /maintenance have i logged/i,
      /logged/i,
      /records? (i|have|on)/i,
      /كام سجل/,
      /سجل\s*صيان/,
      /كام صيان/,
      /كم\s*(صيان|سجل|خدمه|تصليح)/,
      /عدد.{0,6}(سجل|عليها|نقطة|نقطه)/,
    ],
  },
  {
    intent: 'MAINTENANCE_PRIORITY',
    patterns: [
      /priorit/i,
      /what.*(due|first)/i,
      /which.*first/i,
      /first service|service.*first/i,
      /اولوي/,
      /اغير\s*الزيت/,
      /غير\s*الزيت/,
      /تغيير\s*زيت/,
      /oil change/i,
      /زيت\s*خلص/,
      /خلص\s*الزيت/,
      /امتي\s*اغير/,
      /امتي\s*غير/,
      /عايز\s*اغير/,
      /محتاج\s*اغير/,
      /ينقص\s*زيت/,
    ],
  },
  {
    intent: 'UPCOMING_MAINTENANCE',
    patterns: [
      /upcoming/i,
      /coming\s*up/i,
      /next service/i,
      /needs.{0,8}next/i,
      /قادم/,
      /جاي/,
      /جايه/,
      /قرب/,
      /هتحتاج/,
    ],
  },
  {
    intent: 'BUDGET_HEALTH',
    patterns: [/budget/i, /ميزاني/, /موازنه/, /خزنه/, /خزنة/, /in budget/i],
  },
  {
    intent: 'FUEL_SPENDING',
    patterns: [
      /economy/i,
      /fuel/i,
      /consum\w*/i,
      /mpg/i,
      /kmpl/i,
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
      /محروقات/,
      /tank\b/i,
      /بشرب\s*(بنزين)?/,
      /petrol|\bgas\b/i,
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
      /\btotal\b/i,
      /مصروف/,
      /صرف/,
      /(?<!ت)سرف/,
      /دفعت/,
      /دفع/,
      /فلوس/,
      /كلفن/,
      /كلف/,
      /فتره/,
      /حساب/,
      /اجماعي?/,
      /مجموع/,
      /فاتورة|فاتوره/i,
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
      /battery/i,
      /بطاري[هة]/,
      /ضغط/,
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
  return scoreAdvisorIntents(text, skip)[0]?.intent ?? 'UNSUPPORTED';
}

/** Ranked intent scores for the folded text; zero-hit intents are dropped. */
export function scoreAdvisorIntents(
  raw: string,
  skip?: ReadonlySet<AdvisorIntent>,
): { intent: AdvisorIntent; score: number }[] {
  const text = normalizeAdvisorText(raw);
  const scored: { intent: AdvisorIntent; score: number; index: number }[] = [];
  for (let index = 0; index < RULES.length; index++) {
    const rule = RULES[index]!;
    if (skip?.has(rule.intent)) continue;
    let score = 0;
    for (const pattern of rule.patterns) {
      const match = text.match(pattern);
      if (match?.[0]) score = Math.max(score, match[0].length);
    }
    if (score > 0) scored.push({ intent: rule.intent, score, index });
  }
  // Longer match wins; ties fall back to rule order for stable answers.
  scored.sort((a, b) => b.score - a.score || a.index - b.index);
  return scored.map(({ intent, score }) => ({ intent, score }));
}

function detectPart(text: string): AdvisorPart | undefined {
  return PART_RULES.find((rule) => rule.re.test(text))?.part;
}

function detectWindow(text: string): AdvisorWindow | undefined {
  const hits: { window: AdvisorWindow; score: number }[] = [];
  const prev = text.match(/اللي\s*فات|الشهر\s*الماضي|previous|last\s*month/);
  if (prev?.[0]) hits.push({ window: 'prev', score: prev[0].length + 1 });
  const last = text.match(/اخر|اخير|\blast\b|\blatest\b/);
  if (last?.[0]) hits.push({ window: 'last', score: last[0].length });
  const all = text.match(/كل\s|\ball\b/);
  if (all?.[0]) hits.push({ window: 'all', score: all[0].length });
  const period = text.match(/فتره|الشهر|\bmonth\b|\bperiod\b/);
  if (period?.[0]) hits.push({ window: 'period', score: period[0].length });
  hits.sort((a, b) => b.score - a.score);
  return hits[0]?.window;
}

function defaultWindow(intent: AdvisorIntent): AdvisorWindow {
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
    case 'COACH_ADVICE':
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

/** «ازاي احسن/وفر…», «أحسّن», «نصيحة» ask for a method, not the numbers card. */
function isAdviceAsk(raw: string): boolean {
  const text = normalizeAdvisorText(raw);
  return (
    /ازاي\s*(احسن|حسن|وفر|اوفر|تقلل|انقص|نظبط|أظبط|اغير|غير|اختار|اعرف)/.test(text) ||
    /احسن|تحسين|نصيح|راي|ارشد|how (do|can|to)|improve|\btip\b|advice|what should|best way/.test(text)
  );
}

/** A spend word next to a part word asks for that part's cost history. */
const SPEND_WORD = /صرفت|صرف|تكلف|كام|فلوس|how much|cost|paid|spent/i;
const STATUS_WORD = /حاله|عامل|وضع|status|health|تمام|خربان/i;

function partScopedIntent(intent: AdvisorIntent, text: string, part?: AdvisorPart): AdvisorIntent {
  const scoped = withPart(intent, text, part);
  if (scoped !== 'PART_STATUS' || !part) return scoped;
  if (SPEND_WORD.test(text) && !STATUS_WORD.test(text)) return 'PART_HISTORY';
  return scoped;
}

/** A fuel word beside generic spend wording makes it the fuel question. */
const FUEL_WORD = /petrol|\bgas\b|fuel|بنزين|وقود|استهلاك|بتشرب|بتاكل/;

function scopeIntent(intent: AdvisorIntent, text: string, part?: AdvisorPart): AdvisorIntent {
  const scoped = partScopedIntent(intent, text, part);
  if (scoped === 'SPENDING_TREND' && !part && FUEL_WORD.test(text)) return 'FUEL_SPENDING';
  return scoped;
}

export function readAdvisor(raw: string, carry?: AdvisorRead | null): AdvisorRead {
  const text = normalizeAdvisorText(raw);
  if (!text) return { intent: 'UNSUPPORTED', window: 'period' };
  if (isAdviceAsk(text)) return { intent: 'COACH_ADVICE', window: 'period' };
  const part = detectPart(text);
  const window = detectWindow(text);
  const carryOn = (intent: AdvisorIntent, partSlot?: AdvisorPart): AdvisorRead => ({
    intent,
    part: partSlot,
    window: window ?? defaultWindow(intent),
  });
  if (carry && carry.intent !== 'UNSUPPORTED' && (isFollowUp(text) || window)) {
    const specific = bestIntent(text, part ? new Set(['PART_STATUS']) : undefined);
    if (specific !== 'UNSUPPORTED') {
      const intent = scopeIntent(specific, text, part ?? carry.part);
      return carryOn(intent, part ?? carry.part);
    }
    if (part) {
      const intent = PART_SCOPED.has(carry.intent) ? carry.intent : 'PART_STATUS';
      return carryOn(intent, part);
    }
    // A bare window shift like «والشهر اللي فات؟» keeps the last intent, new window.
    if (isFollowUp(text) || window) {
      return { intent: carry.intent, part: carry.part, window: window ?? carry.window };
    }
  }
  const intent = scopeIntent(bestIntent(text), text, part);
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
