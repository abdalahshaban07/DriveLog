import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
} from '@angular/core';
import { Db } from '../../data/db';
import { I18n } from '../../i18n/i18n';
import type { MsgKey } from '../../i18n/en';
import { TANK_ECONOMY_FLAT_PCT } from '../../domain/economy';
import {
  distanceByMonth,
  economyTrend,
  fuelGradeCostShare,
  placeSpendShare,
  spendByMonth,
  spendByMonthEntries,
  unitPriceTrend,
  type DateWindow,
  type TrendPoint,
} from '../../domain/insights';
import { BarChart } from '../../ui/charts/bar-chart';
import { LineChart } from '../../ui/charts/line-chart';
import { DonutChart, type DonutSlice } from '../../ui/charts/donut-chart';

/** Charts tab grid of the home page. Deferred so it stays out of the first paint. */
@Component({
  selector: 'app-home-charts',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BarChart, LineChart, DonutChart],
  templateUrl: './home-charts.html',
  styleUrl: './home-charts.scss',
})
export class HomeCharts {
  readonly i18n = inject(I18n);
  private readonly db = inject(Db);
  /** The parent owns the range state (the header line reads it too). */
  readonly window = input.required<DateWindow>();

  readonly economySeries = computed(() => economyTrend(this.db.fillUps(), this.window()));
  readonly economyValues = computed(() => this.economySeries().map((p) => p.value));
  readonly economyLabels = computed(() => this.economySeries().map((p) => this.shortDate(p.date)));
  readonly economyLatest = computed(() => this.economySeries().at(-1)?.value ?? null);
  readonly economyDelta = computed(() => seriesDelta(this.economySeries()));
  readonly economyAvg = computed(() => seriesMean(this.economySeries()));
  readonly economyBest = computed(() => seriesMin(this.economySeries()));
  readonly spendTrendEntries = computed(() =>
    spendByMonthEntries(this.db.fillUps(), this.window()),
  );
  readonly spendTrend = computed(() => spendByMonth(this.db.fillUps(), this.window()));
  readonly spendTotal = computed(() => this.spendTrend().reduce((sum, v) => sum + v, 0));
  readonly spendDelta = computed(() => monthDelta(this.spendTrend()));
  readonly spendTrendLabels = computed(() =>
    this.spendTrendEntries().map((e) => this.i18n.formatDate(`${e.month}-01`, { month: 'short' })),
  );
  readonly fuelGradeShare = computed(() =>
    fuelGradeCostShare(this.db.fillUps(), this.window()),
  );
  readonly fuelGradeTotal = computed(() =>
    this.fuelGradeShare().reduce((sum, s) => sum + s.cost, 0),
  );
  readonly fuelGradeSlices = computed((): DonutSlice[] =>
    this.fuelGradeShare().map((s) => ({
      label: s.grade === 'unknown' ? this.i18n.t('charts.gradeUnknown') : this.gradeLabel(s.grade),
      value: s.cost,
      detail: this.formatMoney(s.cost),
    })),
  );
  readonly distanceEntries = computed(() => distanceByMonth(this.db.fillUps(), this.window()));
  readonly distanceValues = computed(() => this.distanceEntries().map((e) => e.value));
  readonly distanceLabels = computed(() =>
    this.distanceEntries().map((e) => this.i18n.formatDate(`${e.month}-01`, { month: 'short' })),
  );
  readonly distanceTotal = computed(() => this.distanceValues().reduce((sum, v) => sum + v, 0));
  readonly distanceDelta = computed(() => monthDelta(this.distanceValues()));
  readonly priceSeries = computed(() => unitPriceTrend(this.db.fillUps(), this.window()));
  readonly priceValues = computed(() => this.priceSeries().map((p) => p.value));
  readonly priceLabels = computed(() => this.priceSeries().map((p) => this.shortDate(p.date)));
  readonly priceLatest = computed(() => this.priceSeries().at(-1)?.value ?? null);
  readonly priceDelta = computed(() => seriesDelta(this.priceSeries()));
  readonly priceAvg = computed(() => seriesMean(this.priceSeries()));
  readonly priceMoved = computed(() => priceSpread(this.priceValues()));
  readonly placeShare = computed(() => placeSpendShare(this.db.fillUps(), this.window()));
  readonly placeSlices = computed((): DonutSlice[] =>
    this.placeShare().map((s) => ({
      label: s.label || this.i18n.t('charts.otherPlaces'),
      value: s.cost,
      detail: this.formatMoney(s.cost),
    })),
  );

  formatMoney(value: number): string {
    return this.i18n.formatMoney(value, this.db.settings().currency, 0);
  }

  formatCostPerKm(value: number): string {
    return this.i18n.formatMoney(value, this.db.settings().currency, 2);
  }

  formatSigned(value: number, digits: number): string {
    return this.formatDelta(value, digits, (abs) =>
      this.i18n.formatNumber(abs, {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      }),
    );
  }

  formatMoneyDelta(value: number, digits = 0): string {
    return this.formatDelta(value, digits, (abs) =>
      this.i18n.formatMoney(abs, this.db.settings().currency, digits),
    );
  }

  perMonth(total: number, count: number): string {
    if (count <= 0) {
      return '';
    }
    return this.i18n.t('charts.perMonth', { amount: this.formatMoney(total / count) });
  }

  gradeLabel(grade?: string): string {
    if (!grade) {
      return '';
    }
    return this.i18n.t(`fillUp.grade.${grade}` as MsgKey);
  }

  private shortDate(date: string): string {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return '';
    }
    return this.i18n.formatDate(date, { day: 'numeric', month: 'short' });
  }

  private formatDelta(value: number, digits: number, formatAbs: (abs: number) => string): string {
    const abs = Math.abs(value);
    if (abs < 0.5 * 10 ** -digits) {
      return this.i18n.t('charts.deltaFlat');
    }
    const body = formatAbs(abs);
    return value > 0 ? `+${body}` : `−${body}`;
  }
}

function seriesDelta(points: readonly TrendPoint[]): number | null {
  if (points.length < 2) {
    return null;
  }
  return points.at(-1)!.value - points.at(-2)!.value;
}

function seriesMean(points: readonly TrendPoint[]): number | null {
  if (points.length < 2) {
    return null;
  }
  return points.reduce((sum, point) => sum + point.value, 0) / points.length;
}

function seriesMin(points: readonly TrendPoint[]): number | null {
  if (!points.length) {
    return null;
  }
  return Math.min(...points.map((point) => point.value));
}

function priceSpread(values: readonly number[]): boolean {
  if (values.length < 2) {
    return false;
  }
  const low = Math.min(...values);
  const high = Math.max(...values);
  if (low <= 0) {
    return high > 0;
  }
  return ((high - low) / low) * 100 >= TANK_ECONOMY_FLAT_PCT;
}

function monthDelta(values: readonly number[]): number | null {
  if (values.length < 2) {
    return null;
  }
  return values.at(-1)! - values.at(-2)!;
}
