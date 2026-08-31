import { buildDueItems, todayDateOnly } from './dues';
import { activePeriod, daysUntil, periodTotals } from './expense-period';
import { fuelDashboardMetrics } from './fuel-dashboard';
import { pickFuelTipKey } from './local-coach';
import type {
  Breakdown,
  Car,
  DateOnly,
  DueItem,
  ExpensePeriod,
  FillUp,
  Maintenance,
  OtherExpense,
  Settings,
} from './models';

export type RecommendationTone = 'overdue' | 'soon' | 'fuel' | 'spending' | 'tip';

export type RecommendationKind = 'overdue' | 'dueSoon' | 'fuel' | 'spending' | 'localTip';

export interface Recommendation {
  id: string;
  kind: RecommendationKind;
  titleKey: string;
  bodyKey: string;
  bodyParams?: Record<string, string | number>;
  tone: RecommendationTone;
  route?: string;
}

export interface MonthOutlook {
  actual: number;
  projected: number | null;
  elapsedDays: number;
  daysInMonth: number;
  expenseCount: number;
}

const KIND_RANK: Record<RecommendationKind, number> = {
  overdue: 0,
  dueSoon: 1,
  fuel: 2,
  spending: 3,
  localTip: 4,
};

const REC_DUE_SOON_DAYS = 30;
const HIGH_L100 = 10;
const FUEL_DOMINANT_PCT = 60;

function monthPrefix(now: Date): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function monthExpenseCount(
  prefix: string,
  fills: readonly FillUp[],
  maintenance: readonly Maintenance[],
  breakdowns: readonly Breakdown[],
  other: readonly OtherExpense[],
): number {
  let count = 0;
  for (const f of fills) {
    if (f.date.startsWith(prefix)) {
      count++;
    }
  }
  for (const m of maintenance) {
    if (m.date.startsWith(prefix)) {
      count++;
    }
  }
  for (const b of breakdowns) {
    if (b.date.startsWith(prefix)) {
      count++;
    }
  }
  for (const o of other) {
    if (o.date.startsWith(prefix)) {
      count++;
    }
  }
  return count;
}

function monthSpendTotal(
  prefix: string,
  fills: readonly FillUp[],
  maintenance: readonly Maintenance[],
  breakdowns: readonly Breakdown[],
  other: readonly OtherExpense[],
): number {
  let total = 0;
  for (const f of fills) {
    if (f.date.startsWith(prefix)) {
      total += f.cost;
    }
  }
  for (const m of maintenance) {
    if (m.date.startsWith(prefix)) {
      total += m.cost;
    }
  }
  for (const b of breakdowns) {
    if (b.date.startsWith(prefix)) {
      total += b.repairCost;
    }
  }
  for (const o of other) {
    if (o.date.startsWith(prefix)) {
      total += o.amount;
    }
  }
  return total;
}

export function buildMonthOutlook(
  fills: readonly FillUp[],
  maintenance: readonly Maintenance[],
  breakdowns: readonly Breakdown[],
  other: readonly OtherExpense[],
  now: Date = new Date(),
): MonthOutlook {
  const prefix = monthPrefix(now);
  const elapsedDays = now.getDate();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const actual = monthSpendTotal(prefix, fills, maintenance, breakdowns, other);
  const expenseCount = monthExpenseCount(prefix, fills, maintenance, breakdowns, other);
  const projected =
    elapsedDays >= 3 && expenseCount >= 1
      ? Math.round((actual / elapsedDays) * daysInMonth)
      : null;
  return { actual, projected, elapsedDays, daysInMonth, expenseCount };
}

function dueRoute(item: DueItem): string {
  if (item.source === 'maintenance') {
    return '/maintenance';
  }
  return '/settings';
}

function isDueSoonForRec(item: DueItem, currentOdometer: number, today: DateOnly): boolean {
  if (item.status === 'overdue') {
    return false;
  }
  if (item.status === 'dueSoon') {
    return true;
  }
  if (item.dueDate) {
    const left = daysUntil(item.dueDate, today);
    return left >= 0 && left <= REC_DUE_SOON_DAYS;
  }
  if (item.dueKm != null) {
    const kmLeft = item.dueKm - currentOdometer;
    return kmLeft > 0 && kmLeft <= 500;
  }
  return false;
}

function fuelTipKey(fills: readonly FillUp[], car: Car): string {
  const fuel = fuelDashboardMetrics(fills);
  if (fuel.lastL100 != null && fuel.lastL100 > HIGH_L100) {
    return 'fuel.tip.highConsumption';
  }
  if (fills.length < 2) {
    return 'fuel.tip.logMore';
  }
  return pickFuelTipKey(car.currentOdometer);
}

function sortAndCap(candidates: readonly Recommendation[]): Recommendation[] {
  return [...candidates]
    .sort((a, b) => {
      const rank = KIND_RANK[a.kind] - KIND_RANK[b.kind];
      return rank !== 0 ? rank : a.id.localeCompare(b.id);
    })
    .slice(0, 3);
}

export function buildRecommendations(input: {
  settings: Settings;
  car: Car | null;
  fills: readonly FillUp[];
  maintenance: readonly Maintenance[];
  breakdowns: readonly Breakdown[];
  other: readonly OtherExpense[];
  periods: readonly ExpensePeriod[];
  today?: DateOnly;
}): Recommendation[] {
  const today = input.today ?? todayDateOnly();
  const candidates: Recommendation[] = [];

  if (!input.car) {
    return [
      {
        id: 'setup',
        kind: 'localTip',
        titleKey: 'rec.setup.title',
        bodyKey: 'rec.setup.body',
        tone: 'tip',
        route: '/settings',
      },
    ];
  }

  const car = input.car;
  const dueItems = buildDueItems(
    input.settings,
    input.maintenance,
    car.currentOdometer,
    today,
    car,
  );

  for (const item of dueItems.filter((i) => i.status === 'overdue')) {
    candidates.push({
      id: `overdue-${item.id}`,
      kind: 'overdue',
      titleKey: 'rec.overdue.title',
      bodyKey: item.labelKey,
      bodyParams: item.labelParams,
      tone: 'overdue',
      route: dueRoute(item),
    });
  }

  for (const item of dueItems.filter((i) => isDueSoonForRec(i, car.currentOdometer, today))) {
    candidates.push({
      id: `soon-${item.id}`,
      kind: 'dueSoon',
      titleKey: 'rec.dueSoon.title',
      bodyKey: item.labelKey,
      bodyParams: item.labelParams,
      tone: 'soon',
      route: dueRoute(item),
    });
  }

  const fuel = fuelDashboardMetrics(input.fills);
  if (fuel.lastL100 != null && fuel.lastL100 > HIGH_L100) {
    candidates.push({
      id: 'fuel-high',
      kind: 'fuel',
      titleKey: 'rec.fuel.high.title',
      bodyKey: 'rec.fuel.high.body',
      bodyParams: { l100: Number(fuel.lastL100.toFixed(1)) },
      tone: 'fuel',
      route: '/fuel',
    });
  } else if (fuel.lastL100 == null && input.fills.length > 0) {
    candidates.push({
      id: 'fuel-full',
      kind: 'fuel',
      titleKey: 'rec.fuel.full.title',
      bodyKey: 'rec.fuel.full.body',
      tone: 'fuel',
      route: '/fill-up',
    });
  } else if (input.fills.length < 2) {
    candidates.push({
      id: 'fuel-log',
      kind: 'fuel',
      titleKey: 'rec.fuel.log.title',
      bodyKey: 'rec.fuel.log.body',
      tone: 'fuel',
      route: '/fill-up',
    });
  }

  const period = activePeriod(input.periods, car.id);
  const totals = periodTotals(
    period,
    input.fills,
    input.maintenance,
    input.breakdowns,
    input.other,
  );
  if (totals.total > 0) {
    const fuelPct = Math.round((totals.fuel / totals.total) * 100);
    if (fuelPct >= FUEL_DOMINANT_PCT) {
      candidates.push({
        id: 'spend-fuel',
        kind: 'spending',
        titleKey: 'rec.spend.fuel.title',
        bodyKey: 'rec.spend.fuel.body',
        bodyParams: { pct: fuelPct },
        tone: 'spending',
        route: '/fill-up',
      });
    } else if (totals.breakdowns > 0 && totals.breakdowns / totals.total >= 0.2) {
      candidates.push({
        id: 'spend-break',
        kind: 'spending',
        titleKey: 'rec.spend.break.title',
        bodyKey: 'rec.spend.break.body',
        bodyParams: {
          pct: Math.round((totals.breakdowns / totals.total) * 100),
        },
        tone: 'spending',
        route: '/breakdowns',
      });
    } else if (totals.maintenance > totals.fuel && totals.maintenance > 0) {
      candidates.push({
        id: 'spend-maint',
        kind: 'spending',
        titleKey: 'rec.spend.maint.title',
        bodyKey: 'rec.spend.maint.body',
        bodyParams: {
          pct: Math.round((totals.maintenance / totals.total) * 100),
        },
        tone: 'spending',
        route: '/maintenance',
      });
    }
  }

  const outlook = buildMonthOutlook(
    input.fills,
    input.maintenance,
    input.breakdowns,
    input.other,
  );
  if (outlook.actual > 0 && outlook.projected != null && outlook.projected > outlook.actual * 1.25) {
    candidates.push({
      id: 'spend-pace',
      kind: 'spending',
      titleKey: 'rec.spend.pace.title',
      bodyKey: 'rec.spend.pace.body',
      tone: 'spending',
    });
  }

  candidates.push({
    id: 'tip-local',
    kind: 'localTip',
    titleKey: 'rec.tip.title',
    bodyKey: fuelTipKey(input.fills, car),
    tone: 'tip',
    route: '/fuel',
  });

  return sortAndCap(candidates);
}
