import { DecimalPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Db } from '../../data/db';
import { todayDateOnly } from '../../domain/dues';
import {
  activePeriod,
  daysUntil,
  periodTotals,
} from '../../domain/expense-period';
import {
  buildExpenseLedger,
  ledgerCategoryTotals,
  type LedgerPeriodFilter,
} from '../../domain/expense-ledger';
import type { ExpenseCategory } from '../../domain/models';
import { buildSmartReports } from '../../domain/smart-reports';
import { I18n } from '../../i18n/i18n';
import type { MsgKey } from '../../i18n/en';

type HomeView = 'dashboard' | 'reports' | 'charts';
type ChartCategory = ExpenseCategory | 'all';

@Component({
  selector: 'app-home',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe],
  templateUrl: './home.html',
  styleUrl: './home.scss',
})
export class HomePage {
  readonly i18n = inject(I18n);
  readonly db = inject(Db);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly view = signal<HomeView>('dashboard');
  readonly chartCategory = signal<ChartCategory>('all');
  readonly chartPeriod = signal<LedgerPeriodFilter>('3m');
  readonly startingPeriod = signal(false);

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
  readonly reports = computed(() => {
    const car = this.db.car();
    if (!car) {
      return [];
    }
    return buildSmartReports({
      fills: this.db.fillUps(),
      maintenance: this.db.maintenance(),
      breakdowns: this.db.breakdowns(),
      other: this.db.otherExpenses(),
      period: this.period(),
      milestones: this.db.milestones(),
      odometer: car.currentOdometer,
    });
  });
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

  constructor() {
    this.route.queryParamMap.subscribe((params) => {
      const v = params.get('view');
      if (v === 'reports' || v === 'charts' || v === 'dashboard') {
        this.view.set(v);
      }
    });
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
    try {
      return new Intl.NumberFormat(this.i18n.language(), {
        style: 'currency',
        currency: this.db.settings().currency,
        maximumFractionDigits: 0,
      }).format(value);
    } catch {
      return `${value} ${this.db.settings().currency}`;
    }
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

  async startNewMonth(): Promise<void> {
    const carId = this.activeCarId();
    if (!carId) {
      return;
    }
    this.startingPeriod.set(true);
    try {
      await this.db.startNewPeriod(carId);
    } finally {
      this.startingPeriod.set(false);
    }
  }
}
