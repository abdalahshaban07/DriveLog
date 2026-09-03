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
import { getCoords, nearbyPoi, type NearbyPoi } from '../../data/remote';
import { buildDueItems, nextDueItem, todayDateOnly } from '../../domain/dues';
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
import { fetchFuelTip } from '../../data/assistant';
import { fuelDashboardMetrics } from '../../domain/fuel-dashboard';
import { costPerKmTrend, economyTrend, fuelGradeCostShare, spendByMonth, spendByMonthEntries } from '../../domain/insights';
import type { ExpenseCategory } from '../../domain/models';
import {
  buildMonthOutlook,
  buildRecommendations,
  type Recommendation,
} from '../../domain/recommendations';
import { SAMPLE_CAR_ID } from '../../domain/sample-data';
import { buildSmartReports } from '../../domain/smart-reports';
import { I18n } from '../../i18n/i18n';
import type { MsgKey } from '../../i18n/en';
import { InstallPwa } from '../../pwa/install-pwa';
import { AmbientCanvas } from '../../ui/ambient-canvas/ambient-canvas';
import { Sparkline } from '../../ui/charts/sparkline';
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
import { NearbyStations } from './cards/nearby-stations/nearby-stations';
import { QuickLog } from './cards/quick-log/quick-log';
import { SampleBanner } from './cards/sample-banner/sample-banner';
import {
  SetupChecklist,
  type ChecklistItem,
} from './cards/setup-checklist/setup-checklist';

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
    Sparkline,
    BarChart,
    LineChart,
    DonutChart,
    AmbientCanvas,
    SelectField,
    NearbyStations,
    SampleBanner,
    SetupChecklist,
    InstallCard,
    QuickLog,
    MonthInsight,
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
  readonly nearbyKind = signal<'fuel' | 'charge'>('fuel');
  readonly nearbyLoading = signal(false);
  readonly nearbyError = signal<string | null>(null);
  readonly nearbyItems = signal<NearbyPoi[]>([]);
  readonly aiTip = signal('');
  readonly aiTipBusy = signal(false);
  readonly aiTipSource = signal<'ai' | 'local'>('local');
  readonly glanceFlash = signal(false);

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
  readonly filteredNearby = computed(() =>
    this.nearbyItems().filter((poi) => poi.kind === this.nearbyKind()),
  );
  readonly sampleMode = computed(() => this.db.settings().sampleMode === true);
  readonly hasRealFills = computed(() =>
    this.db.fillUps().some((f) => !f.id.startsWith('sample-')),
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
    const car = this.db.car();
    const hasDue = this.db
      .maintenance()
      .some((m) => m.dueDate != null || m.dueKm != null);
    return [
      {
        id: 'car',
        done: !!car,
        labelKey: 'home.checklist.car',
        route: '/settings',
      },
      {
        id: 'fill',
        done: this.hasRealFills(),
        labelKey: 'home.checklist.fillUp',
        route: '/fill-up',
      },
      {
        id: 'due',
        done: hasDue,
        labelKey: 'home.checklist.due',
        route: '/maintenance',
      },
    ];
  });
  readonly showChecklist = computed(() => {
    if (this.sampleMode() || this.db.settings().checklistDismissed) {
      return false;
    }
    return this.checklistItems().some((i) => !i.done);
  });
  readonly lastFillDate = computed(() => {
    const sorted = [...this.db.fillUps()].sort(
      (a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt),
    );
    return sorted[0]?.date ?? null;
  });
  readonly nextDue = computed(() => {
    const car = this.db.car();
    if (!car) {
      return null;
    }
    const items = buildDueItems(
      this.db.settings(),
      this.db.maintenance(),
      car.currentOdometer,
      todayDateOnly(),
      car,
    );
    return nextDueItem(items);
  });
  readonly economyTrend = computed(() => economyTrend(this.db.fillUps(), this.chartPeriod()));
  readonly costTrend = computed(() => costPerKmTrend(this.db.fillUps(), this.chartPeriod()));
  readonly spendTrendEntries = computed(() =>
    spendByMonthEntries(this.db.fillUps(), this.chartPeriod()),
  );
  readonly spendTrend = computed(() => spendByMonth(this.db.fillUps(), this.chartPeriod()));
  readonly spendTrendLabels = computed(() =>
    this.spendTrendEntries().map((e) =>
      this.i18n.formatDate(`${e.month}-01`, { month: 'short' }),
    ),
  );
  readonly fuelGradeShare = computed(() =>
    fuelGradeCostShare(this.db.fillUps(), this.chartPeriod()),
  );
  readonly fuelGradeSlices = computed((): DonutSlice[] =>
    this.fuelGradeShare().map((s) => ({
      label:
        s.grade === 'unknown'
          ? this.i18n.t('charts.gradeUnknown')
          : this.gradeLabel(s.grade),
      value: s.cost,
    })),
  );
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
    }),
  );
  readonly assistantOnline = computed(
    () =>
      this.db.settings().assistantEnabled === true &&
      typeof navigator !== 'undefined' &&
      navigator.onLine,
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
      void this.loadNearby();
      void this.loadAiTip();
    });
  }

  setNearbyKind(kind: 'fuel' | 'charge'): void {
    this.nearbyKind.set(kind);
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

  async loadNearby(): Promise<void> {
    this.nearbyLoading.set(true);
    this.nearbyError.set(null);
    try {
      const coords = await getCoords();
      if (!coords) {
        this.nearbyError.set(this.i18n.t('home.nearbyGpsDenied'));
        this.nearbyItems.set([]);
        return;
      }
      const list = await nearbyPoi(coords);
      this.nearbyItems.set(list);
    } catch {
      this.nearbyError.set(this.i18n.t('home.nearbyUnavailable'));
      this.nearbyItems.set([]);
    } finally {
      this.nearbyLoading.set(false);
    }
  }

  recTitle(rec: Recommendation): string {
    return this.i18n.t(rec.titleKey as MsgKey);
  }

  recBody(rec: Recommendation): string {
    return this.i18n.t(rec.bodyKey as MsgKey, rec.bodyParams);
  }

  async loadAiTip(): Promise<void> {
    if (!this.assistantOnline()) {
      return;
    }
    this.aiTipBusy.set(true);
    try {
      const lang = this.i18n.language();
      const reply = await fetchFuelTip(this.db, lang, (k) => this.i18n.t(k as MsgKey));
      this.aiTip.set(reply.text);
      this.aiTipSource.set(reply.source);
    } finally {
      this.aiTipBusy.set(false);
    }
  }

  dueLabel(): string {
    const due = this.nextDue();
    if (!due) {
      return this.i18n.t('home.nothingDue');
    }
    return this.i18n.t(due.labelKey as MsgKey, due.labelParams);
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
        const rows = list.querySelectorAll('.ledger-row, .ledger-card');
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

  carLabel(car: { nickname: string; plate?: string }): string {
    const plate = car.plate?.trim();
    return plate ? `${car.nickname} · ${plate}` : car.nickname;
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
    const locale = this.i18n.language() === 'ar' ? 'ar-EG-u-nu-arab' : 'en-GB';
    try {
      return new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: this.db.settings().currency,
        maximumFractionDigits: 0,
      }).format(value);
    } catch {
      return `${this.i18n.formatNumber(value)} ${this.db.settings().currency}`;
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

  ledgerDateLabel(date: string): string {
    return this.i18n.formatDate(date, { day: 'numeric', month: 'short' });
  }

  categoryLabel(cat: ExpenseCategory): string {
    return this.i18n.t(`charts.cat.${cat}` as MsgKey);
  }

  reportTitle(key: string): string {
    return this.i18n.t(key as MsgKey);
  }

  reportBody(key: string, params?: Record<string, string | number>): string {
    return this.i18n.t(key as MsgKey, params);
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
