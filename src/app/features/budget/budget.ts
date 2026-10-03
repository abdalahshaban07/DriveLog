import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Db } from '../../data/db';
import {
  estimateExpectedCost,
  historicalMonthlyMaintenanceAverage,
  knownMaintenanceSpend,
  remainingMonthlyMaintenanceBudget,
  reserveTiers,
  type BudgetHealth,
} from '../../domain/budget-engine';
import {
  buildForecasts,
  estimateMonthlyKm,
  upcomingCostWindows,
  type ForecastBucket,
} from '../../domain/maintenance-forecast';
import { homeHealthSummary, todayDateOnly } from '../../domain/vehicle-facts';
import type { MsgKey } from '../../i18n/en';
import { I18n } from '../../i18n/i18n';
import { PageHeader } from '../../ui/page-header';
import { PrimaryButton } from '../../ui/primary-button';
import { NumericField } from '../../ui/numeric-field';
import { budgetPicture, type BudgetRung } from './budget-picture';

@Component({
  selector: 'app-budget',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PageHeader, PrimaryButton, NumericField],
  templateUrl: './budget.html',
  styleUrl: './budget.scss',
})
export class BudgetPage {
  readonly i18n = inject(I18n);
  readonly db = inject(Db);
  readonly router = inject(Router);

  readonly car = this.db.car;
  readonly budgetMonthly = signal('');
  readonly reserveTarget = signal('');
  readonly reserveBalance = signal('');
  private readonly savedStamp = signal('');
  readonly justSaved = signal(false);

  constructor() {
    const c = this.db.car();
    if (c) {
      this.budgetMonthly.set(
        c.maintenanceBudgetMonthly != null ? String(c.maintenanceBudgetMonthly) : '',
      );
      this.reserveTarget.set(c.reserveTargetMonthly != null ? String(c.reserveTargetMonthly) : '');
      this.reserveBalance.set(
        c.maintenanceReserveBalance != null ? String(c.maintenanceReserveBalance) : '',
      );
    }
    this.savedStamp.set(this.stamp());
  }

  readonly clean = computed(() => this.stamp() === this.savedStamp());

  readonly summary = computed(() => {
    const empty = {
      budgetHealth: 'UNKNOWN' as BudgetHealth,
      remaining: null as number | null,
      eligible90: 0,
      monthlyBudget: null as number | null,
      spent: 0,
      monthUnknown: 0,
      historical: null as number | null,
      reserve: null as number | null,
      reserveTarget: null as number | null,
      tiers: {
        minimum: null as number | null,
        recommended: null as number | null,
        comfortable: null as number | null,
      },
      forecasts: [] as ForecastBucket[],
    };
    const c = this.db.car();
    if (!c) return empty;
    const facts = homeHealthSummary(this.db).facts;
    if (!facts) return empty;
    const today = todayDateOnly();
    const currency = this.db.snapshotCurrency();
    const remaining = remainingMonthlyMaintenanceBudget(c, this.db.maintenance(), currency, today);
    const month = knownMaintenanceSpend(
      this.db.maintenance(),
      currency,
      (m) => (!m.carId || m.carId === c.id) && m.date.startsWith(today.slice(0, 7)),
    );
    const monthlyKm = estimateMonthlyKm({
      car: c,
      fills: this.db.fillUps(),
      maintenance: this.db.maintenance(),
      breakdowns: this.db.breakdowns(),
      today,
    });
    const estimate = (item: (typeof facts.healthItems)[number]) =>
      estimateExpectedCost(item.part, this.db.maintenance(), c.id, currency);
    const windows = upcomingCostWindows({
      items: facts.healthItems,
      today,
      monthlyKm,
      estimateCost: estimate,
    });
    const w90 = windows.find((w) => w.days === 90);
    const w180 = windows.find((w) => w.days === 180);
    const eligible90 = (w90?.known ?? 0) + (w90?.estimated ?? 0);
    const eligible180 = (w180?.known ?? 0) + (w180?.estimated ?? 0);
    const hist = historicalMonthlyMaintenanceAverage(c, this.db.maintenance(), currency, today);
    const budget = c.maintenanceBudgetMonthly;
    return {
      budgetHealth: facts.budgetHealth,
      remaining,
      eligible90,
      monthlyBudget: budget != null && budget > 0 ? budget : null,
      spent: month.known,
      monthUnknown: month.unknownCount,
      historical: hist != null && hist > 0 ? hist : null,
      reserve: c.maintenanceReserveBalance != null ? c.maintenanceReserveBalance : null,
      reserveTarget: c.reserveTargetMonthly != null ? c.reserveTargetMonthly : null,
      tiers: reserveTiers({
        historicalMonthly: hist,
        eligible90,
        eligible180,
      }),
      forecasts: buildForecasts({
        items: facts.healthItems,
        today,
        monthlyKm,
        estimateCost: estimate,
      }),
    };
  });

  readonly picture = computed(() => {
    const s = this.summary();
    return budgetPicture({
      monthlyBudget: s.monthlyBudget,
      spent: s.spent,
      remaining: s.remaining,
      reserve: s.reserve,
      eligible90: s.eligible90,
      tiers: s.tiers,
      forecasts: s.forecasts,
    });
  });

  healthLabel(): string {
    const h = this.summary().budgetHealth;
    return this.i18n.t(`budget.health.${h}` as MsgKey);
  }

  rungLabel(key: BudgetRung): string {
    switch (key) {
      case 'minimum':
        return this.i18n.t('budget.reserveMin');
      case 'recommended':
        return this.i18n.t('budget.reserveRec');
      case 'comfortable':
        return this.i18n.t('budget.reserveComfy');
      default: {
        const neverKey: never = key;
        return neverKey;
      }
    }
  }

  async save(): Promise<void> {
    const num = (s: string) => {
      const n = Number(s);
      return s.trim() === '' || !Number.isFinite(n) ? undefined : n;
    };
    await this.db.updateCar({
      maintenanceBudgetMonthly: num(this.budgetMonthly()),
      reserveTargetMonthly: num(this.reserveTarget()),
      maintenanceReserveBalance: num(this.reserveBalance()),
    });
    this.savedStamp.set(this.stamp());
    this.justSaved.set(true);
  }

  money(value: number): string {
    return this.i18n.formatMoney(value, this.db.settings().currency, 0);
  }

  private stamp(): string {
    return `${this.budgetMonthly()}|${this.reserveTarget()}|${this.reserveBalance()}`;
  }
}
