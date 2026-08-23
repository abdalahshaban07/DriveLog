import { fuelDashboardMetrics } from './fuel-dashboard';
import { periodTotals, type PeriodTotals } from './expense-period';
import { nextMilestone, kmRemaining } from './milestones';
import type {
  Breakdown,
  ExpensePeriod,
  FillUp,
  Maintenance,
  MaintenanceMilestone,
  OtherExpense,
} from './models';

export interface SmartReportCard {
  id: string;
  titleKey: string;
  bodyKey: string;
  bodyParams?: Record<string, string | number>;
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
  milestones: readonly MaintenanceMilestone[];
  odometer: number;
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
    });
  } else {
    cards.push({
      id: 'biggest',
      titleKey: 'reports.biggestTitle',
      bodyKey: 'reports.biggest.empty',
    });
  }

  const fuel = fuelDashboardMetrics(input.fills);
  if (fuel.lastL100 != null) {
    cards.push({
      id: 'economy',
      titleKey: 'reports.economyTitle',
      bodyKey: 'reports.economy.body',
      bodyParams: { l100: Number(fuel.lastL100.toFixed(1)) },
    });
  } else {
    cards.push({
      id: 'economy',
      titleKey: 'reports.economyTitle',
      bodyKey: 'reports.economy.empty',
    });
  }

  const next = nextMilestone(input.milestones, input.odometer);
  if (next) {
    cards.push({
      id: 'maint',
      titleKey: 'reports.maintTitle',
      bodyKey: 'reports.maint.body',
      bodyParams: {
        km: kmRemaining(next.targetKm, input.odometer),
        target: next.targetKm,
      },
    });
  } else {
    cards.push({
      id: 'maint',
      titleKey: 'reports.maintTitle',
      bodyKey: 'reports.maint.empty',
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
  });

  return cards;
}
