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
import { currentWeather, getCoords, type WeatherNow } from '../../data/remote';
import { buildDueItems, nextDueItem, todayDateOnly } from '../../domain/dues';
import { nextExpiringDoc, vaultExpiryForKind } from '../../domain/vehicle-docs';
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
import { fuelBoard, fuelDashboardMetrics, sparklineGeometry } from '../../domain/fuel-dashboard';
import { dueItemLabel, isStoredMessageKey, partDefinitionLabel } from '../../domain/part-name';
import { tankEconomyVsAvg, TANK_ECONOMY_FLAT_PCT } from '../../domain/economy';
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
import type { Car, DueSource, DueStatus, ExpenseCategory, HealthStatus } from '../../domain/models';
import { buildMonthOutlook } from '../../domain/recommendations';
import { SAMPLE_CAR_ID } from '../../domain/sample-data';
import {
  buildSetupChecklist,
  isRealFillUp,
  shouldShowSetupChecklist,
} from '../../domain/setup-checklist';
import { buildReportBrief, buildSmartReports } from '../../domain/smart-reports';
import { homeHealthSummary } from '../../domain/vehicle-facts';
import { I18n } from '../../i18n/i18n';
import { HealthRow } from '../../ui/health-row/health-row';
import type { MsgKey } from '../../i18n/en';
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
import { QuickLog } from './cards/quick-log/quick-log';
import { WeatherTipCard } from './cards/weather-tip/weather-tip';
import { SampleBanner } from './cards/sample-banner/sample-banner';
import {
  SetupChecklist,
  type ChecklistItem,
} from './cards/setup-checklist/setup-checklist';
type HomeView = 'dashboard' | 'reports' | 'charts';
type ChartCategory = ExpenseCategory | 'all';
type AttentionTone = 'soon' | 'overdue';
type PaperTone = 'plain' | AttentionTone;

interface AttentionRow {
  id: string;
  title: string;
  detail: string;
  tone: AttentionTone;
  route: string;
}

interface PaperLine {
  id: 'license' | 'registration';
  name: string;
  value: string;
  tone: PaperTone;
}

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
    HealthRow,
    WeatherTipCard,
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
  readonly fuelPulse = computed(() => fuelBoard(this.db.fillUps()));
  readonly pulseSpark = computed(() =>
    sparklineGeometry(this.fuelPulse().series, 360, 84, this.fuelPulse().overallL100),
  );
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
  readonly headerLine = computed(() => {
    const car = this.db.car();
    if (!car) {
      return this.i18n.t('app.subtitle');
    }
    const spec = this.vehicleLine(car);
    const km = `${this.i18n.formatNumber(car.currentOdometer, { maximumFractionDigits: 0 })} ${this.i18n.t('common.km')}`;
    return spec ? `${car.nickname} · ${spec} · ${km}` : `${car.nickname} · ${km}`;
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
    const nextDoc = this.nextVaultDoc();
    const alreadyListed = nextDoc != null && this.attention().some((row) => row.id === nextDoc.kind);
    if (nextDoc && !alreadyListed) return 'vault';
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
  readonly healthSummary = computed(() => homeHealthSummary(this.db));
  readonly healthAttention = computed(() => this.healthSummary().attention);
  readonly healthTop = computed(() => this.healthSummary().top);
  /** Overdue service, urgent papers, then the top health item. Empty when nothing is urgent. */
  readonly attention = computed((): AttentionRow[] => {
    const items: AttentionRow[] = [];
    const due = this.nextDue();
    if (due?.source === 'maintenance' && (due.status === 'overdue' || due.status === 'dueSoon')) {
      items.push({
        id: due.id,
        title: this.dueLabel(),
        detail: this.dueCountdown() ?? '',
        tone: due.status === 'overdue' ? 'overdue' : 'soon',
        route: '/maintenance',
      });
    }
    const car = this.db.car();
    if (car) {
      const urgentPapers = this.paperLines(car)
        .filter((paper): paper is PaperLine & { tone: AttentionTone } => paper.tone !== 'plain')
        .sort((a, b) => this.paperRank(a.tone) - this.paperRank(b.tone));
      for (const paper of urgentPapers) {
        if (items.length >= 3) {
          break;
        }
        items.push({
          id: paper.id,
          title: paper.name,
          detail: paper.value,
          tone: paper.tone,
          route: '/vault',
        });
      }
    }
    const health = this.healthSummary().top.find((item) => this.healthTone(item.status) != null);
    const healthTone = health ? this.healthTone(health.status) : null;
    if (health && healthTone && items.length < 3) {
      items.push({
        id: `health-${health.partDefinitionId}`,
        title: partDefinitionLabel(health.part, (key) => this.i18n.t(key as MsgKey)),
        detail: this.i18n.t(`health.status.${health.status}` as MsgKey),
        tone: healthTone,
        route: `/health/${health.partDefinitionId}`,
      });
    }
    return items.slice(0, 3);
  });

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

  vehicleLine(car: Car): string {
    return [car.year, car.make, car.model]
      .map((part) => part?.trim())
      .filter((part): part is string => !!part)
      .join(' · ');
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

  dueRoute(): string {
    const source = this.nextDue()?.source;
    if (!source) {
      return '/maintenance';
    }
    return this.routeForDue(source);
  }

  dueTone(): 'none' | 'ok' | 'soon' | 'overdue' {
    const status = this.nextDue()?.status;
    if (!status) {
      return 'none';
    }
    return this.toneForDue(status);
  }

  dueCountdown(): string | null {
    const due = this.nextDue();
    if (!due) {
      return null;
    }
    if (due.dueDate) {
      const days = daysUntil(due.dueDate, todayDateOnly());
      if (days === 0) {
        return this.i18n.t('vault.dueToday');
      }
      const n = this.i18n.formatNumber(Math.abs(days), { maximumFractionDigits: 0 });
      return days < 0
        ? this.i18n.t('vault.daysOver', { days: n })
        : this.i18n.t('home.license.days', { days: n });
    }
    if (due.dueKm != null) {
      const left = due.dueKm - (this.db.car()?.currentOdometer ?? 0);
      const km = this.i18n.formatNumber(Math.abs(left), { maximumFractionDigits: 0 });
      if (left < 0) {
        return this.i18n.t('home.kmOver', { km });
      }
      if (left === 0) {
        return this.i18n.t('due.overdue');
      }
      return this.i18n.t('home.kmLeft', { km });
    }
    return null;
  }

  economyTone(): 'none' | 'flat' | 'better' | 'worse' {
    const pct = this.fuelPulse().economyDeltaPct;
    if (pct == null) {
      return 'none';
    }
    if (Math.abs(pct) < TANK_ECONOMY_FLAT_PCT) {
      return 'flat';
    }
    return pct > 0 ? 'worse' : 'better';
  }

  economyCaption(): string | null {
    const tone = this.economyTone();
    switch (tone) {
      case 'none':
        return null;
      case 'flat':
        return this.i18n.t('fuel.vsUsualFlat');
      case 'worse':
      case 'better': {
        const abs = this.i18n.formatNumber(Math.abs(this.fuelPulse().economyDeltaPct ?? 0), {
          maximumFractionDigits: 0,
        });
        return tone === 'worse'
          ? this.i18n.t('fuel.vsUsualWorse', { pct: abs })
          : this.i18n.t('fuel.vsUsualBetter', { pct: abs });
      }
      default: {
        const _exhaustive: never = tone;
        return _exhaustive;
      }
    }
  }

  private routeForDue(source: DueSource): string {
    switch (source) {
      case 'license':
      case 'registration':
        return '/vault';
      case 'maintenance':
        return '/maintenance';
      default: {
        const _exhaustive: never = source;
        return _exhaustive;
      }
    }
  }

  private toneForDue(status: DueStatus): 'ok' | 'soon' | 'overdue' {
    switch (status) {
      case 'overdue':
        return 'overdue';
      case 'dueSoon':
        return 'soon';
      case 'future':
        return 'ok';
      default: {
        const _exhaustive: never = status;
        return _exhaustive;
      }
    }
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

  paperLines(car: Car): PaperLine[] {
    const kinds = [
      { id: 'license' as const, key: 'due.license' as const },
      { id: 'registration' as const, key: 'due.registration' as const },
    ];
    return kinds.map((kind) => {
      const days = this.licenseDays(this.paperExpiry(car, kind.id));
      const status = this.licenseStatus(days);
      const tone: PaperTone = status === 'soon' || status === 'overdue' ? status : 'plain';
      return {
        id: kind.id,
        name: this.i18n.t(kind.key),
        value: this.paperValue(days),
        tone,
      };
    });
  }

  private paperExpiry(car: Car, kind: 'license' | 'registration'): string | undefined {
    const onCar = kind === 'license' ? car.licenseExpiry : car.registrationExpiry;
    if (car.id !== this.activeCarId()) {
      return onCar;
    }
    return vaultExpiryForKind(this.db.vehicleDocuments(), kind) ?? onCar;
  }

  private paperValue(days: number | null): string {
    if (days == null) {
      return this.i18n.t('home.license.missing');
    }
    const n = this.i18n.formatNumber(Math.abs(days), { maximumFractionDigits: 0 });
    return days < 0
      ? this.i18n.t('vault.daysOver', { days: n })
      : this.i18n.t('home.license.days', { days: n });
  }

  private paperRank(tone: AttentionTone): number {
    return tone === 'overdue' ? 0 : 1;
  }

  private healthTone(status: HealthStatus): AttentionTone | null {
    switch (status) {
      case 'overdue':
      case 'critical':
      case 'due':
        return 'overdue';
      case 'soon':
      case 'inspect':
        return 'soon';
      case 'good':
      case 'unknown':
        return null;
      default: {
        const _exhaustive: never = status;
        return _exhaustive;
      }
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

  /** End-of-month projection compared with last month's total. */
  monthVsLast(): { pct: number; tone: 'up' | 'down' | 'same' } | null {
    const outlook = this.monthOutlook();
    if (outlook.previous <= 0 || outlook.projected == null) {
      return null;
    }
    const pct = Math.round(((outlook.projected - outlook.previous) / outlook.previous) * 100);
    if (Math.abs(pct) < 3) {
      return { pct, tone: 'same' };
    }
    return { pct, tone: pct > 0 ? 'up' : 'down' };
  }

  monthVsLastLabel(): string | null {
    const vs = this.monthVsLast();
    if (!vs) {
      return null;
    }
    if (vs.tone === 'same') {
      return this.i18n.t('home.monthFuelDelta.same');
    }
    const abs = this.i18n.formatNumber(Math.abs(vs.pct), { maximumFractionDigits: 0 });
    return vs.tone === 'up'
      ? this.i18n.t('home.monthFuelDelta.up', { pct: abs })
      : this.i18n.t('home.monthFuelDelta.down', { pct: `-${abs}` });
  }

  monthPace(elapsedDays: number, daysInMonth: number): number {
    if (daysInMonth <= 0) {
      return 0;
    }
    return Math.min(100, Math.max(0, Math.round((elapsedDays / daysInMonth) * 100)));
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
