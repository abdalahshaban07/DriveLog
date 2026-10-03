import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterNextRender,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Db } from '../../data/db';
import {
  currentWeather,
  getCoords,
  publicHolidays,
  type WeatherNow,
} from '../../data/remote';
import { countryFromCurrency } from '../../domain/country';
import { buildDueItems, nextDueItem, todayDateOnly } from '../../domain/dues';
import { nextExpiringDoc, vaultExpiryForKind } from '../../domain/vehicle-docs';
import { type PublicHoliday } from '../../domain/holidays';
import {
  activePeriod,
  daysUntil,
  periodTotals,
} from '../../domain/expense-period';
import {
  buildExpenseLedger,
  ledgerCategoryTotals,
  type LedgerPeriodFilter,
  type LedgerRow,
} from '../../domain/expense-ledger';
import { fuelDashboardMetrics } from '../../domain/fuel-dashboard';
import { isStoredMessageKey } from '../../domain/part-name';
import { buildFuelCostGlance, tankEconomyVsAvg } from '../../domain/economy';
import {
  costPerKmTrend,
  distanceByMonth,
  economyTrend,
  fuelGradeCostShare,
  placeSpendShare,
  spendByMonth,
  spendByMonthEntries,
  unitPriceTrend,
  type TrendPoint,
} from '../../domain/insights';
import type { ExpenseCategory } from '../../domain/models';
import {
  buildMonthOutlook,
  buildRecommendations,
  type Recommendation,
} from '../../domain/recommendations';
import { SAMPLE_CAR_ID, sampleDiscoveryHoliday } from '../../domain/sample-data';
import {
  buildSetupChecklist,
  isRealFillUp,
  shouldShowSetupChecklist,
} from '../../domain/setup-checklist';
import { buildReportBrief, buildSmartReports } from '../../domain/smart-reports';
import { dueItemLabel } from '../../domain/part-name';
import { homeHealthSummary } from '../../domain/vehicle-facts';
import type { InsightKind } from '../../domain/insight-generator';
import { I18n } from '../../i18n/i18n';
import type { MsgKey } from '../../i18n/en';
import { HealthRow } from '../../ui/health-row/health-row';
import { InstallPwa } from '../../pwa/install-pwa';
import { BarChart } from '../../ui/charts/bar-chart';
import { LineChart } from '../../ui/charts/line-chart';
import { DonutChart, type DonutSlice } from '../../ui/charts/donut-chart';
import { DateField } from '../../ui/date-field';
import { MotionPolicy } from '../../ui/motion/motion-policy';
import { PageHeader } from '../../ui/page-header';
import { PrimaryButton } from '../../ui/primary-button';
import { SelectField } from '../../ui/select-field';
import { InstallCard } from './cards/install-card/install-card';
import { MonthInsight } from './cards/month-insight/month-insight';
import { QuickLog } from './cards/quick-log/quick-log';
import { SampleBanner } from './cards/sample-banner/sample-banner';
import {
  SetupChecklist,
  type ChecklistItem,
} from './cards/setup-checklist/setup-checklist';
import { WeatherTipCard } from './cards/weather-tip/weather-tip';

type HomeView = 'dashboard' | 'reports' | 'charts';
type ChartCategory = ExpenseCategory | 'all';

@Component({
  selector: 'app-home',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    PageHeader,
    DateField,
    PrimaryButton,
    RouterLink,
    BarChart,
    LineChart,
    DonutChart,
    SelectField,
    SampleBanner,
    SetupChecklist,
    InstallCard,
    QuickLog,
    MonthInsight,
    WeatherTipCard,
    HealthRow,
  ],
  templateUrl: './home.html',
  styleUrl: './home.scss',
})
export class HomePage {
  readonly i18n = inject(I18n);
  readonly db = inject(Db);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly policy = inject(MotionPolicy);
  private readonly install = inject(InstallPwa);
  private readonly ledgerList = viewChild<ElementRef<HTMLElement>>('ledgerList');
  private readonly stackBar = viewChild<ElementRef<HTMLElement>>('stackBar');
  private readonly glanceStrip = viewChild<ElementRef<HTMLElement>>('glanceStrip');

  readonly view = signal<HomeView>('dashboard');
  readonly chartCategory = signal<ChartCategory>('all');
  readonly chartPeriod = signal<LedgerPeriodFilter>('3m');
  readonly startingPeriod = signal(false);
  readonly showPeriodForm = signal(false);
  readonly periodCloseDate = signal(todayDateOnly());
  readonly periodStartDate = signal(todayDateOnly());
  readonly glanceFlash = signal(false);
  readonly weather = signal<WeatherNow | null>(null);
  readonly weatherBusy = signal(false);
  readonly holidays = signal<PublicHoliday[]>([]);

  readonly tabOptions: { id: HomeView; labelKey: MsgKey }[] = [
    { id: 'dashboard', labelKey: 'home.tab.dashboard' },
    { id: 'reports', labelKey: 'home.tab.reports' },
    { id: 'charts', labelKey: 'home.tab.charts' },
  ];

  readonly chartCategoryOptions: { id: ChartCategory; labelKey: MsgKey }[] = [
    { id: 'all', labelKey: 'charts.categoryAll' },
    { id: 'fuel', labelKey: 'charts.categoryFuel' },
    { id: 'maintenance', labelKey: 'charts.categoryMaintenance' },
    { id: 'breakdown', labelKey: 'charts.categoryBreakdown' },
    { id: 'other', labelKey: 'charts.categoryOther' },
  ];

  readonly chartPeriodOptions: { id: LedgerPeriodFilter; labelKey: MsgKey }[] = [
    { id: '30d', labelKey: 'charts.period30d' },
    { id: '3m', labelKey: 'charts.period3m' },
    { id: '6m', labelKey: 'charts.period6m' },
    { id: 'all', labelKey: 'charts.periodAll' },
  ];

  readonly chartCategorySelectOptions = computed(() =>
    this.chartCategoryOptions.map((opt) => ({
      value: opt.id,
      label: this.i18n.t(opt.labelKey),
    })),
  );

  readonly chartPeriodSelectOptions = computed(() =>
    this.chartPeriodOptions.map((opt) => ({
      value: opt.id,
      label: this.i18n.t(opt.labelKey),
    })),
  );

  readonly activeCarId = computed(() => this.db.car()?.id ?? '');
  readonly period = computed(() =>
    activePeriod(this.db.expensePeriods(), this.activeCarId()),
  );
  readonly totals = computed(() =>
    periodTotals(
      this.period(),
      this.db.fillUps(),
      this.db.maintenance(),
      this.db.breakdowns(),
      this.db.otherExpenses(),
    ),
  );
  readonly reports = computed(() =>
    buildSmartReports({
      fills: this.db.fillUps(),
      maintenance: this.db.maintenance(),
      breakdowns: this.db.breakdowns(),
      other: this.db.otherExpenses(),
      period: this.period(),
    }),
  );
  readonly reportBrief = computed(() =>
    buildReportBrief({
      fills: this.db.fillUps(),
      maintenance: this.db.maintenance(),
      period: this.period(),
      totals: this.totals(),
    }),
  );
  readonly economyVsUsual = computed(() => tankEconomyVsAvg(this.db.fillUps()));
  readonly ledgerRows = computed(() =>
    buildExpenseLedger({
      fills: this.db.fillUps(),
      maintenance: this.db.maintenance(),
      breakdowns: this.db.breakdowns(),
      other: this.db.otherExpenses(),
      category: this.chartCategory(),
      period: this.chartPeriod(),
    }),
  );
  readonly ledgerTotals = computed(() => ledgerCategoryTotals(this.ledgerRows()));
  readonly fuelMetrics = computed(() => fuelDashboardMetrics(this.db.fillUps()));
  readonly fuelCostGlance = computed(() => buildFuelCostGlance(this.db.fillUps()));
  readonly sampleMode = computed(() => this.db.settings().sampleMode === true);
  readonly hasRealFills = computed(() => this.db.fillUps().some(isRealFillUp));
  /** ponytail: empty when no logs at all — domain always returns 4 placeholder cards */
  readonly reportsHasSignal = computed(
    () =>
      this.totals().total > 0 ||
      this.fuelMetrics().lastL100 != null ||
      this.db.maintenance().length > 0 ||
      this.db.breakdowns().length > 0 ||
      this.db.otherExpenses().length > 0 ||
      this.hasRealFills(),
  );
  readonly showQuickLog = computed(
    () => !!this.db.car() && !this.sampleMode() && this.hasRealFills(),
  );
  readonly showInstallCard = computed(
    () =>
      this.hasRealFills() &&
      !this.sampleMode() &&
      !this.db.settings().installCardDismissed &&
      this.install.canPrompt() &&
      !this.install.installed(),
  );
  readonly checklistItems = computed((): ChecklistItem[] => {
    const draft = buildSetupChecklist({
      car: this.db.car(),
      fills: this.db.fillUps(),
      maintenance: this.db.maintenance(),
    });
    const routes: Record<(typeof draft)[number]['id'], { labelKey: MsgKey; route: string }> = {
      car: { labelKey: 'home.checklist.car', route: '/settings' },
      fill: { labelKey: 'home.checklist.fillUp', route: '/fill-up' },
      due: { labelKey: 'home.checklist.due', route: '/maintenance' },
    };
    return draft.map((d) => ({
      id: d.id,
      done: d.done,
      labelKey: routes[d.id].labelKey,
      route: routes[d.id].route,
    }));
  });
  readonly showChecklist = computed(() =>
    shouldShowSetupChecklist({
      sampleMode: this.sampleMode(),
      checklistDismissed: this.db.settings().checklistDismissed === true,
      items: this.checklistItems().map((i) => ({
        id: i.id as 'car' | 'fill' | 'due',
        done: i.done,
      })),
    }),
  );
  readonly lastFillDate = computed(() => {
    let best: { date: string; createdAt: string } | undefined;
    for (const fill of this.db.fillUps()) {
      if (
        !best ||
        fill.date > best.date ||
        (fill.date === best.date && fill.createdAt > best.createdAt)
      ) {
        best = fill;
      }
    }
    return best?.date ?? null;
  });
  readonly nextDue = computed(() => {
    const car = this.db.car();
    if (!car) {
      return null;
    }
    const docs = this.db.vehicleDocuments();
    const vaultCar = {
      ...car,
      licenseExpiry: vaultExpiryForKind(docs, 'license') ?? car.licenseExpiry,
      registrationExpiry:
        vaultExpiryForKind(docs, 'registration') ?? car.registrationExpiry,
    };
    const items = buildDueItems(
      this.db.settings(),
      this.db.maintenance(),
      car.currentOdometer,
      todayDateOnly(),
      vaultCar,
    );
    return nextDueItem(items);
  });
  readonly nextVaultDoc = computed(() => nextExpiringDoc(this.db.vehicleDocuments()));
  /** At most one dismissible nudge on the dashboard, highest priority first. */
  readonly nudge = computed((): 'checklist' | 'vault' | 'install' | null => {
    if (this.showChecklist()) return 'checklist';
    if (this.nextVaultDoc()) return 'vault';
    if (this.showInstallCard()) return 'install';
    return null;
  });
  readonly economySeries = computed(() => economyTrend(this.db.fillUps(), this.chartPeriod()));
  readonly economyValues = computed(() => this.economySeries().map((p) => p.value));
  readonly economyLabels = computed(() =>
    this.economySeries().map((p) => this.shortDate(p.date)),
  );
  readonly economyLatest = computed(() => this.economySeries().at(-1)?.value ?? null);
  readonly economyDelta = computed(() => seriesDelta(this.economySeries()));
  readonly economyAvg = computed(() => seriesMean(this.economySeries()));
  readonly costSeries = computed(() => costPerKmTrend(this.db.fillUps(), this.chartPeriod()));
  readonly costValues = computed(() => this.costSeries().map((p) => p.value));
  readonly costLabels = computed(() => this.costSeries().map((p) => this.shortDate(p.date)));
  readonly costLatest = computed(() => this.costSeries().at(-1)?.value ?? null);
  readonly costDelta = computed(() => seriesDelta(this.costSeries()));
  readonly costAvg = computed(() => seriesMean(this.costSeries()));
  readonly spendTrendEntries = computed(() =>
    spendByMonthEntries(this.db.fillUps(), this.chartPeriod()),
  );
  readonly spendTrend = computed(() => spendByMonth(this.db.fillUps(), this.chartPeriod()));
  readonly spendTotal = computed(() => this.spendTrend().reduce((sum, v) => sum + v, 0));
  readonly spendDelta = computed(() => {
    const values = this.spendTrend();
    if (values.length < 2) {
      return null;
    }
    return values.at(-1)! - values.at(-2)!;
  });
  readonly spendTrendLabels = computed(() =>
    this.spendTrendEntries().map((e) =>
      this.i18n.formatDate(`${e.month}-01`, { month: 'short' }),
    ),
  );
  readonly fuelGradeShare = computed(() =>
    fuelGradeCostShare(this.db.fillUps(), this.chartPeriod()),
  );
  readonly fuelGradeTotal = computed(() =>
    this.fuelGradeShare().reduce((sum, s) => sum + s.cost, 0),
  );
  readonly fuelGradeSlices = computed((): DonutSlice[] =>
    this.fuelGradeShare().map((s) => ({
      label:
        s.grade === 'unknown'
          ? this.i18n.t('charts.gradeUnknown')
          : this.gradeLabel(s.grade),
      value: s.cost,
      detail: this.formatMoney(s.cost),
    })),
  );
  readonly distanceEntries = computed(() =>
    distanceByMonth(this.db.fillUps(), this.chartPeriod()),
  );
  readonly distanceValues = computed(() => this.distanceEntries().map((e) => e.value));
  readonly distanceLabels = computed(() =>
    this.distanceEntries().map((e) =>
      this.i18n.formatDate(`${e.month}-01`, { month: 'short' }),
    ),
  );
  readonly distanceTotal = computed(() => this.distanceValues().reduce((sum, v) => sum + v, 0));
  readonly distanceDelta = computed(() => monthDelta(this.distanceValues()));
  readonly priceSeries = computed(() => unitPriceTrend(this.db.fillUps(), this.chartPeriod()));
  readonly priceValues = computed(() => this.priceSeries().map((p) => p.value));
  readonly priceLabels = computed(() => this.priceSeries().map((p) => this.shortDate(p.date)));
  readonly priceLatest = computed(() => this.priceSeries().at(-1)?.value ?? null);
  readonly priceDelta = computed(() => seriesDelta(this.priceSeries()));
  readonly priceAvg = computed(() => seriesMean(this.priceSeries()));
  readonly placeShare = computed(() => placeSpendShare(this.db.fillUps(), this.chartPeriod()));
  readonly placeSlices = computed((): DonutSlice[] =>
    this.placeShare().map((s) => ({
      label: s.label || this.i18n.t('charts.otherPlaces'),
      value: s.cost,
      detail: this.formatMoney(s.cost),
    })),
  );
  readonly economyBest = computed(() => seriesMin(this.economySeries()));
  readonly costBest = computed(() => seriesMin(this.costSeries()));
  readonly monthOutlook = computed(() =>
    buildMonthOutlook(
      this.db.fillUps(),
      this.db.maintenance(),
      this.db.breakdowns(),
      this.db.otherExpenses(),
    ),
  );
  readonly recommendations = computed(() =>
    buildRecommendations({
      settings: this.db.settings(),
      car: this.db.car() ?? null,
      fills: this.db.fillUps(),
      maintenance: this.db.maintenance(),
      breakdowns: this.db.breakdowns(),
      other: this.db.otherExpenses(),
      periods: this.db.expensePeriods(),
      holidays: this.holidays(),
    }),
  );
  readonly healthSummary = computed(() => homeHealthSummary(this.db));
  readonly healthAttention = computed(() => this.healthSummary().attention);
  readonly healthTop = computed(() => this.healthSummary().top);
  readonly topAdvisorInsight = computed(
    () => this.healthSummary().facts?.insights[0] ?? null,
  );

  constructor() {
    this.route.queryParamMap.subscribe((params) => {
      const v = params.get('view');
      if (v === 'reports' || v === 'charts' || v === 'dashboard') {
        this.view.set(v);
      }
    });
    afterNextRender(() => {
      if (this.view() === 'charts') {
        void this.animateCharts();
      }
      void this.loadWeather();
      void this.loadHolidays();
    });
  }

  private async loadWeather(): Promise<void> {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return;
    }
    this.weatherBusy.set(true);
    try {
      const coords = await getCoords();
      if (!coords) {
        return;
      }
      this.weather.set(await currentWeather(coords.lat, coords.lon));
    } finally {
      this.weatherBusy.set(false);
    }
  }

  private async loadHolidays(): Promise<void> {
    const today = todayDateOnly();
    const demo = this.db.settings().sampleMode
      ? sampleDiscoveryHoliday(today, this.i18n.t('home.sample.holiday'))
      : null;
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      this.holidays.set(demo ? [demo] : []);
      return;
    }
    const cc = countryFromCurrency(this.db.settings().currency);
    const year = Number(today.slice(0, 4));
    const list = await publicHolidays(cc, year);
    this.holidays.set(demo ? [demo, ...list] : list);
  }

  async clearSample(): Promise<void> {
    await this.db.clearSampleData(SAMPLE_CAR_ID);
    await this.router.navigateByUrl('/setup');
  }

  async dismissChecklist(): Promise<void> {
    await this.db.updateSettings({ checklistDismissed: true });
  }

  async dismissInstallCard(): Promise<void> {
    await this.db.updateSettings({ installCardDismissed: true });
  }

  async promptInstall(): Promise<void> {
    await this.install.promptInstall();
  }

  onQuickSaved(): void {
    this.glanceFlash.set(true);
    this.glanceStrip()?.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
    window.setTimeout(() => this.glanceFlash.set(false), 600);
  }

  recTitle(rec: Recommendation): string {
    return this.i18n.t(rec.titleKey as MsgKey);
  }

  recBody(rec: Recommendation): string {
    const params = { ...(rec.bodyParams ?? {}) };
    if (rec.kind === 'holiday' && typeof params['date'] === 'string') {
      params['date'] = this.i18n.formatDate(String(params['date']), {
        day: 'numeric',
        month: 'short',
      });
    }
    return this.i18n.t(rec.bodyKey as MsgKey, params);
  }

  dueLabel(): string {
    const due = this.nextDue();
    if (!due) {
      return this.i18n.t('home.nothingDue');
    }
    return dueItemLabel(due, this.db.maintenance(), this.db.catalog(), (key) =>
      this.i18n.t(key as MsgKey),
    );
  }

  async animateCharts(): Promise<void> {
    if (!this.policy.allowAnime('stackBar')) {
      return;
    }
    try {
      const { animate, stagger } = await import('animejs');
      const bar = this.stackBar()?.nativeElement;
      if (bar) {
        const segs = bar.querySelectorAll('.stack-bar__seg');
        animate(segs, {
          opacity: [0, 1],
          scaleX: [0.6, 1],
          delay: stagger(60),
          duration: 480,
          ease: 'out(3)',
        });
      }
      const list = this.ledgerList()?.nativeElement;
      if (list) {
        const rows = list.querySelectorAll('.ledger-row');
        animate(rows, {
          opacity: [0, 1],
          translateY: [8, 0],
          delay: stagger(40),
          duration: 420,
          ease: 'out(3)',
        });
      }
    } catch {
      /* CSS fallback */
    }
  }

  licenseDays(expiry?: string): number | null {
    if (!expiry) {
      return null;
    }
    return daysUntil(expiry, todayDateOnly());
  }

  licenseStatus(days: number | null): 'missing' | 'overdue' | 'soon' | 'ok' {
    if (days == null) {
      return 'missing';
    }
    if (days < 0) {
      return 'overdue';
    }
    if (days <= 30) {
      return 'soon';
    }
    return 'ok';
  }

  formatMoney(value: number): string {
    return this.i18n.formatMoney(value, this.db.settings().currency, 0);
  }

  formatCostPerKm(value: number): string {
    return this.i18n.formatMoney(value, this.db.settings().currency, 2);
  }

  perMonth(total: number, count: number): string {
    if (count <= 0) {
      return '';
    }
    return this.i18n.t('charts.perMonth', { amount: this.formatMoney(total / count) });
  }

  sharePct(part: number, total: number): string {
    if (total <= 0) {
      return this.i18n.formatNumber(0, { maximumFractionDigits: 0 });
    }
    return this.i18n.formatNumber(Math.round((part / total) * 100), {
      maximumFractionDigits: 0,
    });
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

  monthPace(elapsedDays: number, daysInMonth: number): number {
    if (daysInMonth <= 0) {
      return 0;
    }
    return Math.min(100, Math.max(0, Math.round((elapsedDays / daysInMonth) * 100)));
  }

  monthFuelDeltaLabel(): string {
    const pct = this.fuelCostGlance().deltaPct;
    if (pct == null) {
      return this.i18n.t('home.monthFuelDelta.none');
    }
    if (Math.abs(pct) < 3) {
      return this.i18n.t('home.monthFuelDelta.same');
    }
    const abs = this.i18n.formatNumber(Math.abs(pct), { maximumFractionDigits: 0 });
    if (pct > 0) {
      return this.i18n.t('home.monthFuelDelta.up', { pct: abs });
    }
    return this.i18n.t('home.monthFuelDelta.down', { pct: `-${abs}` });
  }

  insightTitle(tip: { titleKey: string }): string {
    return this.i18n.t(tip.titleKey as MsgKey);
  }

  insightBody(tip: { bodyKey: string }): string {
    return this.i18n.t(tip.bodyKey as MsgKey);
  }

  insightLink(tip: { kind: InsightKind }): string {
    switch (tip.kind) {
      case 'BUDGET_HEALTH':
      case 'BUDGET_WARNING':
      case 'UPCOMING_EXPENSE':
      case 'SAVING_RECOMMENDATION':
      case 'MAINTENANCE_FORECAST':
        return '/budget';
      case 'FUEL_SPENDING':
        return '/fuel';
      case 'MAINTENANCE_PRIORITY':
      case 'COST_ANOMALY':
      case 'MISSING_DATA':
        return '/health';
      default: {
        const _exhaustive: never = tip.kind;
        return _exhaustive;
      }
    }
  }

  gradeLabel(grade?: string): string {
    if (!grade) {
      return '';
    }
    return this.i18n.t(`fillUp.grade.${grade}` as MsgKey);
  }

  ledgerKmChip(row: LedgerRow): string | null {
    const km = row.fuelDetail?.distanceKm;
    if (km == null || km <= 0) {
      return null;
    }
    return this.i18n.t('history.kmDriven', {
      km: this.i18n.formatNumber(km, { maximumFractionDigits: 0 }),
    });
  }

  ledgerTitle(title: string): string {
    return isStoredMessageKey(title) ? this.i18n.t(title as MsgKey) : title;
  }

  ledgerDateLabel(date: string): string {
    return this.i18n.formatDate(date, { day: 'numeric', month: 'short' });
  }

  categoryLabel(cat: ExpenseCategory): string {
    return this.i18n.t(`charts.cat.${cat}` as MsgKey);
  }

  reportTitle(key: string): string {
    return this.i18n.t(key as MsgKey);
  }

  mixSeg(key: ExpenseCategory): 'fuel' | 'maint' | 'break' | 'other' {
    switch (key) {
      case 'fuel':
        return 'fuel';
      case 'maintenance':
        return 'maint';
      case 'breakdown':
        return 'break';
      case 'other':
        return 'other';
      default: {
        const _exhaustive: never = key;
        return _exhaustive;
      }
    }
  }

  mixPct(pct: number): string {
    return this.i18n.t('reports.pct', {
      pct: this.i18n.formatNumber(pct, { maximumFractionDigits: 0 }),
    });
  }

  reportBody(key: string, params?: Record<string, string | number>): string {
    const next = { ...(params ?? {}) };
    for (const k of ['l100', 'current', 'baseline'] as const) {
      const v = next[k];
      if (typeof v === 'number') {
        next[k] = this.i18n.formatUnit(v, 'common.lPer100', 1);
      }
    }
    return this.i18n.t(key as MsgKey, next);
  }

  barPct(part: number, total: number): number {
    if (total <= 0) {
      return 0;
    }
    return Math.max(2, Math.round((part / total) * 100));
  }

  setView(next: HomeView): void {
    this.view.set(next);
    if (next === 'charts') {
      queueMicrotask(() => void this.animateCharts());
    }
    void this.router.navigate([], {
      queryParams: { view: next === 'dashboard' ? null : next },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  async switchCar(id: string): Promise<void> {
    if (id !== this.activeCarId()) {
      await this.db.switchCar(id);
    }
  }

  openPeriodForm(): void {
    const today = todayDateOnly();
    this.periodCloseDate.set(today);
    this.periodStartDate.set(today);
    this.showPeriodForm.set(true);
  }

  cancelPeriodForm(): void {
    this.showPeriodForm.set(false);
  }

  async confirmNewPeriod(): Promise<void> {
    const carId = this.activeCarId();
    if (!carId) {
      return;
    }
    this.startingPeriod.set(true);
    try {
      await this.db.startNewPeriod(
        carId,
        this.periodStartDate(),
        this.periodCloseDate(),
      );
      this.showPeriodForm.set(false);
    } finally {
      this.startingPeriod.set(false);
    }
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

function monthDelta(values: readonly number[]): number | null {
  if (values.length < 2) {
    return null;
  }
  return values.at(-1)! - values.at(-2)!;
}
