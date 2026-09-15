/** Local intent detection for Ask DriveLog (spec §45). */

export type AdvisorIntent =
  | 'RECOMMENDED_RESERVE'
  | 'MAINTENANCE_PRIORITY'
  | 'FUEL_SPENDING'
  | 'UPCOMING_MAINTENANCE'
  | 'SPENDING_TREND'
  | 'AFFORDABILITY'
  | 'BUDGET_HEALTH'
  | 'PART_STATUS'
  | 'PART_HISTORY'
  | 'UNSUPPORTED';

const RULES: { intent: AdvisorIntent; patterns: RegExp[] }[] = [
  {
    intent: 'RECOMMENDED_RESERVE',
    patterns: [/reserve/i, /احتياط/i, /احتياطي/i],
  },
  {
    intent: 'MAINTENANCE_PRIORITY',
    patterns: [/priorit/i, /what.*(due|first)/i, /اولوي/i, /أولوي/i],
  },
  {
    intent: 'FUEL_SPENDING',
    patterns: [/fuel\s*spend/i, /gas\s*spend/i, /صرف.*بنزين/i, /وقود/i],
  },
  {
    intent: 'UPCOMING_MAINTENANCE',
    patterns: [/upcoming/i, /coming\s*up/i, /قادم/i, /جاي/i],
  },
  {
    intent: 'SPENDING_TREND',
    patterns: [/trend/i, /spending/i, /اتجاه/i, /مصروف/i],
  },
  {
    intent: 'AFFORDABILITY',
    patterns: [/afford/i, /can i/i, /اقدر/i, /أقدر/i],
  },
  {
    intent: 'BUDGET_HEALTH',
    patterns: [/budget/i, /ميزاني/i],
  },
  {
    intent: 'PART_HISTORY',
    patterns: [/history/i, /سجل/i, /تاريخ/i],
  },
  {
    intent: 'PART_STATUS',
    patterns: [/status/i, /health/i, /oil/i, /tire/i, /brake/i, /حالة/i, /صيانة/i],
  },
];

export function normalizeAdvisorText(raw: string): string {
  return raw
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/\s+/g, ' ');
}

export function detectAdvisorIntent(raw: string): AdvisorIntent {
  const text = normalizeAdvisorText(raw);
  if (!text) return 'UNSUPPORTED';
  for (const rule of RULES) {
    if (rule.patterns.some((p) => p.test(text))) return rule.intent;
  }
  return 'UNSUPPORTED';
}
