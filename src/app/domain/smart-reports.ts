import { fuelDashboardMetrics } from './fuel-dashboard';
import { periodTotals, type PeriodTotals } from './expense-period';
import type {
  Breakdown,
  ExpensePeriod,
  FillUp,
  Maintenance,
  OtherExpense,
} from './models';

export type ReportTone = 'fuel' | 'maintenance' | 'breakdown' | 'other';

export interface SmartReportCard {
  id: string;
  titleKey: string;
  bodyKey: string;
  bodyParams?: Record<string, string | number>;
  tone: ReportTone;
}

function topCategory(t: PeriodTotals): { key: string; pct: number } | null {
  if (t.total <= 0) {
    return null;
  }
  const entries: [string, number][] = [
    ['maintenance', t.maintenance],
    ['fuel', t.fuel],
    ['breakdowns', t.breakdowns],
    ['other', t.other],
  ];
  entries.sort((a, b) => b[1]! - a[1]!);
  const [key, amount] = entries[0]!;
  return { key, pct: Math.round((amount / t.total) * 100) };
}

export function buildSmartReports(input: {
  fills: readonly FillUp[];
  maintenance: readonly Maintenance[];
  breakdowns: readonly Breakdown[];
  other: readonly OtherExpense[];
  period: ExpensePeriod | null;
}): SmartReportCard[] {
  const cards: SmartReportCard[] = [];
  const totals = periodTotals(
    input.period,
    input.fills,
    input.maintenance,
    input.breakdowns,
    input.other,
  );
  const top = topCategory(totals);
  if (top) {
    cards.push({
      id: 'biggest',
      titleKey: 'reports.biggestTitle',
      bodyKey: `reports.biggest.${top.key}`,
      bodyParams: { pct: top.pct },
      tone: top.key === 'breakdowns' ? 'breakdown' : (top.key as ReportTone),
    });
  } else {
    cards.push({
      id: 'biggest',
      titleKey: 'reports.biggestTitle',
      bodyKey: 'reports.biggest.empty',
      tone: 'other',
    });
  }

  const fuel = fuelDashboardMetrics(input.fills);
  if (fuel.lastL100 != null) {
    cards.push({
      id: 'economy',
      titleKey: 'reports.economyTitle',
      bodyKey: 'reports.economy.body',
      bodyParams: { l100: fuel.lastL100 },
      tone: 'fuel',
    });
  } else {
    cards.push({
      id: 'economy',
      titleKey: 'reports.economyTitle',
      bodyKey: 'reports.economy.empty',
      tone: 'fuel',
    });
  }

  const maintInPeriod = input.maintenance.length;
  if (maintInPeriod > 0) {
    cards.push({
      id: 'maint',
      titleKey: 'reports.maintTitle',
      bodyKey: 'reports.maint.count',
      bodyParams: { count: maintInPeriod },
      tone: 'maintenance',
    });
  } else {
    cards.push({
      id: 'maint',
      titleKey: 'reports.maintTitle',
      bodyKey: 'reports.maint.empty',
      tone: 'maintenance',
    });
  }

  const recurring = input.breakdowns.filter((b) =>
    input.breakdowns.some(
      (o) => o.id !== b.id && o.category === b.category && o.symptom === b.symptom,
    ),
  );
  cards.push({
    id: 'breakdown',
    titleKey: 'reports.breakdownTitle',
    bodyKey: recurring.length ? 'reports.breakdown.recurring' : 'reports.breakdown.none',
    bodyParams: recurring.length ? { count: recurring.length } : undefined,
    tone: 'breakdown',
  });

  return cards;
}
