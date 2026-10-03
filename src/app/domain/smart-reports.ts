import { tankEconomyVsAvg } from './economy';
import { fuelDashboardMetrics } from './fuel-dashboard';
import { inActivePeriod, periodTotals, type PeriodTotals } from './expense-period';
import type {
  Breakdown,
  ExpenseCategory,
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

export interface ReportMixSlice {
  key: ExpenseCategory;
  amount: number;
  pct: number;
}

export interface ReportBrief {
  liters: number;
  fillCount: number;
  distanceKm: number;
  maintCount: number;
  mix: ReportMixSlice[];
}

function datedInPeriod<T extends { date: string }>(
  rows: readonly T[],
  period: ExpensePeriod | null,
): readonly T[] {
  if (!period) {
    return rows;
  }
  return rows.filter((row) => inActivePeriod(row.date, period));
}

/** Period fuel volume plus the spend mix behind the reports hero. */
export function buildReportBrief(input: {
  fills: readonly FillUp[];
  maintenance: readonly Maintenance[];
  period: ExpensePeriod | null;
  totals: PeriodTotals;
}): ReportBrief {
  const fills = datedInPeriod(input.fills, input.period);
  const parts: [ExpenseCategory, number][] = [
    ['fuel', input.totals.fuel],
    ['maintenance', input.totals.maintenance],
    ['breakdown', input.totals.breakdowns],
    ['other', input.totals.other],
  ];
  return {
    liters: fills.reduce((sum, fill) => sum + fill.liters, 0),
    fillCount: fills.length,
    distanceKm: fills.reduce((sum, fill) => sum + (fill.distanceKm ?? 0), 0),
    maintCount: datedInPeriod(input.maintenance, input.period).length,
    mix: parts
      .filter(([, amount]) => amount > 0)
      .map(([key, amount]) => ({
        key,
        amount,
        pct: input.totals.total > 0 ? Math.round((amount / input.totals.total) * 100) : 0,
      })),
  };
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

  const vsAvg = tankEconomyVsAvg(input.fills);
  const fuel = fuelDashboardMetrics(input.fills);
  if (vsAvg) {
    const pct = Math.round(Math.abs(vsAvg.deltaPct));
    cards.push({
      id: 'economy',
      titleKey: 'reports.economyTitle',
      bodyKey: `reports.economy.${vsAvg.direction}`,
      bodyParams: {
        current: vsAvg.currentL100,
        baseline: vsAvg.baselineL100,
        pct,
      },
      tone: 'fuel',
    });
  } else if (fuel.lastL100 != null) {
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

  const maintInPeriod = datedInPeriod(input.maintenance, input.period).length;
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
