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
  | 'PART_COST'
  | 'SERVICE_LIST'
  | 'SPEND_COMPARE'
  | 'COACH_ADVICE'
  | 'UNSUPPORTED';

export type AdvisorPart = 'oil' | 'tires' | 'brakes';

export type AdvisorWindow = 'period' | 'all' | 'last' | 'prev' | 'range';

/** A date window the question names. Years resolve against "today" at answer time. */
export type AdvisorRange =
  | { kind: 'yearToDate' }
  | { kind: 'month'; month: number }
  | { kind: 'lastMonths'; count: number };

export type AdvisorRead = {
  intent: AdvisorIntent;
  part?: AdvisorPart;
  window: AdvisorWindow;
  range?: AdvisorRange;
  /** «آخر ٣ صيانات» — how many rows to list. */
  count?: number;
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
    intent: 'SERVICE_LIST',
    patterns: [
      /last\s+\d*\s*(services?|maintenance|repairs?)/i,
      /recent\s+(services?|maintenance|repairs?)/i,
      /اخر\s*([0-9٠-٩]+\s*)?(صيان|خدم)/,
      /(صيانات|خدمات)\s*الاخير/,
    ],
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

const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';

/** Western + Eastern Arabic digits → a plain number. */
function parseDigits(raw: string): number | undefined {
  const western = raw.replace(/[٠-٩]/g, (d) => String(ARABIC_DIGITS.indexOf(d)));
  const n = Number.parseInt(western, 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

const WORD_NUMBERS: Record<string, number> = {
  واحد: 1,
  واحده: 1,
  اتنين: 2,
  تنين: 2,
  تلاته: 3,
  تلات: 3,
  اربعه: 4,
  خمسه: 5,
  سته: 6,
  سبعه: 7,
  تمنيه: 8,
  تسعه: 9,
  عشره: 10,
};

const COUNT_WORD = /([0-9]+|[٠-٩]+|اتنين|تنين|تلاته?|اربعه|خمسه|سته|سبعه|تمنيه|تسعه|عشره)/;

function parseCount(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  if (/[0-9٠-٩]/.test(raw)) return parseDigits(raw);
  return WORD_NUMBERS[raw];
}

/** «آخر ٣ / تلاتة / صيانتين» — digits, number words, and the dual form. */
function detectCount(text: string): number | undefined {
  if (/صيانتين|خدمتين|سجلتين|شهرين/.test(text)) return 2;
  const match = text.match(COUNT_WORD);
  const n = parseCount(match?.[1]);
  return n == null ? undefined : Math.min(n, 10);
}

const AR_MONTHS: readonly string[] = [
  'يناير',
  'فبراير',
  'مارس',
  'ابريل',
  'مايو',
  'يونيو',
  'يونيه',
  'يوليو',
  'يوليه',
  'اغسطس',
  'سبتمبر',
  'اكتوبر',
  'نوفمبر',
  'ديسمبر',
];

const AR_MONTH_INDEX: Record<string, number> = {
  يناير: 1,
  فبراير: 2,
  مارس: 3,
  ابريل: 4,
  مايو: 5,
  يونيو: 6,
  يونيه: 6,
  يوليو: 7,
  يوليه: 7,
  اغسطس: 8,
  سبتمبر: 9,
  اكتوبر: 10,
  نوفمبر: 11,
  ديسمبر: 12,
};

// No "may": the modal verb false-positives constantly ("it may be time").
const EN_MONTHS: Record<string, number> = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
};

/** A named date window: «من أول السنة»، «آخر ٣ شهور»، «في مارس». */
function detectRange(text: string): AdvisorRange | undefined {
  if (/من\s*اول\s*السن[هة]|من\s*بداي[هة]\s*السن[هة]|this\s*year|year\s*to\s*date|\bytd\b/.test(text)) {
    return { kind: 'yearToDate' };
  }
  if (/اخر\s*شهرين/.test(text)) return { kind: 'lastMonths', count: 2 };
  const last = text.match(new RegExp(`اخر\\s*${COUNT_WORD.source}\\s*شه?ور|last\\s+(\\d+)\\s*months?`));
  if (last) {
    const count = parseCount(last[1] ?? last[2]);
    if (count != null) return { kind: 'lastMonths', count: Math.min(count, 24) };
  }
  for (const month of AR_MONTHS) {
    if (text.includes(month)) return { kind: 'month', month: AR_MONTH_INDEX[month]! };
  }
  const en = text.match(/\b(january|february|march|april|june|july|august|september|october|november|december)\b/);
  if (en) return { kind: 'month', month: EN_MONTHS[en[1]!]! };
  return undefined;
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
    case 'SPEND_COMPARE':
    case 'MAINTENANCE_PRIORITY':
    case 'UPCOMING_MAINTENANCE':
    case 'BUDGET_HEALTH':
    case 'SPENDING_TREND':
    case 'PART_STATUS':
    case 'COACH_ADVICE':
    case 'UNSUPPORTED':
      return 'period';
    case 'PART_COST':
      return 'all';
    case 'SERVICE_LIST':
      return 'last';
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
    /احسن|تحسين|نصيح|ارشد|how (do|can|to)|improve|\btip\b|advice|what should|best way/.test(text) ||
    /(^|\s)رايك?(\s|$)/.test(text)
  );
}

/** A spend word next to a part word asks for that part's cost history. */
const SPEND_WORD = /صرفت|صرف|تكلف|كام|فلوس|how much|cost|paid|spent/i;
const STATUS_WORD = /حاله|عامل|وضع|ضغط|status|health|pressure|تمام|خربان/i;

function partScopedIntent(intent: AdvisorIntent, text: string, part?: AdvisorPart): AdvisorIntent {
  const scoped = withPart(intent, text, part);
  if (!part) return scoped;
  if (
    (scoped === 'PART_STATUS' || scoped === 'PART_HISTORY' || scoped === 'SPENDING_TREND') &&
    SPEND_WORD.test(text) &&
    !STATUS_WORD.test(text)
  ) {
    return 'PART_COST';
  }
  return scoped;
}

/** A fuel word beside generic spend wording makes it the fuel question. */
const FUEL_WORD = /petrol|\bgas\b|fuel|بنزين|وقود|استهلاك|بتشرب|بتاكل/;

/** «قارن الشهر ده باللي فات» — a compare ask on top of the spend question. */
const COMPARE_WORD = /قارن|مقارن[هة]?|compare|versus|\bvs\b/;

function scopeIntent(intent: AdvisorIntent, text: string, part?: AdvisorPart): AdvisorIntent {
  const scoped = partScopedIntent(intent, text, part);
  if (scoped === 'SPENDING_TREND' && COMPARE_WORD.test(text)) return 'SPEND_COMPARE';
  if (scoped === 'SPENDING_TREND' && !part && FUEL_WORD.test(text)) return 'FUEL_SPENDING';
  return scoped;
}

export function readAdvisor(raw: string, carry?: AdvisorRead | null): AdvisorRead {
  const text = normalizeAdvisorText(raw);
  if (!text) return { intent: 'UNSUPPORTED', window: 'period' };
  if (isAdviceAsk(text)) return { intent: 'COACH_ADVICE', window: 'period' };
  const part = detectPart(text);
  const range = detectRange(text);
  const window: AdvisorWindow | undefined = range ? 'range' : detectWindow(text);
  const count = detectCount(text);
  const withExtras = (read: AdvisorRead): AdvisorRead => ({
    ...read,
    range: range ?? read.range,
    count: read.intent === 'SERVICE_LIST' ? (count ?? read.count) : undefined,
  });
  const carryOn = (intent: AdvisorIntent, partSlot?: AdvisorPart): AdvisorRead =>
    withExtras({ intent, part: partSlot, window: window ?? defaultWindow(intent) });
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
    return {
      intent: carry.intent,
      part: carry.part,
      window: window ?? carry.window,
      range: range ?? (window ? undefined : carry.range),
      count: carry.intent === 'SERVICE_LIST' ? (count ?? carry.count) : undefined,
    };
  }
  const intent = scopeIntent(bestIntent(text), text, part);
  return withExtras({ intent, part, window: window ?? defaultWindow(intent) });
}

export function detectAdvisorIntent(raw: string): AdvisorIntent {
  return readAdvisor(raw).intent;
}

/** FAQ chips already chose the intent. Keep a part word from the chip text. */
export function forcedAdvisorRead(raw: string, intent: AdvisorIntent): AdvisorRead {
  const text = normalizeAdvisorText(raw);
  const range = detectRange(text);
  return {
    intent,
    part: detectPart(text),
    window: range ? 'range' : (detectWindow(text) ?? defaultWindow(intent)),
    range,
    count: intent === 'SERVICE_LIST' ? detectCount(text) : undefined,
  };
}

/** FAQ chips already name the intent; that hint wins over the regex. */
export function intentFromFaqKey(key: MsgKey): AdvisorIntent | undefined {
  return FAQ_INTENT[key];
    }
