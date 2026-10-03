import type { ForecastBucket } from '../../domain/maintenance-forecast';

export type BudgetRung = 'minimum' | 'recommended' | 'comfortable';

export type BudgetPicture = {
  figure: 'remaining' | 'recommended' | 'empty';
  figureAmount: number;
  spentPct: number;
  over: boolean;
  overAmount: number;
  coverage: number | null;
  balancePct: number;
  fill: 'none' | 'short' | 'met' | 'set';
  gap: number | null;
  marks: { key: BudgetRung; amount: number; pct: number; met: boolean }[];
  bars: {
    months: number;
    total: number;
    widthPct: number;
    known: number;
    estimated: number;
    unknownCount: number;
  }[];
  hasForecast: boolean;
  mileageNote: boolean;
};

export type BudgetPictureInput = {
  monthlyBudget: number | null;
  spent: number;
  remaining: number | null;
  reserve: number | null;
  eligible90: number;
  tiers: {
    minimum: number | null;
    recommended: number | null;
    comfortable: number | null;
  };
  forecasts: readonly Pick<
    ForecastBucket,
    'months' | 'known' | 'estimated' | 'unknownCount' | 'noteKey'
  >[];
};

function clampPct(part: number, whole: number): number {
  if (!(whole > 0) || !Number.isFinite(part)) return 0;
  return Math.min(100, Math.max(0, (part / whole) * 100));
}

/** Geometry for the budget screen. Pure so the picture can be checked without the page. */
export function budgetPicture(input: BudgetPictureInput): BudgetPicture {
  const budget = input.monthlyBudget;
  const over = budget != null && budget > 0 && input.spent > budget;
  const gap =
    input.tiers.recommended != null && input.reserve != null
      ? input.tiers.recommended - input.reserve
      : null;

  let figure: BudgetPicture['figure'] = 'empty';
  let figureAmount = 0;
  if (input.remaining != null) {
    figure = 'remaining';
    figureAmount = input.remaining;
  } else if (input.tiers.recommended != null) {
    figure = 'recommended';
    figureAmount = input.tiers.recommended;
  }

  const ceiling = Math.max(
    1,
    input.tiers.minimum ?? 0,
    input.tiers.recommended ?? 0,
    input.tiers.comfortable ?? 0,
    input.reserve ?? 0,
  );
  const rung = (key: BudgetRung, amount: number | null) =>
    amount == null
      ? null
      : {
          key,
          amount,
          pct: clampPct(amount, ceiling),
          met: input.reserve != null && input.reserve >= amount,
        };

  const totals = input.forecasts.map((f) => f.known + f.estimated);
  const scale = Math.max(1, ...totals, 0);
  const canCover = input.remaining != null || input.reserve != null;

  let fill: BudgetPicture['fill'] = 'none';
  if (input.reserve != null) {
    if (gap == null) fill = 'set';
    else if (gap > 0) fill = 'short';
    else fill = 'met';
  }

  return {
    figure,
    figureAmount,
    spentPct: budget != null && budget > 0 ? clampPct(input.spent, budget) : 0,
    over,
    overAmount: over && budget != null ? input.spent - budget : 0,
    coverage:
      canCover && input.eligible90 > 0
        ? Math.round((((input.remaining ?? 0) + (input.reserve ?? 0)) / input.eligible90) * 100)
        : null,
    balancePct: clampPct(input.reserve ?? 0, ceiling),
    fill,
    gap,
    marks: [
      rung('minimum', input.tiers.minimum),
      rung('recommended', input.tiers.recommended),
      rung('comfortable', input.tiers.comfortable),
    ].filter((m) => m != null),
    bars: input.forecasts.map((f) => ({
      months: f.months,
      total: f.known + f.estimated,
      widthPct: clampPct(f.known + f.estimated, scale),
      known: f.known,
      estimated: f.estimated,
      unknownCount: f.unknownCount,
    })),
    hasForecast: input.forecasts.some((f) => f.known + f.estimated > 0 || f.unknownCount > 0),
    mileageNote: input.forecasts.some((f) => !!f.noteKey),
  };
}
